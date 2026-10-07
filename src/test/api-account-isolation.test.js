import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeSession, clearStoredUser, exchangeGoogleCredential, getStoredUser } from '../auth.js';
import {
  saveLog, saveExercise, getLogs, getExercises, pendingChangeCount, resetData,
  flushPendingChanges, flushPendingLogSaves, flushPendingResourceChanges,
  hasQuarantinedPendingChanges, getPendingConflicts, deleteAccount, initData, deleteLog,
} from '../api.js';

const login = sub => storeSession({ token: `synthetic-${sub}`, expiresAt: '2099-01-01T00:00:00Z', user: { sub } });
const response = (body, status = 200) => ({ status, ok: status < 400, json: async () => body, text: async () => JSON.stringify(body) });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { localStorage.clear(); login('A'); resetData(); vi.restoreAllMocks(); });

describe.each([
  { kind: 'logs', save: saveLog, get: getLogs, flush: flushPendingLogSaves },
  { kind: 'exercises', save: saveExercise, get: getExercises, flush: flushPendingResourceChanges },
])('$kind account boundaries', ({ save, get, flush }) => {
  it('retains A work across sign-out, hides it from B, and replays only after A returns', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    await save({ id: 'a-only', name: 'Synthetic A' });
    clearStoredUser(); resetData();
    expect(pendingChangeCount()).toBe(0);
    login('B');
    expect(get()).toEqual([]);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    login('A');
    expect(pendingChangeCount()).toBe(1);
    fetch.mockResolvedValue(response({ id: 'a-only', revision: 1 }));
    await flush();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer synthetic-A');
    expect(pendingChangeCount()).toBe(0);
  });

  it.each(['success', 'offline', '401'])('quarantines late %s from an initial save after an account switch', async outcome => {
    const held = deferred();
    globalThis.fetch = vi.fn().mockReturnValue(held.promise);
    const saving = save({ id: 'in-flight', name: 'Synthetic A' });
    const rejected = expect(saving).rejects.toMatchObject({ name: 'AccountChangedError' });
    login('B'); resetData();
    const authError = vi.fn();
    window.addEventListener('wp:auth-error', authError);
    if (outcome === 'offline') held.reject(new TypeError('offline'));
    else held.resolve(response({ id: 'in-flight' }, outcome === '401' ? 401 : 200));
    await rejected;
    expect(authError).not.toHaveBeenCalled();
    window.removeEventListener('wp:auth-error', authError);
    expect(getStoredUser().sub).toBe('B');
    expect(pendingChangeCount()).toBe(0);
    expect(get()).toEqual([]);
    login('A');
    expect(pendingChangeCount()).toBe(1);
  });

  it('fences A → B → A and stops the remainder of an old flush', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    await save({ id: 'one', name: 'One' }); await save({ id: 'two', name: 'Two' });
    const held = deferred(); fetch.mockReset().mockReturnValue(held.promise);
    const syncing = flush();
    const rejected = expect(syncing).rejects.toMatchObject({ name: 'AccountChangedError' });
    login('B'); login('A');
    held.resolve(response({ id: 'one', revision: 1 }));
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(pendingChangeCount()).toBe(2);
  });
});

it('preserves unowned legacy bytes without exposing or replaying them', async () => {
  const keys = ['forge.pendingLogSaves.v1', 'forge.pendingResourceChanges.v1', 'forge.pendingConflicts.v1'];
  for (const key of keys) localStorage.setItem(key, '[{"id":"synthetic-unknown-owner"}]');
  globalThis.fetch = vi.fn();
  expect(hasQuarantinedPendingChanges()).toBe(true);
  expect(pendingChangeCount()).toBe(0);
  expect(getPendingConflicts()).toEqual([]);
  await flushPendingChanges();
  clearStoredUser(); resetData(); login('B');
  await flushPendingChanges();
  expect(fetch).not.toHaveBeenCalled();
  for (const key of keys) expect(localStorage.getItem(key)).toBe('[{"id":"synthetic-unknown-owner"}]');
});

