import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

process.env.NODE_ENV = 'test';
process.env.TABLE_NAME = 'workout-planner-test';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.APPLE_CLIENT_IDS = 'com.workoutplanner.ios';
process.env.APP_SESSION_SECRET = 'test-session-secret-with-at-least-32-chars';
process.env.APP_VERSION = 'test-version';
process.env.GIT_COMMIT = 'abcdef1';
process.env.BUILD_TIME = '2026-05-22T00:00:00Z';

const { createAppSession, hashUserId } = await import('./session.mjs');
const { emailAliasPk } = await import('./account-linking.mjs');
const { __setTestDb, handler } = await import('./handler.mjs');

function event(method, rawPath, body, headers = {}) {
  return {
    rawPath,
    headers,
    requestContext: { http: { method } },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function fakeDb(seed = []) {
  const items = new Map(seed.map((item) => [`${item.PK}|${item.SK}`, item]));
  return {
    items,
    async send(command) {
      if (command instanceof GetCommand) {
        const { PK, SK } = command.input.Key;
        return { Item: items.get(`${PK}|${SK}`) };
      }
      if (command instanceof PutCommand) {
        const item = command.input.Item;
        items.set(`${item.PK}|${item.SK}`, item);
        return {};
      }
      if (command instanceof DeleteCommand) {
        const { PK, SK } = command.input.Key;
        items.delete(`${PK}|${SK}`);
        return {};
      }
      if (command instanceof BatchWriteCommand) {
        for (const requests of Object.values(command.input.RequestItems)) {
          for (const request of requests) {
            const key = request.DeleteRequest?.Key;
            if (key) items.delete(`${key.PK}|${key.SK}`);
          }
        }
        return {};
      }
      if (command instanceof QueryCommand) {
        const { ':pk': PK, ':prefix': prefix } = command.input.ExpressionAttributeValues;
        const queryItems = [...items.values()].filter((item) => (
          item.PK === PK && (!prefix || item.SK.startsWith(prefix))
        ));
        return { Items: queryItems.slice(0, command.input.Limit ?? queryItems.length) };
      }
      if (command instanceof ScanCommand) {
        const prefix = command.input.ExpressionAttributeValues?.[':prefix'];
        const scanItems = [...items.values()].filter((item) => (
          !prefix || item.SK.startsWith(prefix)
        ));
        return { Items: scanItems.slice(0, command.input.Limit ?? scanItems.length) };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };
}

test('healthz is unauthenticated', async () => {
  const result = await handler(event('GET', '/healthz'));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).ok, true);
  assert.match(result.headers['X-Request-Id'], /[0-9a-f-]{36}/);
});

test('version is unauthenticated and includes build metadata', async () => {
  const result = await handler(event('GET', '/version', undefined, { 'X-Request-Id': 'test-request-1' }));
  const body = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['X-Request-Id'], 'test-request-1');
  assert.deepEqual(body, {
    service: 'workout-planner-api',
    version: 'test-version',
    commit: 'abcdef1',
    builtAt: '2026-05-22T00:00:00Z',
  });
});

test('data routes require an app session', async () => {
  const result = await handler(event('GET', '/exercises'));
  assert.equal(result.statusCode, 401);
  assert.equal(typeof JSON.parse(result.body).requestId, 'string');
});

test('admin feedback route requires support secret', async () => {
  const originalSecret = process.env.ADMIN_SUPPORT_SECRET;
  __setTestDb(fakeDb());

  try {
    delete process.env.ADMIN_SUPPORT_SECRET;
    const unconfigured = await handler(event('GET', '/admin/feedback'));
    assert.equal(unconfigured.statusCode, 401);

    process.env.ADMIN_SUPPORT_SECRET = 'test-admin-support-secret';
    const wrongSecret = await handler(event('GET', '/admin/feedback', undefined, {
      'X-Admin-Support-Secret': 'wrong-secret',
    }));
    assert.equal(wrongSecret.statusCode, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_SUPPORT_SECRET;
    else process.env.ADMIN_SUPPORT_SECRET = originalSecret;
  }
});

test('admin feedback route returns sanitized recent feedback', async () => {
  const originalSecret = process.env.ADMIN_SUPPORT_SECRET;
  process.env.ADMIN_SUPPORT_SECRET = 'test-admin-support-secret';
  __setTestDb(fakeDb([
    { PK: 'USER#user-1', SK: 'FEEDBACK#2026-01-01T00:00:00.000Z#a', id: 'a', createdAt: '2026-01-01T00:00:00.000Z', message: 'Older', build: '1.0' },
    { PK: 'USER#user-2', SK: 'FEEDBACK#2026-01-02T00:00:00.000Z#b', id: 'b', createdAt: '2026-01-02T00:00:00.000Z', message: 'Newer', build: '1.1' },
    { PK: 'USER#user-2', SK: 'LOG#ignored', id: 'ignored', name: 'Ignored', date: '2026-01-02', exerciseItems: [], status: 'finished' },
  ]));

  try {
    const result = await handler(event('GET', '/admin/feedback?limit=1', undefined, {
      'X-Admin-Support-Secret': 'test-admin-support-secret',
    }));
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.items[0], {
      id: 'b',
      createdAt: '2026-01-02T00:00:00.000Z',
      message: 'Newer',
      build: '1.1',
      userHash: hashUserId('user-2'),
    });
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_SUPPORT_SECRET;
    else process.env.ADMIN_SUPPORT_SECRET = originalSecret;
  }
});

test('admin overview summarizes feedback builds', async () => {
  const originalSecret = process.env.ADMIN_SUPPORT_SECRET;
  process.env.ADMIN_SUPPORT_SECRET = 'test-admin-support-secret';
  __setTestDb(fakeDb([
    { PK: 'USER#user-1', SK: 'FEEDBACK#2026-01-01T00:00:00.000Z#a', id: 'a', createdAt: '2026-01-01T00:00:00.000Z', message: 'One', build: '1.0' },
    { PK: 'USER#user-2', SK: 'FEEDBACK#2026-01-02T00:00:00.000Z#b', id: 'b', createdAt: '2026-01-02T00:00:00.000Z', message: 'Two', build: '1.1' },
    { PK: 'USER#user-2', SK: 'FEEDBACK#2026-01-03T00:00:00.000Z#c', id: 'c', createdAt: '2026-01-03T00:00:00.000Z', message: 'Three', build: '1.1' },
  ]));

  try {
    const result = await handler(event('GET', '/admin/overview', undefined, {
      'X-Admin-Support-Secret': 'test-admin-support-secret',
    }));
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.service.service, 'workout-planner-api');
    assert.equal(body.feedback.scanned, 3);
    assert.equal(body.feedback.uniqueUsers, 2);
    assert.deepEqual(body.feedback.builds[0], { build: '1.1', count: 2 });
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_SUPPORT_SECRET;
    else process.env.ADMIN_SUPPORT_SECRET = originalSecret;
  }
});

