// Session management — stores the signed-in profile and app session token.
// Provider ID tokens are exchanged once at /auth/* and are not reused for data calls.

// One atomic record prevents another tab observing B's token with A's profile.
export const SESSION_KEY = 'wp_session.v2';
function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || {}; }
  catch { return {}; }
}
function writeSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function getSessionEpoch() { return readSession().epoch || ''; }
function advanceSessionEpoch() {
  writeSession({ ...readSession(), epoch: crypto.randomUUID() });
}
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

// ── Dev bypass ─────────────────────────────────────────────────────────────────
// Set VITE_DEV_BYPASS_AUTH=true in .env to skip Google sign-in during local dev.
// The backend accepts DEV_BYPASS_TOKEN only when LOCAL_AUTH_BYPASS=true.
// NEVER ALLOWED IN PRODUCTION.
const isProd = import.meta.env.PROD;
const isTest = import.meta.env.MODE === 'test';
export const DEV_BYPASS = !isProd && !isTest && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
export const DEV_BYPASS_TOKEN = 'dev-bypass-token';
export const DEV_USER = {
  sub:     'dev-user-local',
  provider: 'demo',
  name:    'Dev User',
  email:   'dev@localhost',
  picture: '',
};

// ── User profile ───────────────────────────────────────────────────────────────
/** @returns {{ sub: string, name: string, email: string, picture: string } | null} */
export function getStoredUser() { return readSession().user || null; }

export function storeUser(user) {
  const session = readSession();
  if (session.user?.sub === user?.sub) writeSession({ ...session, user });
  else writeSession({ user, epoch: crypto.randomUUID() });
}

export function clearStoredUser() {
  writeSession({ epoch: crypto.randomUUID() });
  // Retire legacy credentials. They cannot establish a v2 account binding.
  for (const key of ['wp_auth', 'wp_session_token', 'wp_session_exp', 'wp_session_epoch']) localStorage.removeItem(key);
}

export function storeCredential(token, expiresAt) {
  writeSession({ ...readSession(), token, expiresAt, epoch: crypto.randomUUID() });
}

export function storeSession(session) {
  writeSession({ user: session.user, token: session.token, expiresAt: session.expiresAt, epoch: crypto.randomUUID() });
}

export function getSessionSnapshot() {
  const session = readSession();
  if (DEV_BYPASS) return { user: DEV_USER, credential: DEV_BYPASS_TOKEN, epoch: session.epoch || '' };
  const expiresMs = Date.parse(session.expiresAt);
  const credential = session.token && Number.isFinite(expiresMs) && expiresMs - Date.now() > EXPIRY_BUFFER_MS
    ? session.token : null;
  // Reading an expired session must not clear a newer session another tab wrote.
  return { user: session.user || null, credential, epoch: session.epoch || '' };
}

export function getStoredCredential() { return getSessionSnapshot().credential; }

export function clearStoredCredential() {
  const { user, epoch } = readSession();
  writeSession({ user, epoch });
}

export async function exchangeGoogleCredential(credential) {
  advanceSessionEpoch();
  const attempt = getSessionEpoch();
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const payload = await parseResponse(res);
  if (getSessionEpoch() !== attempt) throw new Error('Sign-in was cancelled because the session changed.');
  storeSession(payload);
  return payload.user;
}

async function parseResponse(res) {
  const text = await res.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = null; }
  }
  if (!res.ok) {
    throw new Error(payload?.error || `Authentication failed (${res.status})`);
  }
  return payload;
}

// ── JWT decode ─────────────────────────────────────────────────────────────────
/**
 * Decode a Google ID token JWT payload (no signature verification —
 * trust comes from the fact that Google issued the token via their
 * OAuth endpoint, not from client-side sig checks).
 */
export function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}
