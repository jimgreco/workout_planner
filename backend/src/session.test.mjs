import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.APP_SESSION_SECRET = 'test-session-secret-with-at-least-32-chars';

const { createAppSession, verifyAppSession } = await import('./session.mjs');

test('creates and verifies an app session', async () => {
  const session = await createAppSession({
    sub: 'user-1',
    provider: 'google',
    name: 'Test User',
    email: 'test@example.com',
    picture: 'https://example.com/avatar.png',
  });

  assert.equal(typeof session.token, 'string');
  assert.equal(session.user.sub, 'user-1');
  assert.equal(Date.parse(session.expiresAt) > Date.now(), true);

  const verified = await verifyAppSession(session.token);
  assert.equal(verified.sub, 'user-1');
  assert.equal(verified.provider, 'google');
  assert.equal(typeof verified.issuedAt, 'number');
});

test('rejects a tampered app session', async () => {
  const session = await createAppSession({ sub: 'user-1', provider: 'google' });
  const parts = session.token.split('.');
  const tampered = `${parts[0]}.${parts[1]}.tampered-signature`;
  await assert.rejects(() => verifyAppSession(tampered));
});

test('production rejects the development session secret even when bypass is misconfigured', async () => {
  const env = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_AUTH_BYPASS = 'true';
    delete process.env.APP_SESSION_SECRET;
    await assert.rejects(() => createAppSession({ sub: 'synthetic-user' }), /APP_SESSION_SECRET/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
