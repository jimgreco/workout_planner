import { beforeEach, expect, it, vi } from 'vitest';
import { storeSession } from '../auth.js';
import { beginLegacyRecovery, exportLegacyRecovery, reviewLegacyRecord, getPendingConflicts, resolvePendingConflict, pendingChangeCount, resetData, flushPendingChanges, saveLog } from '../api.js';
const key = 'forge.pendingLogSaves.v1';
const login = sub => storeSession({ token: `synthetic-${sub}`, expiresAt: '2099-01-01T00:00:00Z', user: { sub } });
const response = (body, status = 200) => ({ status, ok: status < 400, json: async () => body, text: async () => JSON.stringify(body) });
const original = { id: 'legacy-log', name: 'Synthetic retained workout', date: '2026-10-07', pausedAt: 1791367200000, pausedDurationMs: 17000, exerciseItems: [{ exerciseId: 'bench', targetRIR: 2, sets: [{ rir: 0, reps: '8' }] }] };
const begin = () => beginLegacyRecovery('A', true);
beforeEach(() => { localStorage.clear(); login('A'); resetData(); localStorage.setItem(key, JSON.stringify([original])); globalThis.fetch = vi.fn().mockResolvedValue(response([{ ...original, revision: 7 }])); });

it('requires explicit original-account attribution before exposing a review', () => {
  expect(() => beginLegacyRecovery('B', true)).toThrow();
  expect(() => beginLegacyRecovery('A', false)).toThrow();
  expect(begin().records[0].local).toEqual(original);
  expect(fetch).not.toHaveBeenCalled();
});
it('stages an atomic retained comparison, never auto-replays, then uses the positive reviewed revision', async () => {
  const source = localStorage.getItem(key); const review = begin();
  await reviewLegacyRecord(review, review.records[0].id, 'stage');
  expect(fetch.mock.calls[0][1].method).toBe('GET');
  expect(pendingChangeCount()).toBe(0);
  const conflict = getPendingConflicts()[0];
  expect(conflict.local).toEqual(original);
  expect(conflict.actualRevision).toBe(7);
  resetData();
  expect(getPendingConflicts()).toEqual([conflict]);
  await flushPendingChanges();
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(response({ ...original, revision: 1 }));
  await resolvePendingConflict(conflict.id, 'local');
  const body = JSON.parse(fetch.mock.calls[1][1].body);
  expect(body.expectedRevision).toBe(7);
  expect(body.exerciseItems[0].targetRIR).toBe(2);
  expect(body.exerciseItems[0].sets[0].rir).toBe(0);
  expect(body.pausedAt).toBe(original.pausedAt);
  expect(localStorage.getItem(key)).toBe(source);
  expect(getPendingConflicts()).toEqual([]);
  await expect(reviewLegacyRecord(begin(), review.records[0].id, 'stage')).rejects.toThrow('already reviewed');
});
it('retries a lost/conflicting response with the same item and reviewed revision, preserving source and comparison', async () => {
  fetch.mockResolvedValue(response([{ ...original, revision: 7 }]));
  const review = begin(); await reviewLegacyRecord(review, review.records[0].id, 'stage');
  const conflict = getPendingConflicts()[0];
  fetch.mockResolvedValue(response({ error: 'Resource was updated elsewhere', conflict: { actualRevision: 8 } }, 409));
  await expect(resolvePendingConflict(conflict.id, 'local')).rejects.toThrow();
  await expect(resolvePendingConflict(conflict.id, 'local')).rejects.toThrow();
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
  expect(JSON.parse(fetch.mock.calls[1][1].body).expectedRevision).toBe(7);
  expect(getPendingConflicts()[0]).toEqual(conflict);
});
it('fences A→B→A and a late cloud read without attributing or staging anything', async () => {
  let done; fetch.mockImplementation(() => new Promise(resolve => { done = resolve; }));
  const review = begin(); const stage = reviewLegacyRecord(review, review.records[0].id, 'stage');
  login('B'); login('A'); done(response([]));
  await expect(stage).rejects.toMatchObject({ name: 'AccountChangedError' });
  expect(getPendingConflicts()).toEqual([]);
  expect(() => exportLegacyRecovery(review)).toThrow();
});
it('never overrides newer pending work and rechecks sources after the network wait', async () => {
  fetch.mockRejectedValue(new TypeError('offline'));
  await saveLog({ ...original, name: 'New edit' });
  fetch.mockResolvedValue(response([]));
  const review = begin();
  await expect(reviewLegacyRecord(review, review.records[0].id, 'stage')).rejects.toThrow('newer pending');
  expect(pendingChangeCount()).toBe(1);
  localStorage.setItem(key, '[{"id":"different-source"}]');
  expect(() => exportLegacyRecovery(review)).toThrow('source changed');
});
it('set aside retains originals, repeated decisions are blocked, and other accounts cannot export claimed sources', async () => {
  const review = begin(); const source = localStorage.getItem(key);
  await reviewLegacyRecord(review, review.records[0].id, 'archive');
  expect(getPendingConflicts()).toEqual([]); expect(localStorage.getItem(key)).toBe(source);
  expect(JSON.parse(exportLegacyRecovery(review)).sources[0].raw).toBe(source);
  await reviewLegacyRecord(review, review.records[0].id, 'restore');
  expect(review.records[0].state).toBe('preserved');
  expect(fetch).not.toHaveBeenCalled();
  login('B'); const other = beginLegacyRecovery('B', true);
  expect(other.records[0].state).toBe('another-account');
  expect(other.records[0].preview).not.toContain(original.name);
  expect(exportLegacyRecovery(other)).not.toContain(original.name);
  await expect(reviewLegacyRecord(other, other.records[0].id, 'stage')).rejects.toThrow();
});
it('never stages deletions, malformed records, corrupt receipts, or unversioned cloud copies', async () => {
  localStorage.setItem(key, JSON.stringify([{ id: original.id, operation: 'delete' }]));
  const deleted = begin(); expect(deleted.records[0].recoverable).toBeFalsy();
  await expect(reviewLegacyRecord(deleted, deleted.records[0].id, 'stage')).rejects.toThrow();
  localStorage.setItem(key, 'broken bytes');
  expect(begin().records[0].state).toBe('unreadable');
  expect(exportLegacyRecovery(begin())).toContain('broken bytes');
  localStorage.setItem(key, JSON.stringify([original]));
  fetch.mockResolvedValue(response([original]));
  const review = begin(); await expect(reviewLegacyRecord(review, review.records[0].id, 'stage')).rejects.toThrow('export-only');
  localStorage.setItem('forge.legacyRecoveryReview.v1', 'corrupt');
  expect(() => begin()).toThrow(); expect(localStorage.getItem('forge.legacyRecoveryReview.v1')).toBe('corrupt');
});

