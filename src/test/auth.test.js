import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredCredential,
  getStoredCredential,
  storeCredential,
} from '../auth.js';

describe('web app sessions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a stored session token before the expiry buffer', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    storeCredential('session-token', future);
    expect(getStoredCredential()).toBe('session-token');
  });

  it('clears and hides expired session tokens', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    storeCredential('session-token', past);
    expect(getStoredCredential()).toBeNull();
    expect(localStorage.getItem('wp_session_token')).toBeNull();
  });

  it('clears stored session token and expiry', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    storeCredential('session-token', future);
    clearStoredCredential();
    expect(getStoredCredential()).toBeNull();
  });
});
