import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

process.env.NODE_ENV = 'test';
process.env.TABLE_NAME = 'workout-planner-test';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.APPLE_CLIENT_IDS = 'com.workoutplanner.ios';
process.env.APP_SESSION_SECRET = 'test-session-secret-with-at-least-32-chars';
process.env.APP_VERSION = 'test-version';
process.env.GIT_COMMIT = 'abcdef1';
process.env.BUILD_TIME = '2026-05-22T00:00:00Z';

const { createAppSession } = await import('./session.mjs');
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
  assert.equal(stale.statusCode, 409);

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
