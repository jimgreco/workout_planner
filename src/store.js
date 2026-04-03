// LocalStorage-backed data store

const KEYS = {
  exercises: 'wp_exercises',
  templates: 'wp_templates',
  logs: 'wp_logs',
};

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Exercises ──────────────────────────────────────────────
export function getExercises() {
  return load(KEYS.exercises) || [];
}

export function saveExercise(exercise) {
  const list = getExercises();
  if (exercise.id) {
    const idx = list.findIndex((e) => e.id === exercise.id);
    if (idx >= 0) list[idx] = exercise;
    else list.push(exercise);
  } else {
    list.push({ ...exercise, id: crypto.randomUUID() });
  }
  save(KEYS.exercises, list);
  return getExercises();
}

export function deleteExercise(id) {
  const list = getExercises().filter((e) => e.id !== id);
  save(KEYS.exercises, list);
  return list;
}

// ── Templates ──────────────────────────────────────────────
export function getTemplates() {
  return load(KEYS.templates) || [];
}

export function saveTemplate(template) {
  const list = getTemplates();
  if (template.id) {
    const idx = list.findIndex((t) => t.id === template.id);
    if (idx >= 0) list[idx] = template;
    else list.push(template);
  } else {
    list.push({ ...template, id: crypto.randomUUID() });
  }
  save(KEYS.templates, list);
  return getTemplates();
}

export function deleteTemplate(id) {
  const list = getTemplates().filter((t) => t.id !== id);
  save(KEYS.templates, list);
  return list;
}

// ── Workout Logs ───────────────────────────────────────────
export function getLogs() {
  return load(KEYS.logs) || [];
}

export function saveLog(log) {
  const list = getLogs();
  if (log.id) {
    const idx = list.findIndex((l) => l.id === log.id);
    if (idx >= 0) list[idx] = log;
    else list.push(log);
  } else {
    list.push({ ...log, id: crypto.randomUUID() });
  }
  save(KEYS.logs, list);
  return getLogs();
}

export function deleteLog(id) {
  const list = getLogs().filter((l) => l.id !== id);
  save(KEYS.logs, list);
  return list;
}

export function getLogsByDate(dateStr) {
  return getLogs().filter((l) => l.date === dateStr);
}
