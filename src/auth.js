// Session management — stores the signed-in profile and app session token.
// Provider ID tokens are exchanged once at /auth/* and are not reused for data calls.

const AUTH_KEY       = 'wp_auth';
const CRED_KEY       = 'wp_session_token';
const CRED_EXP_KEY   = 'wp_session_exp';
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
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
  catch { return null; }
}

export function storeUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(AUTH_KEY);
  clearStoredCredential();
}

// ── App session token ──────────────────────────────────────────────────────────
/**
 * Persist the signed app session so api.js can attach it to every data request.
 */
export function storeCredential(token, expiresAt) {
  localStorage.setItem(CRED_KEY, token);
  localStorage.setItem(CRED_EXP_KEY, expiresAt);
}

export function storeSession(session) {
  storeCredential(session.token, session.expiresAt);
  if (session.user) storeUser(session.user);
}

/**
 * Returns the stored app session token if it is still valid (with a 5 minute
 * buffer), otherwise returns null so callers can trigger re-authentication.
 */
export function getStoredCredential() {
  if (DEV_BYPASS) return DEV_BYPASS_TOKEN;
  const token = localStorage.getItem(CRED_KEY);
  const expiresAt = localStorage.getItem(CRED_EXP_KEY);
  if (!token || !expiresAt) return null;
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs - Date.now() <= EXPIRY_BUFFER_MS) {
    clearStoredCredential();
    return null;
  }
  return token;
}

export function clearStoredCredential() {
  localStorage.removeItem(CRED_KEY);
  localStorage.removeItem(CRED_EXP_KEY);
}

export async function exchangeGoogleCredential(credential) {
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const payload = await parseResponse(res);
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
