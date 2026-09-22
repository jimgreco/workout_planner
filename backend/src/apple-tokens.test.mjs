import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { jwtVerify } from 'jose';
import { encryptAppleToken, decryptAppleToken, exchangeAppleCode, revokeAppleTokens } from './apple-tokens.mjs';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
process.env.APPLE_TEAM_ID = 'test-team';
process.env.APPLE_SIGN_IN_KEY_ID = 'test-key';
process.env.APPLE_SIGN_IN_PRIVATE_KEY_BASE64 = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
process.env.APPLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

const clientId = 'com.workoutplanner.ios';
const subject = 'apple:person';
const verifyIdentityToken = async token => {
  assert.equal(token, 'verified-id-token');
  return { providerSub: subject, appleClientId: clientId };
};

test('code exchange signs the correct client secret and binds the returned token to the same account', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://appleid.apple.com/auth/token');
    assert.equal(options.body.get('code'), 'single-use-code');
    assert.equal(options.body.get('grant_type'), 'authorization_code');
    const { payload } = await jwtVerify(options.body.get('client_secret'), publicKey, {
      issuer: 'test-team', audience: 'https://appleid.apple.com', subject: clientId,
    });
    assert.ok(payload.exp - payload.iat <= 300);
    return Response.json({ id_token: 'verified-id-token', refresh_token: 'private-refresh-token' });
  };
  assert.equal(await exchangeAppleCode({ code: 'single-use-code', clientId, subject, verifyIdentityToken, fetchImpl }), 'private-refresh-token');
  await assert.rejects(exchangeAppleCode({ code: 'single-use-code', clientId, subject: 'apple:someone-else', verifyIdentityToken, fetchImpl }), /does not match/);
});

test('stored tokens are encrypted and bound to their account and record', () => {
  const encrypted = encryptAppleToken('secret-refresh', 'account|record');
  assert.ok(!encrypted.includes('secret-refresh'));
  assert.equal(decryptAppleToken(encrypted, 'account|record'), 'secret-refresh');
  assert.throws(() => decryptAppleToken(encrypted, 'other-account|record'));
});

test('all Apple credentials are revoked, including when deletion is initiated through Google', async () => {
  const calls = [];
  const items = [{ SK: 'AUTH#apple:person' }, ...['native', 'web'].map(clientId => {
    const PK = 'USER#google-person'; const SK = `APPLE_TOKEN#apple:person#${clientId}`;
    return { PK, SK, providerSub: subject, clientId, encryptedToken: encryptAppleToken(`refresh-${clientId}`, `${PK}|${SK}`) };
  })];
  assert.equal(await revokeAppleTokens(items, async (url, options) => {
    assert.equal(url, 'https://appleid.apple.com/auth/revoke');
    assert.equal(options.body.get('token_type_hint'), 'refresh_token');
    calls.push(options.body.get('token'));
    return new Response(null, { status: 200 });
  }), false);
  assert.deepEqual(calls, ['refresh-native', 'refresh-web']);
  await assert.rejects(revokeAppleTokens(items, async () => new Response('sensitive body', { status: 503 })), /Apple revoke request failed \(503\)/);
});

test('legacy Apple accounts request manual revocation; Google-only accounts do not', async () => {
  assert.equal(await revokeAppleTokens([{ SK: 'AUTH#apple:legacy' }]), true);
  assert.equal(await revokeAppleTokens([{ SK: 'AUTH#google-user' }]), false);
});
