// Session management — stores the signed-in Google profile in localStorage.
// The `sub` field (Google's stable user ID) is used to namespace all workout data.

const AUTH_KEY = 'wp_auth';

/** @returns {{ sub: string, name: string, email: string, picture: string } | null} */
export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

export function storeUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(AUTH_KEY);
}

/**
 * Decode a Google ID token JWT payload (no signature verification —
 * trust comes from the fact that Google issued the token via their
 * OAuth endpoint, not from client-side sig checks).
 */
export function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}
