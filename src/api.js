/**
 * API client — single source of truth for all data.
 *
 * Holds an in-memory cache populated by initData() at login.
 * Reads are synchronous (from cache). Writes are async (API → update cache → return).
 *
 * Auth errors (401 / missing credential) dispatch a 'wp:auth-error' DOM event
 * so App.jsx can sign the user out without prop-drilling an error callback.
 */

import { getStoredCredential, DEV_BYPASS } from './auth.js';
import { normalizeProgram } from './programs.js';

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

function withExpectedRevision(item) {
  if (!Number.isInteger(item.revision)) return item;
  return { ...item, expectedRevision: item.revision };
}

function storage() {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function readPendingLogQueue() {
  try {
    const raw = storage()?.getItem(PENDING_LOG_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPendingResourceQueue() {
  try {
    const raw = storage()?.getItem(PENDING_RESOURCE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPendingConflicts() {
  try {
    const raw = storage()?.getItem(PENDING_CONFLICTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingLogQueue(queue) {
  const next = queue.filter((entry) => entry?.id);
  if (next.length === 0) {
    storage()?.removeItem(PENDING_LOG_QUEUE_KEY);
  } else {
    storage()?.setItem(PENDING_LOG_QUEUE_KEY, JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function writePendingResourceQueue(queue) {
  const next = queue.filter((entry) => entry?.resource && entry?.id && entry?.operation);
  if (next.length === 0) {
    storage()?.removeItem(PENDING_RESOURCE_QUEUE_KEY);
  } else {
    storage()?.setItem(PENDING_RESOURCE_QUEUE_KEY, JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function writePendingConflicts(conflicts) {
  const next = conflicts.filter((entry) => entry?.id && entry?.resource);
  if (next.length === 0) {
    storage()?.removeItem(PENDING_CONFLICTS_KEY);
  } else {
    storage()?.setItem(PENDING_CONFLICTS_KEY, JSON.stringify(next));
  }
  dispatchSyncStatus();
}

function dispatchSyncStatus(extra = {}) {
  const pendingLogSaves = readPendingLogQueue().length;
  const pendingResourceChanges = readPendingResourceQueue().length;
  const pendingConflicts = readPendingConflicts().length;
  window.dispatchEvent(new CustomEvent('wp:sync-status', {
    detail: {
      pendingLogSaves,
      pendingResourceChanges,
      pendingConflicts,
      pendingChanges: pendingLogSaves + pendingResourceChanges,
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

function mergePendingLogs(logs) {
  const byId = new Map(logs.map((log) => [log.id, log]));
  for (const pending of readPendingLogQueue()) {
    if (pending.operation === 'delete') {
      byId.delete(pending.id);
    } else {
      byId.set(pending.id, pendingLogItem(pending));
    }
  }
  return [...byId.values()];
}

function mergePendingCollection(resource, items) {
  const byId = new Map(items.map((item) => {
    const normalized = normalizeResourceItem(resource, item);
    return [normalized.id, normalized];
  }));
  for (const pending of readPendingResourceQueue().filter((entry) => entry.resource === resource)) {
    if (pending.operation === 'delete') {
      byId.delete(pending.id);
    } else if (pending.item) {
      byId.set(pending.id, normalizeResourceItem(resource, pendingResourceItem(pending.item)));
    }
  }
  return [...byId.values()];
}

function queuePendingLogSave(log) {
  const pending = pendingLogItem(log);
  const queue = readPendingLogQueue().filter((entry) => entry.id !== pending.id);
  queue.push({ ...stripLocalLogFields(pending), operation: 'put' });
  writePendingLogQueue(queue);
  return pending;
}

function queuePendingLogDelete(id) {
  const queue = readPendingLogQueue().filter((entry) => entry.id !== id);
  queue.push({
    id,
    operation: 'delete',
    pendingSyncAt: new Date().toISOString(),
  });
  writePendingLogQueue(queue);
}

function queuePendingResourceChange(resource, operation, itemOrId) {
  const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
  const item = typeof itemOrId === 'string' ? undefined : stripLocalResourceFields(itemOrId);
  const queue = readPendingResourceQueue().filter((entry) => !(entry.resource === resource && entry.id === id));
  queue.push({
    resource,
    operation,
    id,
    item,
    pendingSyncAt: new Date().toISOString(),
  });
  writePendingResourceQueue(queue);
}

function removePendingLogSave(id) {
  writePendingLogQueue(readPendingLogQueue().filter((entry) => entry.id !== id));
}

function removePendingResourceChange(resource, id) {
  writePendingResourceQueue(readPendingResourceQueue().filter((entry) => !(entry.resource === resource && entry.id === id)));
}

function removePendingConflict(conflictId) {
  writePendingConflicts(readPendingConflicts().filter((entry) => entry.id !== conflictId));
}

function pendingConflictId(resource, id) {
  return `${resource}:${id}`;
}

function storePendingConflict(resource, operation, local, error) {
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
    ...readPendingConflicts().filter((entry) => entry.id !== conflictId),
    conflict,
  ]);
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

/** Clear the cache (called on sign-out). */
export function resetData() {
  cache.exercises = null;
  cache.templates = null;
  cache.logs      = null;
  cache.programs  = null;
  cache.settings  = null;
  writePendingLogQueue([]);
  writePendingResourceQueue([]);
  writePendingConflicts([]);
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
async function request(method, path, body) {
  const credential = getStoredCredential();
  if (!credential) {
    window.dispatchEvent(new CustomEvent('wp:auth-error'));
    throw new AuthError('Session expired — please sign in again');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${credential}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('wp:auth-error'));
    throw new AuthError('Session expired — please sign in again');
  }

  if (!res.ok) {
    const { message, requestId, payload } = await responseError(res);
    const error = new Error(message);
    error.status = res.status;
    error.requestId = requestId;
    error.conflict = payload?.conflict;
    window.dispatchEvent(new CustomEvent('wp:api-error', {
      detail: { message, status: res.status, requestId, conflict: res.status === 409 },
    }));
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
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
  // In dev bypass mode with no real API configured, start with empty collections.
  if (DEV_BYPASS && !BASE_URL) {
    cache.exercises = [];
    cache.templates = [];
    cache.logs      = [];
    cache.programs  = [];
    cache.settings  = { ...DEFAULT_SETTINGS };
    return;
  }
  const [exercises, templates, logs, programs, settings] = await Promise.all([
    request('GET', '/exercises'),
    request('GET', '/templates'),
    request('GET', '/logs'),
    request('GET', '/programs'),
    request('GET', '/settings'),
  ]);
  cache.exercises = mergePendingCollection('exercises', exercises);
  cache.templates = mergePendingCollection('templates', templates);
  cache.logs      = mergePendingLogs(logs);
  cache.programs  = mergePendingCollection('programs', programs).sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || a.name.localeCompare(b.name)
  ));
  cache.settings  = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  dispatchSyncStatus();
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function getSettings() { return { ...DEFAULT_SETTINGS, ...(cache.settings ?? {}) }; }

export async function saveSettings(settings) {
  const saved = (DEV_BYPASS && !BASE_URL) ? settings : await request('PUT', '/settings', settings);
  cache.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  return cache.settings;
}

// ── Exercises ──────────────────────────────────────────────────────────────────
export function getExercises() { return cache.exercises ?? []; }

export async function saveExercise(exercise) {
  const id = exercise.id ?? crypto.randomUUID();
  const item = { ...exercise, id };
  let saved;
  if (DEV_BYPASS && !BASE_URL) {
    saved = item;
  } else {
    try {
      saved = await request('PUT', `/exercises/${id}`, withExpectedRevision(item));
      removePendingResourceChange('exercises', id);
      removePendingConflict(pendingConflictId('exercises', id));
    } catch (error) {
      if (error.status === 409) storePendingConflict('exercises', 'put', item, error);
      if (!isNetworkError(error)) throw error;
      saved = pendingResourceItem(item);
      queuePendingResourceChange('exercises', 'put', item);
    }
  }
  upsertCached('exercises', saved);
  return cache.exercises;
}

export async function deleteExercise(id) {
  if (!(DEV_BYPASS && !BASE_URL)) {
    try {
      await request('DELETE', `/exercises/${id}`);
      removePendingResourceChange('exercises', id);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      queuePendingResourceChange('exercises', 'delete', id);
    }
  }
  cache.exercises = (cache.exercises ?? []).filter((e) => e.id !== id);
  return cache.exercises;
}

// ── Templates ──────────────────────────────────────────────────────────────────
export function getTemplates() { 
  return (cache.templates ?? []).sort((a, b) => a.name.localeCompare(b.name)); 
}

export async function saveTemplate(template) {
  const id = template.id ?? crypto.randomUUID();
  const item = { ...template, id };
  let saved;
  if (DEV_BYPASS && !BASE_URL) {
    saved = item;
  } else {
    try {
      saved = await request('PUT', `/templates/${id}`, withExpectedRevision(item));
      removePendingResourceChange('templates', id);
      removePendingConflict(pendingConflictId('templates', id));
    } catch (error) {
      if (error.status === 409) storePendingConflict('templates', 'put', item, error);
      if (!isNetworkError(error)) throw error;
      saved = pendingResourceItem(item);
      queuePendingResourceChange('templates', 'put', item);
    }
  }
  upsertCached('templates', saved);
  return cache.templates;
}

export async function deleteTemplate(id) {
  if (!(DEV_BYPASS && !BASE_URL)) {
    try {
      await request('DELETE', `/templates/${id}`);
      removePendingResourceChange('templates', id);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      queuePendingResourceChange('templates', 'delete', id);
    }
  }
  cache.templates = (cache.templates ?? []).filter((t) => t.id !== id);
  return cache.templates;
}

// ── Programs ────────────────────────────────────────────────────────────────────
export function getPrograms() {
  return (cache.programs ?? []).sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || a.name.localeCompare(b.name)
  ));
}

export async function saveProgram(program) {
  const id = program.id ?? crypto.randomUUID();
  const item = normalizeProgram({ ...program, id });
  let saved;
  if (DEV_BYPASS && !BASE_URL) {
    saved = item;
  } else {
    try {
      saved = await request('PUT', `/programs/${id}`, withExpectedRevision(item));
      removePendingResourceChange('programs', id);
      removePendingConflict(pendingConflictId('programs', id));
    } catch (error) {
      if (error.status === 409) storePendingConflict('programs', 'put', item, error);
      if (!isNetworkError(error)) throw error;
      saved = pendingResourceItem(item);
      queuePendingResourceChange('programs', 'put', item);
    }
  }
  upsertCached('programs', saved);
  return getPrograms();
}

export async function deleteProgram(id) {
  if (!(DEV_BYPASS && !BASE_URL)) {
    try {
      await request('DELETE', `/programs/${id}`);
      removePendingResourceChange('programs', id);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      queuePendingResourceChange('programs', 'delete', id);
    }
  }
  cache.programs = (cache.programs ?? []).filter((program) => program.id !== id);
  return getPrograms();
}

// ── Workout Logs ───────────────────────────────────────────────────────────────
export function getLogs() { return cache.logs ?? []; }

export async function saveLog(log) {
  const id = log.id ?? crypto.randomUUID();
  const item = { ...stripLocalLogFields(log), id };
  let saved;
  if (DEV_BYPASS && !BASE_URL) {
    saved = item;
  } else {
    try {
      saved = await request('PUT', `/logs/${id}`, withExpectedRevision(item));
      removePendingLogSave(id);
      removePendingConflict(pendingConflictId('logs', id));
    } catch (error) {
      if (error.status === 409) storePendingConflict('logs', 'put', item, error);
      if (!isNetworkError(error)) throw error;
      saved = queuePendingLogSave(item);
    }
  }
  upsertLogItem(saved);
  return cache.logs;
}

export async function deleteLog(id) {
  if (!(DEV_BYPASS && !BASE_URL)) {
    try {
      await request('DELETE', `/logs/${id}`);
      removePendingLogSave(id);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      queuePendingLogDelete(id);
    }
  }
  cache.logs = (cache.logs ?? []).filter((l) => l.id !== id);
  return cache.logs;
}

export async function flushPendingLogSaves() {
  const queue = readPendingLogQueue();
  if (queue.length === 0 || (DEV_BYPASS && !BASE_URL)) {
    dispatchSyncStatus();
    return getLogs();
  }

  const remaining = [];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    try {
      if (entry.operation === 'delete') {
        await request('DELETE', `/logs/${entry.id}`);
        cache.logs = (cache.logs ?? []).filter((log) => log.id !== entry.id);
      } else {
        const saved = await request('PUT', `/logs/${entry.id}`, withExpectedRevision(stripLocalLogFields(entry)));
        upsertLogItem(saved);
      }
      removePendingConflict(pendingConflictId('logs', entry.id));
    } catch (error) {
      remaining.push(entry);
      remaining.push(...queue.slice(index + 1));
      if (error.status === 409) {
        const conflict = storePendingConflict('logs', entry.operation, entry, error);
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

  writePendingLogQueue(remaining);
  return getLogs();
}

export async function flushPendingResourceChanges() {
  const queue = readPendingResourceQueue();
  if (queue.length === 0 || (DEV_BYPASS && !BASE_URL)) {
    dispatchSyncStatus();
    return {
      exercises: getExercises(),
      templates: getTemplates(),
      programs: getPrograms(),
    };
  }

  const remaining = [];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    try {
      if (entry.operation === 'delete') {
        await request('DELETE', `/${entry.resource}/${entry.id}`);
        cache[entry.resource] = (cache[entry.resource] ?? []).filter((item) => item.id !== entry.id);
      } else {
        const saved = await request('PUT', `/${entry.resource}/${entry.id}`, withExpectedRevision(stripLocalResourceFields(entry.item)));
        upsertCached(entry.resource, saved);
      }
      removePendingConflict(pendingConflictId(entry.resource, entry.id));
    } catch (error) {
      remaining.push(entry);
      remaining.push(...queue.slice(index + 1));
      if (error.status === 409) {
        const conflict = storePendingConflict(entry.resource, entry.operation, entry.item ?? { id: entry.id }, error);
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

  writePendingResourceQueue(remaining);
  return {
    exercises: getExercises(),
    templates: getTemplates(),
    programs: getPrograms(),
  };
}

export async function flushPendingChanges() {
  const resources = await flushPendingResourceChanges();
  const updatedLogs = await flushPendingLogSaves();
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

function removePendingChangeForConflict(conflict) {
  if (conflict.resource === 'logs') {
    removePendingLogSave(conflict.itemId);
  } else {
    removePendingResourceChange(conflict.resource, conflict.itemId);
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

export async function resolvePendingConflict(conflictId, resolution) {
  const conflict = readPendingConflicts().find((entry) => entry.id === conflictId);
  if (!conflict) throw new Error('Conflict is no longer pending.');
  if (!['local', 'remote'].includes(resolution)) throw new Error('Conflict resolution is invalid.');

  if (resolution === 'remote') {
    removePendingChangeForConflict(conflict);
    applyRemoteConflictItem(conflict);
    removePendingConflict(conflict.id);
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
    : await request('PUT', `/${conflict.resource}/${conflict.itemId}`, withExpectedRevision(body));
  if (conflict.resource === 'logs') {
    upsertLogItem(saved);
  } else {
    upsertCached(conflict.resource, saved);
  }
  removePendingChangeForConflict(conflict);
  removePendingConflict(conflict.id);
  return currentCollections();
}

export function getLogsByDate(dateStr) {
  return (cache.logs ?? []).filter((l) => l.date === dateStr);
}

// ── Account / Support ─────────────────────────────────────────────────────────
export async function exportData() {
  return request('GET', '/export');
}

export function previewImportData(data, current = {
  exercises: getExercises(),
  templates: getTemplates(),
  logs: getLogs(),
  programs: getPrograms(),
}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Import file must be a Forge JSON export.');
  }
  const exercises = Array.isArray(data.exercises) ? data.exercises : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const programs = Array.isArray(data.programs) ? data.programs : [];
  const settings = data.settings && typeof data.settings === 'object';
  const existingIds = {
    exercises: new Set((current.exercises ?? []).map((item) => item.id)),
    templates: new Set((current.templates ?? []).map((item) => item.id)),
    logs: new Set((current.logs ?? []).map((item) => item.id)),
    programs: new Set((current.programs ?? []).map((item) => item.id)),
  };
  const duplicateIds = {
    exercises: exercises.filter((item) => existingIds.exercises.has(item.id)).length,
    templates: templates.filter((item) => existingIds.templates.has(item.id)).length,
    logs: logs.filter((item) => existingIds.logs.has(item.id)).length,
    programs: programs.filter((item) => existingIds.programs.has(item.id)).length,
  };
  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    counts: {
      exercises: exercises.length,
      templates: templates.length,
      logs: logs.length,
      programs: programs.length,
      settings: settings ? 1 : 0,
    },
    duplicateIds,
    isEmpty: exercises.length + templates.length + logs.length + programs.length === 0,
    targetIsEmpty: (current.exercises?.length ?? 0)
      + (current.templates?.length ?? 0)
      + (current.logs?.length ?? 0)
      + (current.programs?.length ?? 0) === 0,
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
  const exercises = Array.isArray(data.exercises) ? data.exercises : [];
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const programs = Array.isArray(data.programs) ? data.programs.map((program) => normalizeProgram(program)) : [];
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : undefined;
  const targetIsEmpty = getExercises().length + getTemplates().length + getLogs().length + getPrograms().length === 0;
  if (mode === 'emptyOnly' && !targetIsEmpty) {
    const error = new Error('Import can only restore into an empty account.');
    error.status = 409;
    throw error;
  }

  if (mode === 'emptyOnly') {
    cache.exercises = exercises;
    cache.templates = templates;
    cache.logs = logs;
    cache.programs = programs.sort((a, b) => (
      Number(Boolean(b.active)) - Number(Boolean(a.active))
      || a.name.localeCompare(b.name)
    ));
    if (settings) cache.settings = { ...DEFAULT_SETTINGS, ...settings };
    return {
      imported: { exercises: exercises.length, templates: templates.length, logs: logs.length, programs: programs.length, settings: Boolean(settings) },
      renamed: { exercises: [], templates: [], logs: [], programs: [] },
      skipped: { exercises: [], templates: [], logs: [], programs: [] },
    };
  }

  const renamed = { exercises: [], templates: [], logs: [], programs: [] };
  const skipped = { exercises: [], templates: [], logs: [], programs: [] };
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

  cache.exercises = [...getExercises(), ...newExercises];
  cache.templates = [...getTemplates(), ...newTemplates];
  cache.logs = [...getLogs(), ...newLogs];
  cache.programs = [...getPrograms(), ...newPrograms].sort((a, b) => (
    Number(Boolean(b.active)) - Number(Boolean(a.active))
    || a.name.localeCompare(b.name)
  ));
  if (settings) cache.settings = { ...DEFAULT_SETTINGS, ...settings };

  return {
    imported: { exercises: newExercises.length, templates: newTemplates.length, logs: newLogs.length, programs: newPrograms.length, settings: Boolean(settings) },
    renamed,
    skipped,
  };
}

export async function importData(data, mode = 'merge') {
  if (DEV_BYPASS && !BASE_URL) {
    const result = importDataLocally(data, mode);
    dispatchSyncStatus();
    return result;
  }
  const result = await request('POST', '/import', { mode, data });
  await initData();
  return result;
}

export async function submitFeedback(message, build = '') {
  return request('POST', '/feedback', { message, build });
}

export async function deleteAccount() {
  const result = await request('DELETE', '/account');
  resetData();
  return result;
}
