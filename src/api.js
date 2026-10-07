/**
 * API client — single source of truth for all data.
 *
 * Holds an in-memory cache populated by initData() at login.
 * Reads are synchronous (from cache). Writes are async (API → update cache → return).
 *
 * Auth errors (401 / missing credential) dispatch a 'wp:auth-error' DOM event
 * so App.jsx can sign the user out without prop-drilling an error callback.
 */

import { getSessionSnapshot, clearStoredUser, DEV_BYPASS } from './auth.js';
import { recoverySources, recoveryRecords, readRecoveryJournal, recoveryConflicts, recordRecoveryDecision, settleRecoveryConflicts } from './legacyRecovery.js';
import { normalizeProgram } from './programs.js';
import { DEFAULT_EQUIPMENT } from '../backend/src/default-equipment.mjs';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Thrown when the session credential is missing or the server returns 401. */
export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

// ── In-memory cache ────────────────────────────────────────────────────────────
const cache = {
  equipment: null,
  gyms: null,
  exercises: /** @type {any[]|null} */ (null),
  templates: /** @type {any[]|null} */ (null),
  logs:      /** @type {any[]|null} */ (null),
  programs:  /** @type {any[]|null} */ (null),
  settings:  /** @type {any|null} */ (null),
};

const DEFAULT_SETTINGS = { defaultSets: 4, defaultReps: 8, defaultRestTargetSeconds: 0, advancedMode: false };
const PENDING_LOG_QUEUE_KEY = 'forge.pendingLogSaves.v1';
const PENDING_RESOURCE_QUEUE_KEY = 'forge.pendingResourceChanges.v1';
const PENDING_CONFLICTS_KEY = 'forge.pendingConflicts.v1';
const pendingLogFlushes = new Map();
const pendingResourceFlushes = new Map();
let cacheGeneration = 0;
let activeSession;

export class AccountChangedError extends Error {
  constructor() { super('The account changed. Pending work remains with its original account.'); this.name = 'AccountChangedError'; }
}

function clearCache() {
  for (const key of Object.keys(cache)) cache[key] = null;
  cacheGeneration += 1;
}

function context() {
  const snapshot = getSessionSnapshot();
  const owner = snapshot.user?.sub || null;
  const session = JSON.stringify([owner, snapshot.epoch]);
  if (session !== activeSession) { clearCache(); activeSession = session; }
  return { owner, session, generation: cacheGeneration, credential: snapshot.credential };
}

function assertCurrent(captured) {
  const current = context();
  if (captured.session !== current.session || captured.generation !== current.generation) throw new AccountChangedError();
}

function queueKey(legacyKey, owner = context().owner) {
  return owner ? `${legacyKey.replace(/\.v1$/, '.v2')}:${encodeURIComponent(owner)}` : null;
}

// v1 did not record ownership. Preserve its bytes without showing or replaying
// health records to whichever account happens to sign in next.
export function hasQuarantinedPendingChanges() {
  return [PENDING_LOG_QUEUE_KEY, PENDING_RESOURCE_QUEUE_KEY, PENDING_CONFLICTS_KEY]
    .some(key => storage()?.getItem(key) != null);
}


function withExpectedRevision(item) {
  if (!Number.isInteger(item.revision)) return item;
  return { ...item, expectedRevision: item.revision };
}