test('admin account lookup returns read-only user summary by verified email alias', async () => {
  const originalSecret = process.env.ADMIN_SUPPORT_SECRET;
  process.env.ADMIN_SUPPORT_SECRET = 'test-admin-support-secret';
  __setTestDb(fakeDb([
    { PK: emailAliasPk('tester@example.com'), SK: 'ALIAS', accountSub: 'user-1', email: 'tester@example.com' },
    { PK: 'USER#user-1', SK: 'EXERCISE#bench', id: 'bench', name: 'Bench', muscleGroup: 'Chest' },
    { PK: 'USER#user-1', SK: 'TEMPLATE#push', id: 'push', name: 'Push', exerciseItems: [] },
    { PK: 'USER#user-1', SK: 'LOG#active', id: 'active', name: 'Active', date: '2026-01-03', exerciseItems: [], status: 'active' },
    { PK: 'USER#user-1', SK: 'LOG#done', id: 'done', name: 'Done', date: '2026-01-02', exerciseItems: [], status: 'finished' },
    { PK: 'USER#user-1', SK: 'FEEDBACK#2026-01-04T00:00:00.000Z#a', id: 'fb', createdAt: '2026-01-04T00:00:00.000Z', message: 'Help', build: '1.1' },
  ]));

  try {
    const result = await handler(event('GET', '/admin/accounts?email=tester%40example.com', undefined, {
      'X-Admin-Support-Secret': 'test-admin-support-secret',
    }));
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.found, true);
    assert.equal(body.account.userHash, hashUserId('user-1'));
    assert.equal(body.account.email, 'tester@example.com');
    assert.deepEqual(body.account.counts, { exercises: 1, templates: 1, logs: 2, programs: 0, feedback: 1 });
    assert.equal(body.account.activeWorkoutCount, 1);
    assert.equal(body.account.lastWorkoutDate, '2026-01-03');
  } finally {
    if (originalSecret === undefined) delete process.env.ADMIN_SUPPORT_SECRET;
    else process.env.ADMIN_SUPPORT_SECRET = originalSecret;
  }
});

