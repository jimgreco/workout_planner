import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

function encryptionKey() {
  const key = Buffer.from(process.env.APPLE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Apple token encryption is not configured');
  return key;
}

export function encryptAppleToken(token, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64')).join('.');
}

export function decryptAppleToken(value, context) {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function clientSecret(clientId) {
  const { APPLE_TEAM_ID, APPLE_SIGN_IN_KEY_ID, APPLE_SIGN_IN_PRIVATE_KEY_BASE64 } = process.env;
  if (!APPLE_TEAM_ID || !APPLE_SIGN_IN_KEY_ID || !APPLE_SIGN_IN_PRIVATE_KEY_BASE64) {
    throw new Error('Apple token revocation is not configured');
  }
  const key = await importPKCS8(Buffer.from(APPLE_SIGN_IN_PRIVATE_KEY_BASE64, 'base64').toString('utf8'), 'ES256');
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: APPLE_SIGN_IN_KEY_ID })
    .setIssuer(APPLE_TEAM_ID).setSubject(clientId).setAudience('https://appleid.apple.com')
    .setIssuedAt().setExpirationTime('5m').sign(key);
}

async function appleRequest(endpoint, clientId, fields, fetchImpl) {
  const response = await fetchImpl(`https://appleid.apple.com/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(clientId), ...fields }),
    signal: AbortSignal.timeout(10000),
  });
  // Never include Apple's response body: it may contain credentials.
  if (!response.ok) throw new Error(`Apple ${endpoint} request failed (${response.status})`);
  return response;
}

export async function exchangeAppleCode({ code, clientId, subject, verifyIdentityToken, fetchImpl = fetch }) {
  encryptionKey();
  const response = await appleRequest('token', clientId, { code, grant_type: 'authorization_code' }, fetchImpl);
  const result = await response.json();
  const verified = await verifyIdentityToken(result.id_token);
  if (verified.providerSub !== subject || verified.appleClientId !== clientId || !result.refresh_token) {
    throw new Error('Apple authorization code does not match the signed-in account');
  }
  return result.refresh_token;
}

export async function revokeAppleTokens(items, fetchImpl = fetch) {
  const credentials = items.filter(item => item.SK.startsWith('APPLE_TOKEN#'));
  for (const item of credentials) {
    const token = decryptAppleToken(item.encryptedToken, `${item.PK}|${item.SK}`);
    await appleRequest('revoke', item.clientId, { token, token_type_hint: 'refresh_token' }, fetchImpl);
  }
  // Older clients never provided an authorization code. Account deletion must
  // still work; Apple documents manual revocation for these legacy accounts.
  return items.some(item => item.SK.startsWith('AUTH#apple:') &&
    !credentials.some(credential => credential.providerSub === item.SK.slice(5)));
}