function storage() {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function readPendingLogQueue(owner = context().owner) {
  try {
    const key = queueKey(PENDING_LOG_QUEUE_KEY, owner);
    if (!key) return [];
    const raw = storage()?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPendingResourceQueue(owner = context().owner) {
  try {
    const key = queueKey(PENDING_RESOURCE_QUEUE_KEY, owner);
    if (!key) return [];
    const raw = storage()?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPendingConflicts(owner = context().owner) {
  if (!owner) return [];
  let ordinary = [];
  try {
    const parsed = JSON.parse(storage()?.getItem(queueKey(PENDING_CONFLICTS_KEY, owner)) || '[]');
    if (Array.isArray(parsed)) ordinary = parsed;
  } catch { /* Leave malformed source untouched. */ }
  return [...ordinary, ...recoveryConflicts(storage(), owner)];
}

function writePendingLogQueue(queue, owner) {
  if (!owner) throw new AuthError('Sign in before saving offline changes.');
  const next = queue.filter((entry) => entry?.id);
  if (next.length === 0) {
    storage()?.removeItem(queueKey(PENDING_LOG_QUEUE_KEY, owner));
  } else {
    storage()?.setItem(queueKey(PENDING_LOG_QUEUE_KEY, owner), JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function writePendingResourceQueue(queue, owner) {
  if (!owner) throw new AuthError('Sign in before saving offline changes.');
  const next = queue.filter((entry) => entry?.resource && entry?.id && entry?.operation);
  if (next.length === 0) {
    storage()?.removeItem(queueKey(PENDING_RESOURCE_QUEUE_KEY, owner));
  } else {
    storage()?.setItem(queueKey(PENDING_RESOURCE_QUEUE_KEY, owner), JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function writePendingConflicts(conflicts, owner) {
  if (!owner) throw new AuthError('Sign in before saving offline changes.');
  settleRecoveryConflicts(storage(), owner, conflicts);
  const next = conflicts.filter((entry) => entry?.id && entry?.resource && !entry.recoveryID);
  if (next.length === 0) {
    storage()?.removeItem(queueKey(PENDING_CONFLICTS_KEY, owner));
  } else {
    storage()?.setItem(queueKey(PENDING_CONFLICTS_KEY, owner), JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function dispatchSyncStatus(extra = {}) {
  const owner = context().owner;
  const pendingLogSaves = readPendingLogQueue(owner).length;
  const pendingResourceChanges = readPendingResourceQueue(owner).length;
  const pendingConflicts = readPendingConflicts(owner).length;
  window.dispatchEvent(new CustomEvent('wp:sync-status', {
    detail: {
      pendingLogSaves,
      pendingResourceChanges,
      pendingConflicts,
      pendingChanges: pendingLogSaves + pendingResourceChanges,
      quarantinedPendingChanges: hasQuarantinedPendingChanges(),
      ...extra,
    },
  }));
}

function stripLocalLogFields(log) {
  const clean = { ...log };
  delete clean.pendingSync;
  delete clean.pendingSyncAt;
  delete clean.syncError;
  delete clean.syncConflict;
  delete clean.operation;
  delete clean.changeId;
  return clean;
}

function stripLocalResourceFields(item) {
  const clean = { ...item };
  delete clean.pendingSync;
  delete clean.pendingSyncAt;
  delete clean.pendingDelete;
  delete clean.syncError;
  delete clean.syncConflict;
  return clean;
}

function pendingLogItem(log) {
  return {
    ...stripLocalLogFields(log),
    pendingSync: true,
    pendingSyncAt: new Date().toISOString(),
  };
}

function pendingResourceItem(item) {
  return {
    ...stripLocalResourceFields(item),
    pendingSync: true,
    pendingSyncAt: new Date().toISOString(),
  };
}

function normalizeResourceItem(resource, item) {
  if (!item || typeof item !== 'object') return item;
  return resource === 'programs' ? normalizeProgram(item) : item;
}

function upsertLogItem(log) {
  const list = cache.logs ?? [];
  const idx = list.findIndex((l) => l.id === log.id);
  cache.logs = idx >= 0
    ? list.map((l, i) => (i === idx ? log : l))
    : [...list, log];
  return cache.logs;
}

function upsertCached(resource, item) {
  const normalizedItem = normalizeResourceItem(resource, item);
  const list = cache[resource] ?? [];
  const idx = list.findIndex((entry) => entry.id === normalizedItem.id);
  cache[resource] = idx >= 0
    ? list.map((entry, i) => (i === idx ? normalizedItem : entry))
    : [...list, normalizedItem];
  if (resource === 'templates') {
    cache.templates = cache.templates.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (resource === 'programs') {
    cache.programs = cache.programs.sort((a, b) => (
      Number(Boolean(b.active)) - Number(Boolean(a.active))
      || a.name.localeCompare(b.name)
    ));
  }
  return cache[resource];
}

function mergePendingLogs(logs, owner) {
  const byId = new Map(logs.map((log) => [log.id, log]));
  for (const pending of readPendingLogQueue(owner)) {
    if (pending.operation === 'delete') {
      byId.delete(pending.id);
    } else {
      byId.set(pending.id, pendingLogItem(pending));
    }
  }
  return [...byId.values()];
}

function mergePendingCollection(resource, items, owner) {
  const byId = new Map(items.map((item) => {
    const normalized = normalizeResourceItem(resource, item);
    return [normalized.id, normalized];
  }));
  for (const pending of readPendingResourceQueue(owner).filter((entry) => entry.resource === resource)) {
    if (pending.operation === 'delete') {
      byId.delete(pending.id);
    } else if (pending.item) {
      byId.set(pending.id, normalizeResourceItem(resource, pendingResourceItem(pending.item)));
    }
  }
  return [...byId.values()];
}

function queuePendingLogSave(log, owner) {
  const pending = pendingLogItem(log);
  const queue = readPendingLogQueue(owner).filter((entry) => entry.id !== pending.id);
  queue.push({ ...stripLocalLogFields(pending), operation: 'put', changeId: crypto.randomUUID() });
  writePendingLogQueue(queue, owner);
  return pending;
}

function queuePendingLogDelete(id, owner) {
  const queue = readPendingLogQueue(owner).filter((entry) => entry.id !== id);
  queue.push({
    id,
    operation: 'delete',
    changeId: crypto.randomUUID(),
    pendingSyncAt: new Date().toISOString(),
  });
  writePendingLogQueue(queue, owner);
}

function queuePendingResourceChange(resource, operation, itemOrId, owner) {
  const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
  const item = typeof itemOrId === 'string' ? undefined : stripLocalResourceFields(itemOrId);
  const queue = readPendingResourceQueue(owner).filter((entry) => !(entry.resource === resource && entry.id === id));
  queue.push({
    resource,
    operation,
    id,
    item,
    changeId: crypto.randomUUID(),
    pendingSyncAt: new Date().toISOString(),
  });
  writePendingResourceQueue(queue, owner);
}

function removePendingLogSave(id, owner) {
  writePendingLogQueue(readPendingLogQueue(owner).filter((entry) => entry.id !== id), owner);
}

function removePendingResourceChange(resource, id, owner) {
  writePendingResourceQueue(readPendingResourceQueue(owner).filter((entry) => !(entry.resource === resource && entry.id === id)), owner);
}

function removePendingConflict(conflictId, owner) {
  writePendingConflicts(readPendingConflicts(owner).filter((entry) => entry.id !== conflictId), owner);
}

function pendingConflictId(resource, id) {
  return `${resource}:${id}`;
}

function storePendingConflict(resource, operation, local, error, owner) {
  const id = local?.id;
  if (!id) return undefined;
  const conflictId = pendingConflictId(resource, id);
  const conflict = {
    id: conflictId,
    resource,
    operation,
    itemId: id,
    local,
    remote: error?.conflict?.remote ?? null,
    expectedRevision: error?.conflict?.expectedRevision,
    actualRevision: error?.conflict?.actualRevision,
    message: error?.message || 'This item changed on another device.',
    requestId: error?.requestId || '',
    createdAt: new Date().toISOString(),
  };
  writePendingConflicts([
    ...readPendingConflicts(owner).filter((entry) => entry.id !== conflictId),
    conflict,
  ], owner);
  return conflict;
}

function isNetworkError(error) {
  return error instanceof TypeError || error?.name === 'TypeError' || error?.name === 'NetworkError';
}

export function pendingLogSaveCount() {
  return readPendingLogQueue().length;
}

export function pendingChangeCount() {
  return readPendingLogQueue().length + readPendingResourceQueue().length;
}

export function pendingConflictCount() {
  return readPendingConflicts().length;
}

export function getPendingConflicts() {
  return readPendingConflicts();
}

/** Clear only memory on sign-out; durable work belongs to its original owner. */
export function resetData() {
  clearCache();
  dispatchSyncStatus();
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
async function request(method, path, body, captured = context()) {
  assertCurrent(captured);
  const credential = captured.credential;
  if (!captured.owner || !credential) {
    window.dispatchEvent(new CustomEvent('wp:auth-error'));
    throw new AuthError('Session expired — please sign in again');
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    assertCurrent(captured);
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('wp:auth-error'));
      throw new AuthError('Session expired — please sign in again');
    }
    if (!res.ok) {
      const { message, requestId, payload } = await responseError(res);
      assertCurrent(captured);
      const error = new Error(message);
      error.status = res.status;
      error.requestId = requestId;
      error.conflict = payload?.conflict;
      window.dispatchEvent(new CustomEvent('wp:api-error', {
        detail: { message, status: res.status, requestId, conflict: res.status === 409 },
      }));
      throw error;
    }
    const result = res.status === 204 ? null : await res.json();
    assertCurrent(captured);
    return result;
  } catch (error) {
    // A late 401, network failure or body decode must not mutate the new account.
    assertCurrent(captured);
    throw error;
  }
}

async function responseError(res) {
  const text = await res.text();
  const requestId = res.headers?.get?.('X-Request-Id') || res.headers?.get?.('x-request-id') || '';
  const withRequestId = (message) => requestId ? `${message} (Request ID: ${requestId})` : message;
  if (!text) return { message: withRequestId(`API ${res.status}`), requestId };
  try {
    const payload = JSON.parse(text);
    return { message: withRequestId(payload?.error || `API ${res.status}: ${text}`), requestId, payload };
  } catch {
    return { message: withRequestId(`API ${res.status}: ${text}`), requestId, payload: null };
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
/** Fetch all collections + settings in parallel and populate the cache. */
export async function initData() {
  const captured = context();
  // In dev bypass mode with no real API configured, start with empty collections.
  if (DEV_BYPASS && !BASE_URL) {
    cache.gyms = [];
    cache.equipment = structuredClone(DEFAULT_EQUIPMENT);
    cache.exercises = [];
    cache.templates = [];
    cache.logs      = [];
    cache.programs  = [];
    cache.settings  = { ...DEFAULT_SETTINGS };
    return;
  }
  const [exercises, templates, logs, programs, settings, gyms, equipment] = await Promise.all([
    request('GET', '/exercises', undefined, captured),
    request('GET', '/templates', undefined, captured),
    request('GET', '/logs', undefined, captured),
    request('GET', '/programs', undefined, captured),
    request('GET', '/settings', undefined, captured),
    request('GET', '/gyms', undefined, captured),
    request('GET', '/equipment', undefined, captured),
  ]);
  assertCurrent(captured);
  cache.gyms = gyms;
  cache.equipment = equipment;
  cache.exercises = mergePendingCollection('exercises', exercises, captured.owner);
  cache.templates = mergePendingCollection('templates', templates, captured.owner);
  cache.logs      = mergePendingLogs(logs, captured.owner);
  cache.programs  = mergePendingCollection('programs', programs, captured.owner).sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || a.name.localeCompare(b.name)
  ));
  cache.settings  = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  dispatchSyncStatus();
}

function editedEquipmentCount(equipment = []) {
  return equipment.filter((item) => !DEFAULT_EQUIPMENT.some((entry) => entry.id === item.id && entry.name === item.name && entry.category === item.category && entry.details === item.details)).length;
}
export function getEquipment() { context(); return [...(cache.equipment ?? [])].sort((a, b) => a.name.localeCompare(b.name)); }
export async function saveEquipment(item) {
  const captured = context();
  const body = { ...item, id: item.id || crypto.randomUUID() };
  if (getEquipment().some((entry) => entry.id !== body.id && entry.name.trim().toLowerCase() === body.name.trim().toLowerCase())) throw new Error('Equipment with that name already exists in your library.');
  const saved = (DEV_BYPASS && !BASE_URL) ? body : await request('PUT', `/equipment/${body.id}`, withExpectedRevision(body), captured);
  assertCurrent(captured);
  cache.equipment = [...getEquipment().filter((entry) => entry.id !== saved.id), saved];
  cache.gyms = getGyms().map((gym) => ({ ...gym, equipment: gym.equipment.map((entry) => (entry.equipmentId ?? entry.id) === saved.id ? { ...entry, name: saved.name, category: saved.category } : entry) }));
  return getEquipment();
}
export async function deleteEquipment(id) {
  const captured = context();
  if (getGyms().some((gym) => gym.equipment.some((item) => (item.equipmentId ?? item.id) === id)) || getExercises().some((exercise) => exercise.equipmentAlternatives?.some((ref) => ref.equipmentId === id))) throw new Error('Remove this equipment from gyms and exercises before deleting it.');
  if (!(DEV_BYPASS && !BASE_URL)) await request('DELETE', `/equipment/${id}`, undefined, captured);
  assertCurrent(captured);
  cache.equipment = getEquipment().filter((entry) => entry.id !== id);
  return getEquipment();
}

// Gyms save online so a failed request leaves the editor and cached inventory intact.
export function getGyms() { context(); return [...(cache.gyms ?? [])].sort((a, b) => a.name.localeCompare(b.name)); }
export async function saveGym(gym) {
  const captured = context();
  if (getExercises().some((exercise) => exercise.equipmentAlternatives?.some((ref) => ref.gymId === gym.id && !gym.equipment.some((item) => item.id === ref.equipmentId)))) {
    throw new Error('Remove exercise associations before removing equipment from this gym.');
  }
  const body = { ...gym, id: gym.id || crypto.randomUUID() };
  const saved = (DEV_BYPASS && !BASE_URL) ? body : await request('PUT', `/gyms/${body.id}`, withExpectedRevision(body), captured);
  assertCurrent(captured);
  cache.gyms = [...getGyms().filter((item) => item.id !== saved.id), saved];
  return getGyms();
}
export async function deleteGym(id) {
  const captured = context();
  if (getExercises().some((exercise) => exercise.equipmentAlternatives?.some((ref) => ref.gymId === id))) {
    throw new Error('Remove exercise equipment associations before deleting this gym.');
  }
  if (getTemplates().some((routine) => routine.gymId === id)) {
    throw new Error('Reassign or unassign routines using this gym before deleting it.');
  }
  if (!(DEV_BYPASS && !BASE_URL)) await request('DELETE', `/gyms/${id}`, undefined, captured);
  assertCurrent(captured);
  cache.gyms = getGyms().filter((gym) => gym.id !== id);
  return getGyms();
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function getSettings() { context(); return { ...DEFAULT_SETTINGS, ...(cache.settings ?? {}) }; }

export async function saveSettings(settings) {
  const captured = context();
  const saved = (DEV_BYPASS && !BASE_URL) ? settings : await request('PUT', '/settings', settings, captured);
  assertCurrent(captured);
  cache.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  return cache.settings;
}

// ── Exercises ──────────────────────────────────────────────────────────────────
export function getExercises() { context(); return cache.exercises ?? []; }

async function mutateQueued(resource, operation, item, captured) {
  assertCurrent(captured);
  const id = typeof item === 'string' ? item : item.id;
  const isLog = resource === 'logs';
  if (isLog) {
    if (operation === 'delete') queuePendingLogDelete(id, captured.owner); else queuePendingLogSave(item, captured.owner);
  } else queuePendingResourceChange(resource, operation, item, captured.owner);
  const read = () => (isLog ? readPendingLogQueue : readPendingResourceQueue)(captured.owner);
  const write = queue => (isLog ? writePendingLogQueue : writePendingResourceQueue)(queue, captured.owner);
  const entry = read().find(value => value.id === id && (isLog || value.resource === resource));
  const acknowledge = () => write(read().filter(value => !samePendingChange(value, entry)));
  try {
    const saved = await request(operation === 'delete' ? 'DELETE' : 'PUT', `/${resource}/${id}`,
      operation === 'delete' ? undefined : withExpectedRevision(item), captured);
    assertCurrent(captured);
    if (!read().some(value => samePendingChange(value, entry))) return undefined;
    acknowledge();
    removePendingConflict(pendingConflictId(resource, id), captured.owner);
    return saved;
  } catch (error) {
    assertCurrent(captured);
    if (!read().some(value => samePendingChange(value, entry))) return undefined;
    {
      if (error.status === 409) storePendingConflict(resource, operation, typeof item === 'string' ? { id } : item, error, captured.owner);
      else if (error.status >= 400 && error.status < 500) acknowledge();
    }
    if (!isNetworkError(error)) throw error;
    return operation === 'delete' ? null : (isLog ? pendingLogItem(item) : pendingResourceItem(item));
  }
}

export async function saveExercise(exercise) {
  const captured = context();
  const item = { ...exercise, id: exercise.id ?? crypto.randomUUID() };
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await mutateQueued('exercises', 'put', item, captured);
  assertCurrent(captured);
  if (saved) upsertCached('exercises', saved);
  return getExercises();
}

export async function deleteExercise(id) {
  const captured = context();
  const result = (DEV_BYPASS && !BASE_URL) ? null : await mutateQueued('exercises', 'delete', id, captured);
  assertCurrent(captured);
  if (result === undefined) return getExercises();
  cache.exercises = (cache.exercises ?? []).filter(item => item.id !== id);
  return getExercises();
}

export async function saveTemplate(template) {
  const captured = context();
  const item = { ...template, id: template.id ?? crypto.randomUUID() };
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await mutateQueued('templates', 'put', item, captured);
  assertCurrent(captured);
  if (saved) upsertCached('templates', saved);
  return getTemplates();
}

export async function deleteTemplate(id) {
  const captured = context();
  const result = (DEV_BYPASS && !BASE_URL) ? null : await mutateQueued('templates', 'delete', id, captured);
  assertCurrent(captured);
  if (result === undefined) return getTemplates();
  cache.templates = (cache.templates ?? []).filter(item => item.id !== id);
  return getTemplates();
}

export async function saveProgram(program) {
  const captured = context();
  const item = normalizeProgram({ ...program, id: program.id ?? crypto.randomUUID() });
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await mutateQueued('programs', 'put', item, captured);
  assertCurrent(captured);
  if (saved) upsertCached('programs', saved);
  return getPrograms();
}

export async function deleteProgram(id) {
  const captured = context();
  const result = (DEV_BYPASS && !BASE_URL) ? null : await mutateQueued('programs', 'delete', id, captured);
  assertCurrent(captured);
  if (result === undefined) return getPrograms();
  cache.programs = (cache.programs ?? []).filter(item => item.id !== id);
  return getPrograms();
}

export async function saveLog(log) {
  const captured = context();
  const item = { ...stripLocalLogFields(log), id: log.id ?? crypto.randomUUID() };
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await mutateQueued('logs', 'put', item, captured);
  assertCurrent(captured);
  if (saved) upsertLogItem(saved);
  return getLogs();
}

export async function deleteLog(id) {
  const captured = context();
  const result = (DEV_BYPASS && !BASE_URL) ? null : await mutateQueued('logs', 'delete', id, captured);
  assertCurrent(captured);
  if (result === undefined) return getLogs();
  cache.logs = (cache.logs ?? []).filter(item => item.id !== id);
  return getLogs();
}

export function getTemplates() { context(); return [...(cache.templates ?? [])].sort((a, b) => a.name.localeCompare(b.name)); }
export function getPrograms() { context(); return [...(cache.programs ?? [])].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || a.name.localeCompare(b.name)); }
export function getLogs() {
  const captured = context();
  // A setup choice is durable before its response arrives. Resume the latest
  // owned intent, including deletions, during rapid navigation or a slow request.
  const logs = mergePendingLogs(cache.logs ?? [], captured.owner);
  assertCurrent(captured);
  return logs;
}

// A retry acknowledges only the exact change it sent. Replacing the queue from
// a snapshot would discard edits queued while the network request was pending.
function samePendingChange(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function flushPendingLogSaves() {
  const captured = context();
  const key = JSON.stringify([captured.session, captured.generation]);
  if (!pendingLogFlushes.has(key)) {
    pendingLogFlushes.set(key, flushLogQueue(captured).finally(() => pendingLogFlushes.delete(key)));
  }
  return pendingLogFlushes.get(key);
}

async function flushLogQueue(captured) {
  const queue = readPendingLogQueue(captured.owner);
  if (queue.length === 0 || (DEV_BYPASS && !BASE_URL)) {
    dispatchSyncStatus();
    return getLogs();
  }

  for (let index = 0; index < queue.length; index += 1) {
    assertCurrent(captured);
    const entry = queue[index];
    if (!readPendingLogQueue(captured.owner).some(current => samePendingChange(current, entry))) continue;
    try {
      let saved;
      if (entry.operation === 'delete') {
        await request('DELETE', `/logs/${entry.id}`, undefined, captured);
        assertCurrent(captured);
      } else {
        saved = await request('PUT', `/logs/${entry.id}`, withExpectedRevision(stripLocalLogFields(entry)), captured);
        assertCurrent(captured);
      }
      const currentQueue = readPendingLogQueue(captured.owner);
      if (!currentQueue.some(current => samePendingChange(current, entry))) continue;
      if (entry.operation === 'delete') cache.logs = (cache.logs ?? []).filter(log => log.id !== entry.id);
      else upsertLogItem(saved);
      writePendingLogQueue(currentQueue.filter(current => !samePendingChange(current, entry)), captured.owner);
      removePendingConflict(pendingConflictId('logs', entry.id), captured.owner);
    } catch (error) {
      assertCurrent(captured);
      if (!readPendingLogQueue(captured.owner).some(current => samePendingChange(current, entry))) continue;
      if (error.status === 409) {
        const conflict = storePendingConflict('logs', entry.operation, entry, error, captured.owner);
        dispatchSyncStatus({ syncIssue: error.message });
        window.dispatchEvent(new CustomEvent('wp:api-error', {
          detail: {
            message: `A pending workout could not sync because it changed elsewhere. Reload before editing it again. ${error.message}`,
            status: 409,
            conflict: true,
            conflictId: conflict?.id,
          },
        }));
        break;
      }
      if (!isNetworkError(error)) {
        dispatchSyncStatus({ syncIssue: error.message });
        break;
      }
      break;
    }
  }

  return getLogs();
}

export function flushPendingResourceChanges() {
  const captured = context();
  const key = JSON.stringify([captured.session, captured.generation]);
  if (!pendingResourceFlushes.has(key)) {
    pendingResourceFlushes.set(key, flushResourceQueue(captured).finally(() => pendingResourceFlushes.delete(key)));
  }
  return pendingResourceFlushes.get(key);
}

async function flushResourceQueue(captured) {
  const queue = readPendingResourceQueue(captured.owner);
  if (queue.length === 0 || (DEV_BYPASS && !BASE_URL)) {
    dispatchSyncStatus();
    return {
      exercises: getExercises(),
      templates: getTemplates(),
      programs: getPrograms(),
    };
  }

  for (let index = 0; index < queue.length; index += 1) {
    assertCurrent(captured);
    const entry = queue[index];
    if (!readPendingResourceQueue(captured.owner).some(current => samePendingChange(current, entry))) continue;
    try {
      let saved;
      if (entry.operation === 'delete') {
        await request('DELETE', `/${entry.resource}/${entry.id}`, undefined, captured);
        assertCurrent(captured);
      } else {
        saved = await request('PUT', `/${entry.resource}/${entry.id}`, withExpectedRevision(stripLocalResourceFields(entry.item)), captured);
        assertCurrent(captured);
      }
      const currentQueue = readPendingResourceQueue(captured.owner);
      if (!currentQueue.some(current => samePendingChange(current, entry))) continue;
      if (entry.operation === 'delete') cache[entry.resource] = (cache[entry.resource] ?? []).filter(item => item.id !== entry.id);
      else upsertCached(entry.resource, saved);
      writePendingResourceQueue(currentQueue.filter(current => !samePendingChange(current, entry)), captured.owner);
      removePendingConflict(pendingConflictId(entry.resource, entry.id), captured.owner);
    } catch (error) {
      assertCurrent(captured);
      if (!readPendingResourceQueue(captured.owner).some(current => samePendingChange(current, entry))) continue;
      if (error.status === 409) {
        const conflict = storePendingConflict(entry.resource, entry.operation, entry.item ?? { id: entry.id }, error, captured.owner);
        dispatchSyncStatus({ syncIssue: error.message });
        window.dispatchEvent(new CustomEvent('wp:api-error', {
          detail: {
            message: `A pending library change could not sync because it changed elsewhere. Reload before editing it again. ${error.message}`,
            status: 409,
            conflict: true,
            conflictId: conflict?.id,
          },
        }));
        break;
      }
      if (!isNetworkError(error)) {
        dispatchSyncStatus({ syncIssue: error.message });
        break;
      }
      break;
    }
  }

  return {
    exercises: getExercises(),
    templates: getTemplates(),
    programs: getPrograms(),
  };
}

export async function flushPendingChanges() {
  const captured = context();
  const resources = await flushPendingResourceChanges();
  assertCurrent(captured);
  const updatedLogs = await flushPendingLogSaves();
  assertCurrent(captured);
  return {
    ...resources,
    logs: updatedLogs,
  };
}

function currentCollections() {
  return {
    exercises: getExercises(),
    templates: getTemplates(),
    programs: getPrograms(),
    logs: getLogs(),
  };
}

function removePendingChangeForConflict(conflict, owner) {
  if (conflict.resource === 'logs') {
    removePendingLogSave(conflict.itemId, owner);
  } else {
    removePendingResourceChange(conflict.resource, conflict.itemId, owner);
  }
}

function applyRemoteConflictItem(conflict) {
  if (!conflict.remote) {
    if (conflict.resource === 'logs') {
      cache.logs = (cache.logs ?? []).filter((item) => item.id !== conflict.itemId);
    } else {
      cache[conflict.resource] = (cache[conflict.resource] ?? []).filter((item) => item.id !== conflict.itemId);
    }
    return;
  }
  if (conflict.resource === 'logs') {
    upsertLogItem(conflict.remote);
  } else {
    upsertCached(conflict.resource, conflict.remote);
  }
}

function assertRecoveryConflictUnchanged(conflict, owner) {
  if (!conflict.recoveryID) return;
  if (!Number.isInteger(conflict.remote?.revision) || conflict.remote.revision <= 0) throw new Error('Missing or unversioned cloud work can only be exported for support review.');
  if (!readPendingConflicts(owner).some(entry => JSON.stringify(entry) === JSON.stringify(conflict))
    || readPendingLogQueue(owner).some(row => conflict.resource === 'logs' && row.id === conflict.itemId)
    || readPendingResourceQueue(owner).some(row => row.resource === conflict.resource && row.id === conflict.itemId)) {
    throw new Error('Newer pending work changed this review. Resolve that work before recovering the original.');
  }
}

export async function resolvePendingConflict(conflictId, resolution) {
  const captured = context();
  const conflict = readPendingConflicts(captured.owner).find((entry) => entry.id === conflictId);
  if (!conflict) throw new Error('Conflict is no longer pending.');
  if (!['local', 'remote'].includes(resolution)) throw new Error('Conflict resolution is invalid.');
  assertRecoveryConflictUnchanged(conflict, captured.owner);

  if (resolution === 'remote') {
    removePendingChangeForConflict(conflict, captured.owner);
    applyRemoteConflictItem(conflict);
    removePendingConflict(conflict.id, captured.owner);
    return currentCollections();
  }

  const local = conflict.resource === 'logs'
    ? stripLocalLogFields(conflict.local)
    : stripLocalResourceFields(conflict.local);
  const body = Number.isInteger(conflict.remote?.revision)
    ? { ...local, revision: conflict.remote.revision }
    : { ...local, revision: undefined };
  const saved = (DEV_BYPASS && !BASE_URL)
    ? { ...local, revision: Number.isInteger(conflict.remote?.revision) ? conflict.remote.revision + 1 : local.revision }
    : await request('PUT', `/${conflict.resource}/${conflict.itemId}`, withExpectedRevision(body), captured);
  assertCurrent(captured);
  assertRecoveryConflictUnchanged(conflict, captured.owner);
  if (!readPendingConflicts(captured.owner).some(entry => JSON.stringify(entry) === JSON.stringify(conflict))) throw new Error('The saved review changed. Reopen it before continuing.');
  if (conflict.resource === 'logs') {
    upsertLogItem(saved);
  } else {
    upsertCached(conflict.resource, saved);
  }
  removePendingChangeForConflict(conflict, captured.owner);
  removePendingConflict(conflict.id, captured.owner);
  return currentCollections();
}

export function getLogsByDate(dateStr) {
  context();
  return (cache.logs ?? []).filter((l) => l.date === dateStr);
}

// ── Account / Support ─────────────────────────────────────────────────────────
export async function exportData() {
  const captured = context();
  if (DEV_BYPASS && !BASE_URL) return { exportedAt: new Date().toISOString(), exercises: getExercises(), templates: getTemplates(), logs: getLogs(), programs: getPrograms(), gyms: getGyms(), equipment: getEquipment(), settings: getSettings() };
  return request('GET', '/export', undefined, captured);
}

export function previewImportData(data, current = {
  exercises: getExercises(),
  templates: getTemplates(),
  logs: getLogs(),
  programs: getPrograms(),
  gyms: getGyms(),
  equipment: getEquipment(),
}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Import file must be a Rep, Mix, Burn JSON export.');
  }
  const gyms = Array.isArray(data.gyms) ? data.gyms : [];
  const equipment = Array.isArray(data.equipment) ? data.equipment : [];
  const exercises = Array.isArray(data.exercises) ? data.exercises : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const programs = Array.isArray(data.programs) ? data.programs : [];
  const settings = data.settings && typeof data.settings === 'object';
  const existingIds = {
    equipment: new Set((current.equipment ?? []).map((item) => item.id)),
    gyms: new Set((current.gyms ?? []).map((item) => item.id)),
    exercises: new Set((current.exercises ?? []).map((item) => item.id)),
    templates: new Set((current.templates ?? []).map((item) => item.id)),
    logs: new Set((current.logs ?? []).map((item) => item.id)),
    programs: new Set((current.programs ?? []).map((item) => item.id)),
  };
  const duplicateIds = {
    equipment: equipment.filter((item) => existingIds.equipment.has(item.id)).length,
    gyms: gyms.filter((item) => existingIds.gyms.has(item.id)).length,
    exercises: exercises.filter((item) => existingIds.exercises.has(item.id)).length,
    templates: templates.filter((item) => existingIds.templates.has(item.id)).length,
    logs: logs.filter((item) => existingIds.logs.has(item.id)).length,
    programs: programs.filter((item) => existingIds.programs.has(item.id)).length,
  };
  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    counts: {
      gyms: gyms.length,
      equipment: equipment.length,
      exercises: exercises.length,
      templates: templates.length,
      logs: logs.length,
      programs: programs.length,
      settings: settings ? 1 : 0,
    },
    duplicateIds,
    isEmpty: exercises.length + templates.length + logs.length + programs.length + gyms.length + equipment.length === 0,
    targetIsEmpty: (current.exercises?.length ?? 0)
      + (current.templates?.length ?? 0)
      + (current.logs?.length ?? 0)
      + (current.programs?.length ?? 0)
      + (current.gyms?.length ?? 0) + editedEquipmentCount(current.equipment) === 0,
  };
}

function normalizedName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function uniqueImportedName(name, existingNames, renamed) {
  const base = String(name ?? '').trim() || 'Imported';
  if (!existingNames.has(normalizedName(base))) {
    existingNames.add(normalizedName(base));
    return base;
  }

  let candidate = `${base} (imported)`;
  let index = 2;
  while (existingNames.has(normalizedName(candidate))) {
    candidate = `${base} (imported ${index})`;
    index += 1;
  }
  existingNames.add(normalizedName(candidate));
  renamed.push({ from: base, to: candidate });
  return candidate;
}

function importDataLocally(data, mode) {
  const gyms = Array.isArray(data.gyms) ? data.gyms : [];
  const equipment = Array.isArray(data.equipment) ? data.equipment : [];
  const exercises = Array.isArray(data.exercises) ? data.exercises : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const programs = Array.isArray(data.programs) ? data.programs.map((program) => normalizeProgram(program)) : [];
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : undefined;
  const targetIsEmpty = getExercises().length + getTemplates().length + getLogs().length + getPrograms().length + getGyms().length + editedEquipmentCount(getEquipment()) === 0;
  if (mode === 'emptyOnly' && !targetIsEmpty) {
    const error = new Error('Import can only restore into an empty account.');
    error.status = 409;
    throw error;
  }

  if (mode === 'emptyOnly') {
    cache.gyms = gyms;
    cache.equipment = equipment.length ? equipment : structuredClone(DEFAULT_EQUIPMENT);
    cache.exercises = exercises;
    cache.templates = templates;
    cache.logs = logs;
    cache.programs = programs.sort((a, b) => (
      Number(Boolean(b.active)) - Number(Boolean(a.active))
      || a.name.localeCompare(b.name)
    ));
    if (settings) cache.settings = { ...DEFAULT_SETTINGS, ...settings };
    return {
      imported: { exercises: exercises.length, templates: templates.length, logs: logs.length, programs: programs.length, gyms: gyms.length, equipment: equipment.length, settings: Boolean(settings) },
      renamed: { exercises: [], templates: [], logs: [], programs: [], gyms: [] },
      skipped: { exercises: [], templates: [], logs: [], programs: [], gyms: [] },
    };
  }

  const renamed = { exercises: [], templates: [], logs: [], programs: [], gyms: [] };
  const skipped = { exercises: [], templates: [], logs: [], programs: [], gyms: [] };
  const existingExerciseIds = new Set(getExercises().map((item) => item.id));
  const existingTemplateIds = new Set(getTemplates().map((item) => item.id));
  const existingLogIds = new Set(getLogs().map((item) => item.id));
  const existingProgramIds = new Set(getPrograms().map((item) => item.id));
  const exerciseNames = new Set(getExercises().map((item) => normalizedName(item.name)));
  const templateNames = new Set(getTemplates().map((item) => normalizedName(item.name)));
  const logNamesByDate = new Set(getLogs().map((item) => `${item.date}|${normalizedName(item.name)}`));
  const programNames = new Set(getPrograms().map((item) => normalizedName(item.name)));

  const newExercises = exercises.flatMap((exercise) => {
    if (existingExerciseIds.has(exercise.id)) {
      skipped.exercises.push({ id: exercise.id, name: exercise.name });
      return [];
    }
    return [{ ...exercise, name: uniqueImportedName(exercise.name, exerciseNames, renamed.exercises) }];
  });
  const newTemplates = templates.flatMap((template) => {
    if (existingTemplateIds.has(template.id)) {
      skipped.templates.push({ id: template.id, name: template.name });
      return [];
    }
    return [{ ...template, name: uniqueImportedName(template.name, templateNames, renamed.templates) }];
  });
  const newLogs = logs.flatMap((log) => {
    if (existingLogIds.has(log.id)) {
      skipped.logs.push({ id: log.id, name: log.name, date: log.date });
      return [];
    }
    const key = `${log.date}|${normalizedName(log.name)}`;
    if (!logNamesByDate.has(key)) {
      logNamesByDate.add(key);
      return [log];
    }
    const namesForDate = new Set([...logNamesByDate]
      .filter((value) => value.startsWith(`${log.date}|`))
      .map((value) => value.slice(log.date.length + 1)));
    const name = uniqueImportedName(log.name || 'Imported workout', namesForDate, renamed.logs);
    logNamesByDate.add(`${log.date}|${normalizedName(name)}`);
    return [{ ...log, name }];
  });
  const newPrograms = programs.flatMap((program) => {
    if (existingProgramIds.has(program.id)) {
      skipped.programs.push({ id: program.id, name: program.name });
      return [];
    }
    return [normalizeProgram({ ...program, name: uniqueImportedName(program.name, programNames, renamed.programs) })];
  });

  const gymIds = new Set(getGyms().map((item) => item.id));
  const gymNames = new Set(getGyms().map((item) => normalizedName(item.name)));
  const newGyms = gyms.flatMap((gym) => {
    if (gymIds.has(gym.id)) { skipped.gyms.push({ id: gym.id, name: gym.name }); return []; }
    gymIds.add(gym.id);
    return [{ ...gym, name: uniqueImportedName(gym.name, gymNames, renamed.gyms) }];
  });
  cache.gyms = [...getGyms(), ...newGyms];
  const newEquipment = equipment.filter((entry) => !getEquipment().some((item) => item.id === entry.id));
  cache.equipment = [...getEquipment(), ...newEquipment];
  cache.exercises = [...getExercises(), ...newExercises];
  cache.templates = [...getTemplates(), ...newTemplates];
  cache.logs = [...getLogs(), ...newLogs];
  cache.programs = [...getPrograms(), ...newPrograms].sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || a.name.localeCompare(b.name)
  ));
  if (settings) cache.settings = { ...DEFAULT_SETTINGS, ...settings };

  return {
    imported: { exercises: newExercises.length, templates: newTemplates.length, logs: newLogs.length, programs: newPrograms.length, gyms: newGyms.length, equipment: newEquipment.length, settings: Boolean(settings) },
    renamed,
    skipped,
  };
}

export async function importData(data, mode = 'merge') {
  const captured = context();
  if (DEV_BYPASS && !BASE_URL) {
    const result = importDataLocally(data, mode);
    dispatchSyncStatus();
    return result;
  }
  const result = await request('POST', '/import', { mode, data }, captured);
  assertCurrent(captured);
  await initData();
  assertCurrent(captured);
  return result;
}

export async function submitFeedback(message, build = '') {
  const captured = context();
  return request('POST', '/feedback', { message, build }, captured);
}

export async function deleteAccount() {
  const captured = context();
  const result = await request('DELETE', '/account', undefined, captured);
  assertCurrent(captured);
  writePendingLogQueue([], captured.owner);
  writePendingResourceQueue([], captured.owner);
  writePendingConflicts([], captured.owner);
  clearStoredUser();
  resetData();
  return result;
}


const recoveryReviews = new WeakMap();
export function beginLegacyRecovery(confirmedAccount, confirmedOwnership) {
  const captured = context();
  if (!captured.owner || confirmedAccount !== captured.owner || confirmedOwnership !== true) throw new Error('Verify the original account before reviewing older work.');
  const sources = recoverySources(storage());
  const review = { account: captured.owner, records: recoveryRecords(sources, readRecoveryJournal(storage()), captured.owner) };
  recoveryReviews.set(review, { captured, sources });
  return review;
}
function checkLegacyReview(review) {
  const saved = recoveryReviews.get(review);
  if (!saved) throw new Error('Open a new recovery review.');
  assertCurrent(saved.captured);
  if (JSON.stringify(saved.sources) !== JSON.stringify(recoverySources(storage()))) throw new Error('The preserved source changed. Reopen recovery.');
  return saved;
}
export function exportLegacyRecovery(review) {
  const { captured, sources } = checkLegacyReview(review);
  const decisions = readRecoveryJournal(storage());
  // A source already attributed to another account is not exported through this session.
  const allowed = sources.filter(source => !decisions.some(row => row.key === source.key && row.raw === source.raw && row.owner !== captured.owner));
  return JSON.stringify({ format: 'forge-local-recovery-v1', account: captured.owner, ownership: 'user-asserted; verify before repair', sources: allowed, decisions: decisions.filter(row => row.owner === captured.owner && allowed.some(source => source.key === row.key && source.raw === row.raw)) }, null, 2);
}
export async function reviewLegacyRecord(review, id, action) {
  const { captured, sources } = checkLegacyReview(review);
  const record = recoveryRecords(sources, readRecoveryJournal(storage()), captured.owner).find(row => row.id === id);
  if (!record || (record.state !== 'preserved' && !(record.state === 'set-aside' && action === 'restore'))) throw new Error('This source is already reviewed or requires support.');
  if (action === 'restore') {
    recordRecoveryDecision(storage(), record, captured.owner, 'preserved');
  } else if (action === 'archive') {
    recordRecoveryDecision(storage(), record, captured.owner, 'set-aside');
  } else if (action === 'stage' && record.recoverable) {
    const decisionsBeforeRead = JSON.stringify(readRecoveryJournal(storage()));
    const remoteItems = await request('GET', `/${record.resource}`, undefined, captured);
    checkLegacyReview(review);
    if (JSON.stringify(readRecoveryJournal(storage())) !== decisionsBeforeRead) throw new Error('A recovery decision changed while loading. Review again before staging.');
    if (!Array.isArray(remoteItems)) throw new Error('Could not verify the current cloud collection.');
    if (readPendingLogQueue(captured.owner).some(row => record.resource === 'logs' && row.id === record.local.id)
      || readPendingResourceQueue(captured.owner).some(row => row.resource === record.resource && row.id === record.local.id)
      || readPendingConflicts(captured.owner).some(row => row.resource === record.resource && row.itemId === record.local.id)) throw new Error('Resolve newer pending work for this item first.');
    const remote = remoteItems.find(row => row.id === record.local.id) ?? null;
    if (!remote || !Number.isInteger(remote.revision) || remote.revision <= 0) throw new Error('Missing, deleted or unversioned cloud work is export-only. Its absence cannot prove it was never saved.');
    const conflict = { id: `${record.resource}:${record.local.id}`, recoveryID: crypto.randomUUID(), resource: record.resource, operation: 'put', itemId: record.local.id,
      local: structuredClone(record.local), remote, actualRevision: remote.revision, createdAt: new Date().toISOString() };
    recordRecoveryDecision(storage(), record, captured.owner, 'staged', conflict);
    dispatchSyncStatus();
  } else { throw new Error('Deletion and unreadable work require separate support review.'); }
  review.records = recoveryRecords(sources, readRecoveryJournal(storage()), captured.owner);
  return review.records;
}
