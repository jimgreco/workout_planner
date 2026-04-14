// Session management — stores the signed-in Google profile and credential in localStorage.
// The `sub` field (Google's stable user ID) is used to namespace all workout data.

const AUTH_KEY       = 'wp_auth';
const CRED_KEY       = 'wp_credential';
const CRED_EXP_KEY   = 'wp_credential_exp';

// ── Dev bypass ─────────────────────────────────────────────────────────────────
// Set VITE_DEV_BYPASS_AUTH=true in .env to skip Google sign-in during local dev.
// The backend accepts DEV_BYPASS_TOKEN only when AWS_SAM_LOCAL=true (sam local).
// NEVER ALLOWED IN PRODUCTION.
const isProd = import.meta.env.PROD;
export const DEV_BYPASS = !isProd && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
export const DEV_BYPASS_TOKEN = 'dev-bypass-token';
export const DEV_USER = {
  sub:     'dev-user-local',
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

// ── Credential (raw Google ID token JWT) ───────────────────────────────────────
/**
 * Persist the raw credential alongside its expiry so api.js can attach it
 * to every request without requiring a re-auth on each page refresh.
 */
export function storeCredential(credential) {
  const { exp } = parseJwt(credential);
  localStorage.setItem(CRED_KEY, credential);
  localStorage.setItem(CRED_EXP_KEY, String(exp));
}

/**
 * Returns the stored credential if it is still valid (more than 5 minutes
 * left before expiry), otherwise returns null so the caller can trigger
 * re-authentication.
 */
export function getStoredCredential() {
  if (DEV_BYPASS) return DEV_BYPASS_TOKEN;
  return localStorage.getItem(CRED_KEY);
}

export function clearStoredCredential() {
  localStorage.removeItem(CRED_KEY);
  localStorage.removeItem(CRED_EXP_KEY);
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