test('auth routes reject malformed JSON before provider verification', async () => {
  const result = await handler({
    rawPath: '/auth/google',
    headers: {},
    requestContext: { http: { method: 'POST' } },
    body: '{not-json',
  });
  assert.equal(result.statusCode, 400);
  assert.match(JSON.parse(result.body).error, /valid JSON/);
});

test('log query supports optional date filters and cursors without changing default shape', async () => {
  __setTestDb(fakeDb([
    { PK: 'USER#dev-user-local', SK: 'LOG#one', id: 'one', name: 'One', date: '2026-01-01', exerciseItems: [], status: 'finished' },
    { PK: 'USER#dev-user-local', SK: 'LOG#two', id: 'two', name: 'Two', date: '2026-01-02', exerciseItems: [], status: 'finished' },
    { PK: 'USER#dev-user-local', SK: 'LOG#three', id: 'three', name: 'Three', date: '2026-01-03', exerciseItems: [], status: 'finished' },
  ]));

  const headers = { Authorization: 'Bearer dev-bypass-token' };
  const defaultResult = await handler(event('GET', '/logs', undefined, headers));
  assert.equal(defaultResult.statusCode, 200);
  assert.equal(JSON.parse(defaultResult.body).length, 3);

  const firstPage = await handler(event('GET', '/logs?from=2026-01-02&limit=1', undefined, headers));
  const firstBody = JSON.parse(firstPage.body);
  assert.equal(firstPage.statusCode, 200);
  assert.equal(firstBody.length, 1);
  assert.equal(firstBody[0].id, 'three');
  assert.equal(typeof firstPage.headers['X-Next-Cursor'], 'string');

  const secondPage = await handler(event('GET', `/logs?from=2026-01-02&limit=1&cursor=${encodeURIComponent(firstPage.headers['X-Next-Cursor'])}`, undefined, headers));
  const secondBody = JSON.parse(secondPage.body);
  assert.equal(secondBody.length, 1);
  assert.equal(secondBody[0].id, 'two');
  assert.equal(secondPage.headers['X-Next-Cursor'], undefined);
});

test('optional expectedRevision protects against stale overwrites', async () => {
  const db = fakeDb([
    { PK: 'USER#dev-user-local', SK: 'EXERCISE#bench', id: 'bench', name: 'Bench', muscleGroup: 'Chest', revision: 2 },
  ]);
  __setTestDb(db);
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const stale = await handler(event('PUT', '/exercises/bench', {
    id: 'bench',
    name: 'Bench',
    muscleGroup: 'Chest',
    expectedRevision: 1,
  }, headers));
  const staleBody = JSON.parse(stale.body);
  assert.equal(stale.statusCode, 409);
  assert.equal(staleBody.conflict.expectedRevision, 1);
  assert.equal(staleBody.conflict.actualRevision, 2);
  assert.equal(staleBody.conflict.remote.name, 'Bench');

  const fresh = await handler(event('PUT', '/exercises/bench', {
    id: 'bench',
    name: 'Bench Press',
    muscleGroup: 'Chest',
    expectedRevision: 2,
  }, headers));
  const body = JSON.parse(fresh.body);
  assert.equal(fresh.statusCode, 200);
  assert.equal(body.revision, 3);
  assert.equal(typeof body.updatedAt, 'string');
});