it('does not restore an old sign-in response after sign-out or another sign-in', async () => {
  const held = deferred(); globalThis.fetch = vi.fn().mockReturnValue(held.promise);
  const signingIn = exchangeGoogleCredential('synthetic-provider-token');
  const rejected = expect(signingIn).rejects.toThrow('session changed');
  clearStoredUser(); login('B');
  held.resolve(response({ token: 'synthetic-A', expiresAt: '2099-01-01', user: { sub: 'A' } }));
  await rejected;
  expect(getStoredUser().sub).toBe('B');
});

it('successful account deletion clears only its owned work and fences delayed writes', async () => {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
  login('B'); await saveLog({ id: 'b-kept' }); login('A');
  const held = deferred(); fetch.mockReset().mockReturnValueOnce(held.promise).mockResolvedValue(response({ deleted: true }));
  const saving = saveLog({ id: 'a-late' });
  const rejected = expect(saving).rejects.toMatchObject({ name: 'AccountChangedError' });
  await deleteAccount();
  held.reject(new TypeError('offline'));
  await rejected;
  expect(pendingChangeCount()).toBe(0);
  login('B'); expect(pendingChangeCount()).toBe(1);
});

it('never rebinds a captured queue to another tab changing the session between storage reads', async () => {
  const originalGetItem = Storage.prototype.getItem;
  for (let boundary = 1; boundary <= 24; boundary += 1) {
    localStorage.clear(); login('A'); resetData();
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    await saveLog({ id: 'a-only', name: 'Synthetic A' });
    fetch.mockReset().mockResolvedValue(response({ id: 'a-only', revision: 1 }));
    let reads = 0;
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === 'wp_session.v2' && ++reads === boundary) login('B');
      return originalGetItem.call(this, key);
    });
    try {
      await flushPendingLogSaves().catch(error => expect(error.name).toBe('AccountChangedError'));
      for (const [, options] of fetch.mock.calls) expect(options.headers.Authorization, `storage read ${boundary}`).toBe('Bearer synthetic-A');
    } finally { spy.mockRestore(); }
  }
});

it('journals an initial save only under its captured owner when another tab switches during the queue read', async () => {
  const originalGetItem = Storage.prototype.getItem;
  let switched = false;
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
    const value = originalGetItem.call(this, key);
    if (key === 'forge.pendingLogSaves.v2:A' && !switched) { switched = true; login('B'); }
    return value;
  });
  globalThis.fetch = vi.fn();
  try {
    await expect(saveLog({ id: 'a-only', name: 'Synthetic A' })).rejects.toMatchObject({ name: 'AccountChangedError' });
    expect(pendingChangeCount()).toBe(0);
    expect(localStorage.getItem('forge.pendingLogSaves.v2:B')).toBeNull();
    login('A'); expect(pendingChangeCount()).toBe(1);
  } finally { spy.mockRestore(); }
});


it('restores paused timing from its offline queue and preserves resume, finish and discard', async () => {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
  const paused = { id: 'pause-queue', name: 'Paused', status: 'active', startTime: '2026-10-05T10:00:00Z', pausedAt: Date.parse('2026-10-05T10:01:00Z'), pausedDurationMs: 60000, exerciseItems: [{ exerciseId: 'bench', sets: [{ reps: '8', rir: '0', restStartTime: Date.parse('2026-10-05T10:00:50Z') }] }] };
  await saveLog(paused);
  resetData();
  fetch.mockImplementation(async url => response(url.endsWith('/settings') ? {} : []));
  await initData();
  expect(getLogs()[0]).toMatchObject(paused);
  fetch.mockRejectedValue(new TypeError('offline'));
  await saveLog({ ...paused, pausedAt: null, pausedDurationMs: 120000 });
  expect(getLogs()[0]).toMatchObject({ pausedAt: null, pausedDurationMs: 120000 });
  await saveLog({ ...paused, status: 'finished', pausedAt: null, pausedDurationMs: 180000, endTime: '2026-10-05T10:10:00Z' });
  expect(getLogs()[0]).toMatchObject({ status: 'finished', pausedAt: null, pausedDurationMs: 180000 });
  await deleteLog(paused.id);
  expect(getLogs()).toEqual([]);
  resetData();
  fetch.mockImplementation(async url => response(url.endsWith('/settings') ? {} : url.endsWith('/logs') ? [paused] : []));
  await initData();
  expect(getLogs()).toEqual([]);
});

