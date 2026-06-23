const DAY_MS = 24 * 60 * 60 * 1000;

function randomId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function startOfToday(base = new Date()) {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function localDateKey(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

export function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiff(start, end) {
  return Math.round((startOfToday(end) - startOfToday(start)) / DAY_MS);
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function templateIdValue(value) {
  return trimString(value);
}

export function createProgramScheduleItem(overrides = {}) {
  const templateId = templateIdValue(overrides.templateId);
  const notes = trimString(overrides.notes);
  return {
    id: trimString(overrides.id) || randomId('program-day'),
    ...(templateId ? { templateId } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function normalizeProgramSchedule(schedule) {
  if (!Array.isArray(schedule)) return [];
  const seenIds = new Set();
  return schedule
    .map((item) => createProgramScheduleItem(item))
    .filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
}

export function normalizeInsertedRestDays(insertedRestDays) {
  if (!Array.isArray(insertedRestDays)) return [];
  const seen = new Set();
  return insertedRestDays
    .map((value) => trimString(value))
    .filter((value) => parseLocalDate(value) && !seen.has(value) && seen.add(value))
    .sort();
}

export function normalizeProgram(program) {
  const normalized = {
    ...program,
    schedule: normalizeProgramSchedule(program?.schedule),
    insertedRestDays: normalizeInsertedRestDays(program?.insertedRestDays),
    startDate: parseLocalDate(program?.startDate) ? program.startDate : localDateKey(startOfToday()),
  };
  if (!Array.isArray(program?.activity)) normalized.activity = [];
  return normalized;
}

export function scheduleItemTitle(item, templatesById) {
  const templateId = templateIdValue(item?.templateId);
  if (!templateId) return 'Rest';
  return templatesById?.get(templateId)?.name || 'Missing routine';
}

export function swapProgramScheduleDays(schedule, sourceId, targetId) {
  const normalized = normalizeProgramSchedule(schedule);
  const sourceIndex = normalized.findIndex((item) => item.id === sourceId);
  const targetIndex = normalized.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return normalized;
  const next = [...normalized];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return next;
}

export function moveProgramScheduleDay(schedule, sourceIndex, targetIndex) {
  const normalized = normalizeProgramSchedule(schedule);
  if (!normalized.length) return normalized;
  const from = Math.min(Math.max(sourceIndex, 0), normalized.length - 1);
  const to = Math.min(Math.max(targetIndex, 0), normalized.length - 1);
  if (from === to) return normalized;
  const next = [...normalized];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function replaceProgramScheduleItem(schedule, itemId, patch) {
  return normalizeProgramSchedule(schedule).map((item) => (
    item.id === itemId ? createProgramScheduleItem({ ...item, ...patch }) : item
  ));
}

export function removeProgramScheduleItem(schedule, itemId) {
  return normalizeProgramSchedule(schedule).filter((item) => item.id !== itemId);
}

export function insertProgramRestDay(program, dayKey) {
  const normalized = normalizeProgram(program);
  if (!parseLocalDate(dayKey)) return normalized;
  const nextRestDays = normalizeInsertedRestDays([...normalized.insertedRestDays, dayKey]);
  return {
    ...normalized,
    insertedRestDays: nextRestDays,
  };
}

export function removeProgramRestDay(program, dayKey) {
  const normalized = normalizeProgram(program);
  if (!parseLocalDate(dayKey)) return normalized;
  return {
    ...normalized,
    insertedRestDays: normalized.insertedRestDays.filter((value) => value !== dayKey),
  };
}

export function programSlotForDate(program, date, templatesById = null) {
  const normalized = normalizeProgram(program);
  const targetDate = typeof date === 'string' ? parseLocalDate(date) : startOfToday(date);
  const dayKey = targetDate ? localDateKey(targetDate) : trimString(date);
  const startDate = parseLocalDate(normalized.startDate);

  if (!targetDate || !startDate || normalized.schedule.length === 0) {
    return {
      date: targetDate ?? startOfToday(),
      dayKey,
      scheduleIndex: null,
      scheduleItem: null,
      cycleRound: null,
      template: null,
      templateId: '',
      isInsertedRest: false,
      isBeforeStart: false,
      isRest: true,
    };
  }

  if (targetDate < startDate) {
    return {
      date: targetDate,
      dayKey,
      scheduleIndex: null,
      scheduleItem: null,
      cycleRound: null,
      template: null,
      templateId: '',
      isInsertedRest: false,
      isBeforeStart: true,
      isRest: true,
    };
  }

  if (normalized.insertedRestDays.includes(dayKey)) {
    return {
      date: targetDate,
      dayKey,
      scheduleIndex: null,
      scheduleItem: null,
      cycleRound: null,
      template: null,
      templateId: '',
      isInsertedRest: true,
      isBeforeStart: false,
      isRest: true,
    };
  }

  const priorRestCount = normalized.insertedRestDays.filter((value) => value < dayKey).length;
  const elapsed = dayDiff(startDate, targetDate) - priorRestCount;
  if (elapsed < 0) {
    return {
      date: targetDate,
      dayKey,
      scheduleIndex: null,
      scheduleItem: null,
      cycleRound: null,
      template: null,
      templateId: '',
      isInsertedRest: false,
      isBeforeStart: true,
      isRest: true,
    };
  }

  const scheduleIndex = modulo(elapsed, normalized.schedule.length);
  const cycleRound = Math.floor(elapsed / normalized.schedule.length);
  const scheduleItem = normalized.schedule[scheduleIndex];
  const templateId = templateIdValue(scheduleItem?.templateId);
  const template = templateId && templatesById ? templatesById.get(templateId) ?? null : null;
  return {
    date: targetDate,
    dayKey,
    scheduleIndex,
    scheduleItem,
    cycleRound,
    template,
    templateId,
    isInsertedRest: false,
    isBeforeStart: false,
    isRest: !templateId || !template,
  };
}

export function isHandledOn(logs, template, dayKey) {
  return logs.some((log) => (
    log.date === dayKey
    && (log.status === 'finished' || log.status === 'skipped')
    && String(log.name ?? '').trim().toLowerCase() === template.name.trim().toLowerCase()
  ));
}

export function nextProgramWorkout(program, templates, logs, lookaheadDays = 28) {
  const normalized = normalizeProgram(program);
  if (!normalized.schedule.length) return null;
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const today = startOfToday();

  for (let offset = 0; offset < lookaheadDays; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const slot = programSlotForDate(normalized, date, templatesById);
    if (!slot.template || isHandledOn(logs, slot.template, slot.dayKey)) continue;
    return {
      program: normalized,
      date,
      dayKey: slot.dayKey,
      template: slot.template,
      scheduleItem: slot.scheduleItem,
      scheduleIndex: slot.scheduleIndex,
      position: (slot.scheduleIndex ?? 0) + 1,
      total: normalized.schedule.length,
    };
  }

  return null;
}

function programStatus(slot, logs) {
  if (!slot.template) return 'rest';
  if (isHandledOn(logs, slot.template, slot.dayKey)) {
    return logs.some((log) => (
      log.date === slot.dayKey
      && log.status === 'finished'
      && String(log.name ?? '').trim().toLowerCase() === slot.template.name.trim().toLowerCase()
    )) ? 'done' : 'skipped';
  }
  return slot.date < startOfToday() ? 'missed' : 'planned';
}

export function upcomingProgramSchedule(program, templates, logs, days = 21) {
  const normalized = normalizeProgram(program);
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const today = startOfToday();

  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const slot = programSlotForDate(normalized, date, templatesById);
    return {
      id: slot.dayKey,
      date,
      dayKey: slot.dayKey,
      scheduleIndex: slot.scheduleIndex,
      scheduleItem: slot.scheduleItem,
      cycleRound: slot.cycleRound,
      templateId: slot.templateId,
      template: slot.template,
      templates: slot.template ? [slot.template] : [],
      isInsertedRest: slot.isInsertedRest,
      isBeforeStart: slot.isBeforeStart,
      status: programStatus(slot, logs),
    };
  });
}

export function programAdherence(program, templates, logs, weeks = 4) {
  const normalized = normalizeProgram(program);
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(today.getDate() - ((weeks * 7) - 1));

  const summary = {
    weeks,
    scheduled: 0,
    completed: 0,
    skipped: 0,
    missed: 0,
    remainingToday: 0,
    completionRate: 0,
  };

  if (!normalized.schedule.length) return summary;

  for (let date = new Date(start); date <= today; date.setDate(date.getDate() + 1)) {
    const slot = programSlotForDate(normalized, date, templatesById);
    if (!slot.template) continue;
    summary.scheduled += 1;
    if (isHandledOn(logs, slot.template, slot.dayKey)) {
      const completed = logs.some((log) => (
        log.date === slot.dayKey
        && log.status === 'finished'
        && String(log.name ?? '').trim().toLowerCase() === slot.template.name.trim().toLowerCase()
      ));
      if (completed) summary.completed += 1;
      else summary.skipped += 1;
    } else if (slot.date < today) {
      summary.missed += 1;
    } else {
      summary.remainingToday += 1;
    }
  }

  summary.completionRate = summary.scheduled > 0
    ? Math.round((summary.completed / summary.scheduled) * 100)
    : 0;
  return summary;
}
