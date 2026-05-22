import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_ISSUER = 'workout-planner-api';
const SESSION_AUDIENCE = 'workout-planner-app';
const LOCAL_SESSION_SECRET = 'local-workout-planner-session-secret-change-me';

function isLocalRuntime() {
  return process.env.LOCAL_AUTH_BYPASS === 'true' || process.env.NODE_ENV === 'test';
}

function sessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isLocalRuntime()) return LOCAL_SESSION_SECRET;
  throw new Error('APP_SESSION_SECRET must be set to at least 32 characters');
}

function key() {
  return new TextEncoder().encode(sessionSecret());
}

function publicUser(user) {
  return {
    sub: user.sub,
    provider: user.provider,
    name: user.name ?? '',
    email: user.email ?? '',
    picture: user.picture ?? '',
  };
}

export async function createAppSession(user, now = new Date()) {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const safeUser = publicUser(user);
  const token = await new SignJWT({
    provider: safeUser.provider,
    name: safeUser.name,
    email: safeUser.email,
    picture: safeUser.picture,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(safeUser.sub)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: safeUser,
  };
}

export async function verifyAppSession(token) {
  const { payload } = await jwtVerify(token, key(), {
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
  });
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Invalid session');
  return {
    sub: payload.sub,
    provider: typeof payload.provider === 'string' ? payload.provider : 'unknown',
    name: typeof payload.name === 'string' ? payload.name : '',
    email: typeof payload.email === 'string' ? payload.email : '',
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  };
}

export function hashUserId(userId) {
  if (!userId) return undefined;
  return createHash('sha256').update(userId).digest('hex').slice(0, 12);
}