it('equipment choices survive offline queue restart and remain account-bound through late responses and deletion', async () => {
  const { newWorkoutEquipment } = await import('../equipmentSetups.js');
  const setup = { id: 'home', machine: 'Synthetic bench' };
  const exercise = { id: 'press', name: 'Press', equipmentSetups: [setup] };
  const item = { exerciseId: 'press', setupProfile: setup, baselineId: setup.id, setupSelectionMade: true, targetRIR: 2, sets: [] };
  const finished = { id: 'setup-session', name: 'Synthetic', date: '2026-10-07', status: 'finished', exerciseItems: [item] };
  const preference = () => newWorkoutEquipment({ exerciseId: 'press' }, getExercises().find(e => e.id === 'press'), getLogs()).setupProfile;
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
  await saveExercise(exercise); await saveLog(finished);
  expect(preference()).toEqual(setup);
  resetData();
  fetch.mockImplementation(async url => response(url.endsWith('/settings') ? {} : []));
  await initData();
  expect(preference()).toEqual(setup);
  expect(getLogs()[0].exerciseItems[0]).toMatchObject({ setupSelectionMade: true, targetRIR: 2 });
  // A held default/source load cannot leak into another account, including A→B→A.
  const held = deferred(); fetch.mockReturnValue(held.promise);
  const loading = initData();
  const rejected = expect(loading).rejects.toMatchObject({ name: 'AccountChangedError' });
  login('B'); resetData();
  held.resolve(response([finished])); await rejected;
  expect(preference()).toBeUndefined();
  expect(getLogs()).toEqual([]);
  login('A'); resetData();
  fetch.mockImplementation(async url => response(url.endsWith('/settings') ? {} : []));
  await initData();
  expect(preference()).toEqual(setup);
  fetch.mockRejectedValue(new TypeError('offline'));
  await saveExercise({ ...exercise, equipmentSetups: [], deletedEquipmentSetupIds: [setup.id] });
  expect(preference()).toBeUndefined();
  expect(getLogs()[0].exerciseItems[0].setupProfile).toEqual(setup);
  resetData();
  fetch.mockImplementation(async url => response(url.endsWith('/settings') ? {} : []));
  await initData();
  expect(preference()).toBeUndefined();
});

it('resumes the latest pending setup before an older response and hides queued deletion', async () => {
  const setupA = { id: 'a', machine: 'A' }, setupB = { id: 'b', machine: 'B' };
  const log = profile => ({ id: 'slow-setup', status: 'active', exerciseItems: [{ exerciseId: 'press', setupProfile: profile, setupSelectionMade: true, sets: [] }] });
  const first = deferred(), second = deferred();
  globalThis.fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const older = saveLog(log(setupA));
  expect(getLogs()[0].exerciseItems[0].setupProfile).toEqual(setupA);
  const newer = saveLog(log(setupB));
  expect(getLogs()[0].exerciseItems[0].setupProfile).toEqual(setupB);
  first.resolve(response(log(setupA))); await older;
  expect(getLogs()[0].exerciseItems[0].setupProfile).toEqual(setupB);
  second.resolve(response(log(setupB))); await newer;
  const deletion = deferred(); fetch.mockReturnValue(deletion.promise);
  const deleting = deleteLog('slow-setup');
  expect(getLogs()).toEqual([]);
  deletion.resolve(response(null, 204)); await deleting;
  expect(getLogs()).toEqual([]);
});
