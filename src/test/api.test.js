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
  getLogs, saveLog, deleteLog, getLogsByDate,
  getSettings,
  exportData, submitFeedback, deleteAccount,
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

beforeEach(() => {
  resetData();
  vi.clearAllMocks();
});

// ── initData ──────────────────────────────────────────────────────────────────
describe('initData', () => {
  it('fetches all three collections and populates the cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [EX] }),
      'GET /templates': () => ({ body: [TMPL] }),
      'GET /logs':      () => ({ body: [LOG] }),
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
    });

    await initData();

    expect(getExercises()).toEqual([EX]);
    expect(getTemplates()).toEqual([TMPL]);
    expect(getLogs()).toEqual([LOG]);
    expect(getSettings()).toEqual({ defaultSets: 4, defaultReps: 8 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
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
    await saveLog({ ...LOG, revision: 7 });

    expect(bodies.map((body) => body.expectedRevision)).toEqual([2, 5, 7]);
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
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE *': () => ({ status: 204, body: null }),
    });
    await initData();

    const list = await deleteTemplate(TMPL.id);
    expect(list).toHaveLength(0);
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

  it('deleteLog removes from cache', async () => {
    mockFetch({
      'GET /exercises': () => ({ body: [] }),
      'GET /templates': () => ({ body: [] }),
      'GET /logs':      () => ({ body: [LOG] }),
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
});

// ── Account / Support ────────────────────────────────────────────────────────
describe('account and support', () => {
  it('exportData fetches the full export payload', async () => {
    const payload = { exercises: [EX], templates: [TMPL], logs: [LOG], settings: { defaultSets: 4, defaultReps: 8 } };
    mockFetch({ 'GET /export': () => ({ body: payload }) });
    await expect(exportData()).resolves.toEqual(payload);
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
      'GET /settings':  () => ({ body: { defaultSets: 4, defaultReps: 8 } }),
      'DELETE /account': () => ({ body: { deleted: 4 } }),
    });
    await initData();
    await expect(deleteAccount()).resolves.toEqual({ deleted: 4 });
    expect(getExercises()).toEqual([]);
    expect(getTemplates()).toEqual([]);
    expect(getLogs()).toEqual([]);
  });
});
