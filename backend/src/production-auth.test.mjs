import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'production';
process.env.LOCAL_AUTH_BYPASS = 'true';
process.env.APP_SESSION_SECRET = 'synthetic-production-session-secret-32-chars';
process.env.TABLE_NAME = 'synthetic-test-unused';
const { handler } = await import('./handler.mjs');

test('production never accepts the development bearer token even if bypass is configured', async () => {
  const result = await handler({ rawPath: '/settings', headers: { authorization: 'Bearer dev-bypass-token' }, requestContext: { http: { method: 'GET' } } });
  assert.equal(result.statusCode, 401);
});

test('expired sessions return unauthorized so clients can reauthenticate', async () => {
  const { createAppSession } = await import('./session.mjs');
  const expired = await createAppSession({ sub: 'synthetic-user' }, new Date('2020-01-01T00:00:00Z'));
  const result = await handler({ rawPath: '/settings', headers: { authorization: `Bearer ${expired.token}` }, requestContext: { http: { method: 'GET' } } });
  assert.equal(result.statusCode, 401);
});