test('program routes persist weekly routine schedules', async () => {
  const db = fakeDb([
    { PK: 'USER#dev-user-local', SK: 'TEMPLATE#push', id: 'push', name: 'Push', exerciseItems: [] },
    { PK: 'USER#dev-user-local', SK: 'TEMPLATE#pull', id: 'pull', name: 'Pull', exerciseItems: [] },
  ]);
  __setTestDb(db);
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const saved = await handler(event('PUT', '/programs/strength', {
    id: 'strength',
    name: 'Strength Block',
    description: 'Simple weekly plan',
    active: true,
    progressionRule: 'Add weight when all sets hit the target.',
    schedule: [
      { weekday: 1, templateId: 'push', notes: 'Heavy' },
      { weekday: 1, templateId: 'pull' },
      { weekday: 3, templateId: 'push' },
    ],
  }, headers));
  const savedBody = JSON.parse(saved.body);

  assert.equal(saved.statusCode, 200);
  assert.equal(savedBody.id, 'strength');
  assert.equal(savedBody.revision, 1);
  assert.deepEqual(savedBody.schedule.map((item) => `${item.weekday}:${item.templateId}`), ['1:push', '1:pull', '3:push']);

  const listed = await handler(event('GET', '/programs', undefined, headers));
  const listBody = JSON.parse(listed.body);
  assert.equal(listed.statusCode, 200);
  assert.equal(listBody.length, 1);
  assert.equal(listBody[0].name, 'Strength Block');

  const deleted = await handler(event('DELETE', '/programs/strength', undefined, headers));
  assert.equal(deleted.statusCode, 204);
  assert.equal(db.items.has('USER#dev-user-local|PROGRAM#strength'), false);
});

test('import restores Forge export data into an empty account', async () => {
  const db = fakeDb();
  __setTestDb(db);
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const result = await handler(event('POST', '/import', {
    mode: 'emptyOnly',
    data: {
      settings: { defaultSets: 5, defaultReps: 6 },
      exercises: [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }],
      templates: [{ id: 'push', name: 'Push', exerciseItems: [{ exerciseId: 'bench', sets: [{ reps: '6', weight: '100' }] }] }],
      logs: [{ id: 'done', name: 'Done', date: '2026-01-02', exerciseItems: [], status: 'finished' }],
      programs: [{ id: 'program', name: 'Push Plan', active: true, schedule: [{ weekday: 1, templateId: 'push' }] }],
    },
  }, headers));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.imported, { exercises: 1, templates: 1, logs: 1, programs: 1, settings: true });
  assert.equal(db.items.get('USER#dev-user-local|SETTINGS').defaultSets, 5);
  assert.equal(db.items.get('USER#dev-user-local|EXERCISE#bench').revision, 1);
  assert.equal(db.items.get('USER#dev-user-local|TEMPLATE#push').exerciseItems[0].exerciseId, 'bench');
  assert.equal(db.items.get('USER#dev-user-local|LOG#done').status, 'finished');
  assert.equal(db.items.get('USER#dev-user-local|PROGRAM#program').schedule[0].templateId, 'push');
});

test('empty-only import refuses to restore over existing account data', async () => {
  __setTestDb(fakeDb([
    { PK: 'USER#dev-user-local', SK: 'EXERCISE#existing', id: 'existing', name: 'Existing', muscleGroup: 'Chest' },
  ]));
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const result = await handler(event('POST', '/import', {
    mode: 'emptyOnly',
    data: {
      exercises: [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }],
      templates: [],
      logs: [],
    },
  }, headers));

  assert.equal(result.statusCode, 409);
});

