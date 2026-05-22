import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.TABLE_NAME = 'workout-planner-test';
process.env.GOOGLE_CLIENT_ID = 'google-client';
process.env.APPLE_CLIENT_IDS = 'com.workoutplanner.ios';
process.env.APP_SESSION_SECRET = 'test-session-secret-with-at-least-32-chars';

const { handler } = await import('./handler.mjs');

function event(method, rawPath, body, headers = {}) {
  return {
    rawPath,
    headers,
    requestContext: { http: { method } },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

test('healthz is unauthenticated', async () => {
  const result = await handler(event('GET', '/healthz'));
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).ok, true);
});

test('data routes require an app session', async () => {
  const result = await handler(event('GET', '/exercises'));
  assert.equal(result.statusCode, 401);
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