it('a set-aside decision while comparison is in flight cancels staging, even after return to review', async () => {
  let finish; fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const review = begin();
  const stage = reviewLegacyRecord(review, review.records[0].id, 'stage');
  const anotherReview = begin();
  await reviewLegacyRecord(anotherReview, anotherReview.records[0].id, 'archive');
  await reviewLegacyRecord(anotherReview, anotherReview.records[0].id, 'restore');
  finish(response([]));
  await expect(stage).rejects.toThrow('decision changed');
  expect(getPendingConflicts()).toEqual([]);
  expect(pendingChangeCount()).toBe(0);
  expect(localStorage.getItem(key)).toBe(JSON.stringify([original]));
});

it('missing cloud history is export-only and cannot be recreated by recovery', async () => {
  fetch.mockResolvedValue(response([]));
  const review = begin();
  await expect(reviewLegacyRecord(review, review.records[0].id, 'stage')).rejects.toThrow('export-only');
  expect(fetch.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
  expect(getPendingConflicts()).toEqual([]);
  expect(exportLegacyRecovery(review)).toContain(original.id);
});
it('a committed recovery with a lost response cannot resurrect the item after another client hard-deletes it', async () => {
  let cloud = { ...original, revision: 7 };
  let loseResponse = true;
  globalThis.fetch = vi.fn(async (_url, request) => {
    if (request.method === 'GET') return response(cloud ? [cloud] : []);
    const body = JSON.parse(request.body);
    if (body.expectedRevision !== (cloud?.revision ?? 0)) return response({ error: 'Resource was updated elsewhere' }, 409);
    cloud = { ...body, revision: cloud.revision + 1 };
    if (loseResponse) { loseResponse = false; throw new TypeError('response lost after commit'); }
    return response(cloud);
  });
  const review = begin(); await reviewLegacyRecord(review, review.records[0].id, 'stage');
  const conflict = getPendingConflicts()[0];
  await expect(resolvePendingConflict(conflict.id, 'local')).rejects.toThrow('lost');
  expect(cloud.revision).toBe(8);
  cloud = null; // The actual API hard-deletes these resources; no tombstone remains.
  await expect(resolvePendingConflict(conflict.id, 'local')).rejects.toThrow('updated elsewhere');
  expect(cloud).toBeNull();
  expect(getPendingConflicts()).toEqual([conflict]);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
  expect(localStorage.getItem(key)).toBe(JSON.stringify([original]));
});
