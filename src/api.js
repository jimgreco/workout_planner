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
  settings:  /** @type {any|null} */ (null),
};

const DEFAULT_SETTINGS = { defaultSets: 4, defaultReps: 8 };

/** Clear the cache (called on sign-out). */
export function resetData() {
  cache.exercises = null;
  cache.templates = null;
  cache.logs      = null;
  cache.settings  = null;
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
    const message = await responseErrorMessage(res);
    window.dispatchEvent(new CustomEvent('wp:api-error', { detail: { message } }));
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function responseErrorMessage(res) {
  const text = await res.text();
  if (!text) return `API ${res.status}`;
  try {
    const payload = JSON.parse(text);
    return payload?.error || `API ${res.status}: ${text}`;
  } catch {
    return `API ${res.status}: ${text}`;
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
    cache.settings  = { ...DEFAULT_SETTINGS };
    return;
  }
  const [exercises, templates, logs, settings] = await Promise.all([
    request('GET', '/exercises'),
    request('GET', '/templates'),
    request('GET', '/logs'),
    request('GET', '/settings'),
  ]);
  cache.exercises = exercises;
  cache.templates = templates;
  cache.logs      = logs;
  cache.settings  = settings ?? { ...DEFAULT_SETTINGS };
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function getSettings() { return cache.settings ?? { ...DEFAULT_SETTINGS }; }

export async function saveSettings(settings) {
  const saved = (DEV_BYPASS && !BASE_URL) ? settings : await request('PUT', '/settings', settings);
  cache.settings = saved;
  return saved;
}

// ── Exercises ──────────────────────────────────────────────────────────────────
export function getExercises() { return cache.exercises ?? []; }

export async function saveExercise(exercise) {
  const id = exercise.id ?? crypto.randomUUID();
  const item = { ...exercise, id };
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await request('PUT', `/exercises/${id}`, item);
  const list = cache.exercises ?? [];
  const idx = list.findIndex((e) => e.id === id);
  cache.exercises = idx >= 0
    ? list.map((e, i) => (i === idx ? saved : e))
    : [...list, saved];
  return cache.exercises;
}

export async function deleteExercise(id) {
  if (!(DEV_BYPASS && !BASE_URL)) await request('DELETE', `/exercises/${id}`);
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
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await request('PUT', `/templates/${id}`, item);
  const list = cache.templates ?? [];
  const idx = list.findIndex((t) => t.id === id);
  const updated = idx >= 0
    ? list.map((t, i) => (i === idx ? saved : t))
    : [...list, saved];
  cache.templates = updated.sort((a, b) => a.name.localeCompare(b.name));
  return cache.templates;
}

export async function deleteTemplate(id) {
  if (!(DEV_BYPASS && !BASE_URL)) await request('DELETE', `/templates/${id}`);
  cache.templates = (cache.templates ?? []).filter((t) => t.id !== id);
  return cache.templates;
}

// ── Workout Logs ───────────────────────────────────────────────────────────────
export function getLogs() { return cache.logs ?? []; }

export async function saveLog(log) {
  const id = log.id ?? crypto.randomUUID();
  const item = { ...log, id };
  const saved = (DEV_BYPASS && !BASE_URL) ? item : await request('PUT', `/logs/${id}`, item);
  const list = cache.logs ?? [];
  const idx = list.findIndex((l) => l.id === id);
  cache.logs = idx >= 0
    ? list.map((l, i) => (i === idx ? saved : l))
    : [...list, saved];
  return cache.logs;
}

export async function deleteLog(id) {
  if (!(DEV_BYPASS && !BASE_URL)) await request('DELETE', `/logs/${id}`);
  cache.logs = (cache.logs ?? []).filter((l) => l.id !== id);
  return cache.logs;
}

export function getLogsByDate(dateStr) {
  return (cache.logs ?? []).filter((l) => l.date === dateStr);
}

// ── Account / Support ─────────────────────────────────────────────────────────
export async function exportData() {
  return request('GET', '/export');
}

export async function submitFeedback(message, build = '') {
  return request('POST', '/feedback', { message, build });
}

export async function deleteAccount() {
  const result = await request('DELETE', '/account');
  resetData();
  return result;
}
