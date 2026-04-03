/**
 * API client — replaces store.js.
 *
 * Holds an in-memory cache populated by initData() at login.
 * Reads are synchronous (from cache). Writes are async (API → update cache → return list).
 *
 * Auth errors (401 / missing credential) dispatch a 'wp:auth-error' DOM event
 * so App.jsx can sign the user out without prop-drilling an error callback.
 */

import { getStoredCredential } from './auth.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Thrown when the session credential is missing or the server returns 401. */
export class AuthError extends Error {}

// ── In-memory cache ────────────────────────────────────────────────────────────
const cache = {
  exercises: /** @type {any[]|null} */ (null),
  templates: /** @type {any[]|null} */ (null),
  logs:      /** @type {any[]|null} */ (null),
};

/** Clear the cache (called on sign-out). */
export function resetData() {
  cache.exercises = null;
  cache.templates = null;
  cache.logs      = null;
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

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
/** Fetch all three collections in parallel and populate the cache. */
export async function initData() {
  const [exercises, templates, logs] = await Promise.all([
    request('GET', '/exercises'),
    request('GET', '/templates'),
    request('GET', '/logs'),
  ]);
  cache.exercises = exercises;
  cache.templates = templates;
  cache.logs      = logs;
}

// ── Exercises ──────────────────────────────────────────────────────────────────
export function getExercises() { return cache.exercises ?? []; }

export async function saveExercise(exercise) {
  const id = exercise.id ?? crypto.randomUUID();
  const saved = await request('PUT', `/exercises/${id}`, { ...exercise, id });
  const list = cache.exercises ?? [];
  const idx = list.findIndex((e) => e.id === id);
  cache.exercises = idx >= 0
    ? list.map((e, i) => (i === idx ? saved : e))
    : [...list, saved];
  return cache.exercises;
}

export async function deleteExercise(id) {
  await request('DELETE', `/exercises/${id}`);
  cache.exercises = (cache.exercises ?? []).filter((e) => e.id !== id);
  return cache.exercises;
}

// ── Templates ──────────────────────────────────────────────────────────────────
export function getTemplates() { return cache.templates ?? []; }

export async function saveTemplate(template) {
  const id = template.id ?? crypto.randomUUID();
  const saved = await request('PUT', `/templates/${id}`, { ...template, id });
  const list = cache.templates ?? [];
  const idx = list.findIndex((t) => t.id === id);
  cache.templates = idx >= 0
    ? list.map((t, i) => (i === idx ? saved : t))
    : [...list, saved];
  return cache.templates;
}

export async function deleteTemplate(id) {
  await request('DELETE', `/templates/${id}`);
  cache.templates = (cache.templates ?? []).filter((t) => t.id !== id);
  return cache.templates;
}

// ── Workout Logs ───────────────────────────────────────────────────────────────
export function getLogs() { return cache.logs ?? []; }

export async function saveLog(log) {
  const id = log.id ?? crypto.randomUUID();
  const saved = await request('PUT', `/logs/${id}`, { ...log, id });
  const list = cache.logs ?? [];
  const idx = list.findIndex((l) => l.id === id);
  cache.logs = idx >= 0
    ? list.map((l, i) => (i === idx ? saved : l))
    : [...list, saved];
  return cache.logs;
}

export async function deleteLog(id) {
  await request('DELETE', `/logs/${id}`);
  cache.logs = (cache.logs ?? []).filter((l) => l.id !== id);
  return cache.logs;
}

export function getLogsByDate(dateStr) {
  return (cache.logs ?? []).filter((l) => l.date === dateStr);
}
