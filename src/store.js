// LocalStorage-backed data store.
// All keys are namespaced by userId (Google `sub`) so multiple accounts
// on the same browser never collide.

function getKeys(userId) {
  return {
    exercises: `wp_exercises_${userId}`,
    templates: `wp_templates_${userId}`,
    logs:      `wp_logs_${userId}`,
  };
}

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
export function getExercises(userId) {
  return load(getKeys(userId).exercises) || [];
}

export function saveExercise(userId, exercise) {
  const list = getExercises(userId);
  if (exercise.id) {
    const idx = list.findIndex((e) => e.id === exercise.id);
    if (idx >= 0) list[idx] = exercise;
    else list.push(exercise);
  } else {
    list.push({ ...exercise, id: crypto.randomUUID() });
  }
  save(getKeys(userId).exercises, list);
  return getExercises(userId);
}

export function deleteExercise(userId, id) {
  const list = getExercises(userId).filter((e) => e.id !== id);
  save(getKeys(userId).exercises, list);
  return list;
}

// ── Templates ──────────────────────────────────────────────
export function getTemplates(userId) {
  return load(getKeys(userId).templates) || [];
}

export function saveTemplate(userId, template) {
  const list = getTemplates(userId);
  if (template.id) {
    const idx = list.findIndex((t) => t.id === template.id);
    if (idx >= 0) list[idx] = template;
    else list.push(template);
  } else {
    list.push({ ...template, id: crypto.randomUUID() });
  }
  save(getKeys(userId).templates, list);
  return getTemplates(userId);
}

export function deleteTemplate(userId, id) {
  const list = getTemplates(userId).filter((t) => t.id !== id);
  save(getKeys(userId).templates, list);
  return list;
}

// ── Workout Logs ───────────────────────────────────────────
export function getLogs(userId) {
  return load(getKeys(userId).logs) || [];
}

export function saveLog(userId, log) {
  const list = getLogs(userId);
  if (log.id) {
    const idx = list.findIndex((l) => l.id === log.id);
    if (idx >= 0) list[idx] = log;
    else list.push(log);
  } else {
    list.push({ ...log, id: crypto.randomUUID() });
  }
  save(getKeys(userId).logs, list);
  return getLogs(userId);
}

export function deleteLog(userId, id) {
  const list = getLogs(userId).filter((l) => l.id !== id);
  save(getKeys(userId).logs, list);
  return list;
}

export function getLogsByDate(userId, dateStr) {
  return getLogs(userId).filter((l) => l.date === dateStr);
}