test('merge import renames duplicate exercise and routine names', async () => {
  const db = fakeDb([
    { PK: 'USER#dev-user-local', SK: 'EXERCISE#existing-bench', id: 'existing-bench', name: 'Bench', muscleGroup: 'Chest' },
    { PK: 'USER#dev-user-local', SK: 'TEMPLATE#existing-push', id: 'existing-push', name: 'Push', exerciseItems: [] },
    { PK: 'USER#dev-user-local', SK: 'PROGRAM#existing-plan', id: 'existing-plan', name: 'Strength Plan', schedule: [] },
  ]);
  __setTestDb(db);
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const result = await handler(event('POST', '/import', {
    mode: 'merge',
    data: {
      exercises: [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }],
      templates: [{ id: 'push', name: 'Push', exerciseItems: [] }],
      logs: [],
      programs: [{ id: 'plan', name: 'Strength Plan', schedule: [{ weekday: 1, templateId: 'push' }] }],
    },
  }, headers));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.renamed.exercises, [{ from: 'Bench', to: 'Bench (imported)' }]);
  assert.deepEqual(body.renamed.templates, [{ from: 'Push', to: 'Push (imported)' }]);
  assert.deepEqual(body.renamed.programs, [{ from: 'Strength Plan', to: 'Strength Plan (imported)' }]);
  assert.equal(db.items.get('USER#dev-user-local|EXERCISE#bench').name, 'Bench (imported)');
  assert.equal(db.items.get('USER#dev-user-local|TEMPLATE#push').name, 'Push (imported)');
  assert.equal(db.items.get('USER#dev-user-local|PROGRAM#plan').name, 'Strength Plan (imported)');
});

test('merge import skips existing IDs instead of overwriting account data', async () => {
  const db = fakeDb([
    { PK: 'USER#dev-user-local', SK: 'EXERCISE#bench', id: 'bench', name: 'Current Bench', muscleGroup: 'Chest' },
    { PK: 'USER#dev-user-local', SK: 'LOG#done', id: 'done', name: 'Current Log', date: '2026-01-02', exerciseItems: [], status: 'finished' },
    { PK: 'USER#dev-user-local', SK: 'PROGRAM#program', id: 'program', name: 'Current Plan', schedule: [] },
  ]);
  __setTestDb(db);
  const headers = { Authorization: 'Bearer dev-bypass-token' };

  const result = await handler(event('POST', '/import', {
    mode: 'merge',
    data: {
      exercises: [{ id: 'bench', name: 'Imported Bench', muscleGroup: 'Back' }],
      templates: [],
      logs: [{ id: 'done', name: 'Imported Log', date: '2026-01-02', exerciseItems: [], status: 'finished' }],
      programs: [{ id: 'program', name: 'Imported Plan', schedule: [] }],
    },
  }, headers));
  const body = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(body.imported, { exercises: 0, templates: 0, logs: 0, programs: 0, settings: false });
  assert.deepEqual(body.skipped.exercises, [{ id: 'bench', name: 'Imported Bench' }]);
  assert.deepEqual(body.skipped.logs, [{ id: 'done', name: 'Imported Log', date: '2026-01-02' }]);
  assert.deepEqual(body.skipped.programs, [{ id: 'program', name: 'Imported Plan' }]);
  assert.equal(db.items.get('USER#dev-user-local|EXERCISE#bench').name, 'Current Bench');
  assert.equal(db.items.get('USER#dev-user-local|LOG#done').name, 'Current Log');
  assert.equal(db.items.get('USER#dev-user-local|PROGRAM#program').name, 'Current Plan');
});

test('account deletion revokes already-issued app sessions', async () => {
  const db = fakeDb([
    { PK: 'USER#user-1', SK: 'LOG#old', id: 'old', name: 'Old', date: '2026-01-01', exerciseItems: [], status: 'finished' },
  ]);
  __setTestDb(db);
  const session = await createAppSession({ sub: 'user-1', provider: 'google' });
  const headers = { Authorization: `Bearer ${session.token}` };

  const deleted = await handler(event('DELETE', '/account', undefined, headers));
  assert.equal(deleted.statusCode, 200);
  assert.equal(db.items.has('USER#user-1|LOG#old'), false);
  assert.equal(typeof db.items.get('USER#user-1|ACCOUNT').tokenRevokedBefore, 'string');

  const afterDelete = await handler(event('GET', '/logs', undefined, headers));
  assert.equal(afterDelete.statusCode, 401);
});
