/**
 * Tests for src/api.js
 *
 * The module holds an in-memory cache. We mock:
 *   - globalThis.fetch (HTTP calls)
 *   - src/auth.js#getStoredCredential (returns a fake token)
 *
 * Each test resets the cache via resetData() and the fetch mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initData, resetData,
  getExercises, saveExercise, deleteExercise,
  getTemplates, saveTemplate, deleteTemplate,
  getPrograms, saveProgram, deleteProgram,
  getLogs, saveLog, deleteLog, getLogsByDate, flushPendingLogSaves, flushPendingResourceChanges, pendingLogSaveCount, pendingChangeCount,
  getPendingConflicts, pendingConflictCount, resolvePendingConflict,
  getSettings,
  exportData, previewImportData, importData, submitFeedback, deleteAccount,
} from '../api.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../auth.js', () => ({
  getStoredCredential:  vi.fn(() => 'fake-token'),
  DEV_BYPASS:           false,
  // other exports used elsewhere
  getStoredUser:        vi.fn(() => null),
  storeUser:            vi.fn(),
  clearStoredUser:      vi.fn(),
  storeCredential:      vi.fn(),
  storeSession:         vi.fn(),
  exchangeGoogleCredential: vi.fn(),
  clearStoredCredential: vi.fn(),
  parseJwt:             vi.fn(() => ({ sub: 'u1', name: 'Test', email: 't@t.com', picture: '' })),
}));

function mockFetch(responseMap) {
  globalThis.fetch = vi.fn(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    const path   = url.replace(/(https?:\/\/[^/]*)/, '');
    const key    = `${method} ${path}`;
    const handler = responseMap[key] ?? responseMap[`${method} *`];
    if (!handler) throw new Error(`Unmocked fetch: ${key}`);
    const { status = 200, body = null, headers = {} } = handler();
    return {
      ok: status < 400,
      status,
      headers: {
        get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null,
      },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
}

const EX   = { id: 'ex-1', name: 'Bench Press', muscleGroup: 'Chest', notes: '' };
const TMPL = { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] };
const LOG  = { id: 'log-1', name: 'Session', date: '2026-01-01', notes: '', exerciseItems: [] };
const PROGRAM = { id: 'program-1', name: 'Strength Plan', active: true, schedule: [{ weekday: 1, templateId: 'tmpl-1' }] };

beforeEach(() => {
  resetData();
  vi.clearAllMocks();
});

// ── initData ──────────────────────────────────────────────────────────────────
describe('initData', () => {
  it('fetches all collections and populates the cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [TMPL] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /programs':  () => ({ body: [PROGRAM] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });

    await initData();

    expect(getExercises()).toEqual([EX]);
    expect(getTemplates()).toEqual([TMPL]);
    expect(getLogs()).toEqual([LOG]);
    expect(getPrograms()).toEqual([PROGRAM]);
    expect(getSettings()).toEqual({ defaultSets: 4, defaultReps: 8 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
  });
});

// ── Exercises ──────────────────────────────────────────────────────────────────
describe('exercises', () => {
  it('getExercises returns [] before initData', () => {
    expect(getExercises()).toEqual([]);
  });

  it('saveExercise (create) adds item to cache and returns list', async () => {
    mockFetch({ 'PUT *': () => ({ body: EX }) });

    const list = await saveExercise({ name: 'Bench Press', muscleGroup: 'Chest', notes: '' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Bench Press');
  });

  it('saveExercise (update) replaces the item in cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'PUT *': () => ({ body: { ...EX, name: 'Incline Press' } }),
    });
    await initData();

    const list = await saveExercise({ ...EX, name: 'Incline Press' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Incline Press');
  });

  it('deleteExercise removes item from cache and returns list', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE *': () => ({ status: 204, body: null }),
    });
    await initData();

    const list = await deleteExercise(EX.id);
    expect(list).toHaveLength(0);
  });

  it('sends expectedRevision for versioned writes', async () => {
    const bodies = [];
    mockFetch({
      'PUT *': () => {
        const [, opts] = globalThis.fetch.mock.calls.at(-1);
        const body = JSON.parse(opts.body);
        bodies.push(body);
        const saved = { ...body };
        delete saved.expectedRevision;
        return { body: saved };
      },
    });

    await saveExercise({ ...EX, revision: 2 });
    await saveTemplate({ ...TMPL, revision: 5 });
    await saveProgram({ ...PROGRAM, revision: 3 });
    await saveLog({ ...LOG, revision: 7 });

    expect(bodies.map((body) => body.expectedRevision)).toEqual([2, 5, 3, 7]);
  });

  it('queues exercise saves when the network is unavailable and flushes them later', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const queued = await saveExercise(EX);
    expect(queued[0]).toMatchObject({ id: 'ex-1', pendingSync: true });
    expect(pendingChangeCount()).toBe(1);

    mockFetch({
      'PUT /exercises/ex-1': () => ({ body: { ...EX, revision: 1, updatedAt: '2026-01-02T00:00:00.000Z' } }),
    });

    const flushed = await flushPendingResourceChanges();
    expect(flushed.exercises[0]).toMatchObject({ id: 'ex-1', revision: 1 });
    expect(flushed.exercises[0].pendingSync).toBeUndefined();
    expect(pendingChangeCount()).toBe(0);
  });
});

// ── Templates ──────────────────────────────────────────────────────────────────
describe('templates', () => {
  it('saveTemplate creates and returns list', async () => {
    mockFetch({ 'PUT *': () => ({ body: TMPL }) });
    const list = await saveTemplate({ name: 'Push Day', description: '', exerciseItems: [] });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Push Day');
  });

  it('deleteTemplate removes from cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [TMPL] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE *': () => ({ status: 204, body: null }),
    });
    await initData();

    const list = await deleteTemplate(TMPL.id);
    expect(list).toHaveLength(0);
  });
});

// ── Programs ────────────────────────────────────────────────────────────────────
describe('programs', () => {
  it('saveProgram creates and returns active-first list', async () => {
    mockFetch({ 'PUT *': () => ({ body: PROGRAM }) });
    const list = await saveProgram({ name: 'Strength Plan', active: true, schedule: [{ weekday: 1, templateId: 'tmpl-1' }] });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Strength Plan');
  });

  it('deleteProgram removes from cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [PROGRAM] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE *': () => ({ status: 204, body: null }),
    });
    await initData();

    const list = await deleteProgram(PROGRAM.id);
    expect(list).toHaveLength(0);
  });

  it('queues program saves when the network is unavailable and flushes them later', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const queued = await saveProgram(PROGRAM);
    expect(queued[0]).toMatchObject({ id: 'program-1', pendingSync: true });
    expect(pendingChangeCount()).toBe(1);

    mockFetch({
      'PUT /programs/program-1': () => ({ body: { ...PROGRAM, revision: 1, updatedAt: '2026-01-02T00:00:00.000Z' } }),
    });

    const flushed = await flushPendingResourceChanges();
    expect(flushed.programs[0]).toMatchObject({ id: 'program-1', revision: 1 });
    expect(flushed.programs[0].pendingSync).toBeUndefined();
    expect(pendingChangeCount()).toBe(0);
  });
});

// ── Workout logs ───────────────────────────────────────────────────────────────
describe('logs', () => {
  it('saveLog creates and returns list', async () => {
    mockFetch({ 'PUT *': () => ({ body: LOG }) });
    const list = await saveLog({ name: 'Session', date: '2026-01-01', notes: '', exerciseItems: [] });
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe('2026-01-01');
  });

  it('queues log saves when the network is unavailable and flushes them later', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const queued = await saveLog(LOG);
    expect(queued[0]).toMatchObject({ id: 'log-1', pendingSync: true });
    expect(pendingLogSaveCount()).toBe(1);

    mockFetch({
      'PUT /logs/log-1': () => ({ body: { ...LOG, revision: 1, updatedAt: '2026-01-02T00:00:00.000Z' } }),
    });

    const flushed = await flushPendingLogSaves();
    expect(flushed[0]).toMatchObject({ id: 'log-1', revision: 1 });
    expect(flushed[0].pendingSync).toBeUndefined();
    expect(pendingLogSaveCount()).toBe(0);
  });

  it('keeps a queued active workout available after data reload', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await saveLog({ ...LOG, status: 'active', exerciseItems: [{ exerciseId: 'ex-1', sets: [{ reps: '8', weight: '135' }] }] });
    expect(pendingLogSaveCount()).toBe(1);

    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });

    await initData();
    expect(getLogs()).toHaveLength(1);
    expect(getLogs()[0]).toMatchObject({ id: 'log-1', status: 'active', pendingSync: true });
    expect(pendingLogSaveCount()).toBe(1);
  });

  it('queues log deletes when the network is unavailable and flushes them later', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });
    await initData();

    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const afterDelete = await deleteLog(LOG.id);
    expect(afterDelete).toEqual([]);
    expect(pendingChangeCount()).toBe(1);

    mockFetch({
      'DELETE /logs/log-1': () => ({ status: 204, body: null }),
    });

    const flushed = await flushPendingLogSaves();
    expect(flushed).toEqual([]);
    expect(pendingChangeCount()).toBe(0);
  });

  it('deleteLog removes from cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE *': () => ({ status: 204, body: null }),
    });
    await initData();

    const list = await deleteLog(LOG.id);
    expect(list).toHaveLength(0);
  });

  it('getLogsByDate filters by date', async () => {
    const log2 = { ...LOG, id: 'log-2', date: '2026-01-02' };
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [LOG, log2] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });
    await initData();

    expect(getLogsByDate('2026-01-01')).toHaveLength(1);
    expect(getLogsByDate('2026-01-01')[0].id).toBe('log-1');
    expect(getLogsByDate('2026-01-03')).toHaveLength(0);
  });
});

// ── Auth error ─────────────────────────────────────────────────────────────────
describe('auth errors', () => {
  it('dispatches wp:auth-error and throws AuthError on 401', async () => {
    mockFetch({ 'GET /exercises': () => ({ status: 401, body: { error: 'Unauthorized' } }) });

    const events = [];
    window.addEventListener('wp:auth-error', (e) => events.push(e));

    await expect(initData()).rejects.toThrow('Session expired');
    expect(events).toHaveLength(1);
  });

  it('includes request IDs in non-auth API error messages', async () => {
    mockFetch({
      'PUT *': () => ({
        status: 409,
        body: { error: 'Resource was updated elsewhere' },
        headers: { 'X-Request-Id': 'req-test-1' },
      }),
    });

    await expect(saveExercise({ id: 'ex-1', name: 'Bench Press', muscleGroup: 'Chest' }))
      .rejects.toThrow('Resource was updated elsewhere (Request ID: req-test-1)');
  });

  it('records side-by-side conflicts and can keep the local copy', async () => {
    const remote = { ...EX, name: 'Cloud Bench', revision: 2, updatedAt: '2026-01-03T00:00:00.000Z' };
    const bodies = [];
    mockFetch({
      'GET /exercises': () => ({ body: [{ ...EX, revision: 1, updatedAt: '2026-01-02T00:00:00.000Z' }] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [] }),
      'GET /programs':  () => ({ body: [] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'PUT /exercises/ex-1': () => {
        const [, opts] = globalThis.fetch.mock.calls.at(-1);
        const body = JSON.parse(opts.body);
        bodies.push(body);
        if (bodies.length === 1) {
          return {
            status: 409,
            body: {
              error: 'Resource was updated elsewhere. Reload and try again.',
              conflict: { expectedRevision: 1, actualRevision: 2, remote },
            },
            headers: { 'X-Request-Id': 'req-conflict-1' },
          };
        }
        return { body: { ...body, revision: 3, updatedAt: '2026-01-04T00:00:00.000Z' } };
      },
    });
    await initData();

    await expect(saveExercise({ ...EX, name: 'Local Bench', revision: 1 })).rejects.toThrow('Resource was updated elsewhere');
    expect(pendingConflictCount()).toBe(1);
    expect(getPendingConflicts()[0]).toMatchObject({
      id: 'exercises:ex-1',
      resource: 'exercises',
      local: { name: 'Local Bench' },
      remote: { name: 'Cloud Bench', revision: 2 },
    });

    const resolved = await resolvePendingConflict('exercises:ex-1', 'local');
    expect(bodies.map((body) => body.expectedRevision)).toEqual([1, 2]);
    expect(resolved.exercises[0]).toMatchObject({ name: 'Local Bench', revision: 3 });
    expect(pendingConflictCount()).toBe(0);
  });
});

// ── Account / Support ────────────────────────────────────────────────────────
describe('account and support', () => {
  it('exportData fetches the full export payload', async () => {
    const payload = { exercises: [EX], templates: [TMPL], logs: [LOG], settings: { defaultSets: 4, defaultReps: 8 } };
    mockFetch({ 'GET /export': () => ({ body: payload }) });
    await expect(exportData()).resolves.toEqual(payload);
  });

  it('previewImportData summarizes imported data and duplicate IDs', () => {
    const preview = previewImportData({
      exercises: [EX],
      templates: [TMPL],
      logs: [LOG],
      programs: [PROGRAM],
      settings: { defaultSets: 4, defaultReps: 8 },
    }, {
      exercises: [EX],
      templates: [],
      logs: [LOG],
      programs: [],
    });

    expect(preview.counts).toEqual({ exercises: 1, templates: 1, logs: 1, programs: 1, settings: 1 });
    expect(preview.duplicateIds).toEqual({ exercises: 1, templates: 0, logs: 1, programs: 0 });
    expect(preview.targetIsEmpty).toBe(false);
  });

  it('importData posts the import envelope and refreshes the cache', async () => {
    const imported = { exercises: [EX], templates: [TMPL], logs: [LOG], programs: [PROGRAM] };
    mockFetch({
      'POST /import': () => {
        const [, opts] = globalThis.fetch.mock.calls.at(-1);
        expect(JSON.parse(opts.body)).toEqual({ mode: 'merge', data: imported });
        return { body: { imported: { exercises: 1, templates: 1, logs: 1, programs: 1, settings: false }, renamed: {}, skipped: {} } };
      },
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [TMPL] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /programs':  () => ({ body: [PROGRAM] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });

    await expect(importData(imported, 'merge')).resolves.toMatchObject({
      imported: { exercises: 1, templates: 1, logs: 1, programs: 1, settings: false },
    });
    expect(getExercises()).toEqual([EX]);
    expect(getTemplates()).toEqual([TMPL]);
    expect(getLogs()).toEqual([LOG]);
    expect(getPrograms()).toEqual([PROGRAM]);
  });

  it('submitFeedback posts message and build metadata', async () => {
    mockFetch({
      'POST /feedback': () => {
        const [, opts] = globalThis.fetch.mock.calls.at(-1);
        expect(JSON.parse(opts.body)).toEqual({ message: 'Nice app', build: 'web test' });
        return { status: 201, body: { id: 'feedback-1' } };
      },
    });
    await expect(submitFeedback('Nice app', 'web test')).resolves.toEqual({ id: 'feedback-1' });
  });

  it('deleteAccount clears the cache after backend delete', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [TMPL] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /programs':  () => ({ body: [PROGRAM] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE /account': () => ({ body: { deleted: 4 } }),
    });
    await initData();
    await expect(deleteAccount()).resolves.toEqual({ deleted: 4 });
    expect(getExercises()).toEqual([]);
    expect(getTemplates()).toEqual([]);
    expect(getLogs()).toEqual([]);
    expect(getPrograms()).toEqual([]);
  });
});
