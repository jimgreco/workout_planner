// Detailed workout evidence for the check-in coaching routine
// (GET /checkin-evidence?start=YYYY-MM-DD&end=YYYY-MM-DD).
//
// It shares the weekly-summary bearer token and account (see weekly-summary.mjs
// and docs/OPERATIONS.md). The field projection mirrors the beach-checkin MCP
// server's evidence.mjs (SET_FIELDS, SETUP_FIELDS, exerciseItem, normalize):
// only allow-listed fields leave the API, never raw items, and entered loads,
// side reps and null RIR are passed through exactly as stored (no totals,
// estimated maxes or PRs). This file is pure: the handler performs the
// (read-only) DynamoDB reads.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const DEFAULT_TIMEZONE = 'America/New_York';
export const MAX_RANGE_DAYS = 31;
export const RANGE_ERROR = `start and end must be YYYY-MM-DD dates with start <= end, spanning 1-${MAX_RANGE_DAYS} days`;

const LOG_FIELDS = ['id', 'name', 'date', 'startTime', 'endTime', 'pausedDurationMs', 'status', 'notes'];
const ITEM_FIELDS = ['exerciseId', 'weightType', 'baselineId', 'techniqueNote', 'targetRIR', 'useIndividualReps'];
export const SET_FIELDS = ['weight', 'reps', 'repsLeft', 'repsRight', 'rir', 'rpe', 'repMode', 'setType', 'completion', 'restDuration'];
export const SETUP_FIELDS = ['id', 'name', 'gym', 'machine', 'seat', 'grip', 'loadConvention', 'smithBarWeight'];
const PRESCRIPTION_FIELDS = ['templateId', 'templateName', 'programId', 'programName', 'phaseName', 'optional', 'targetRir', 'day'];
const PROGRAM_FIELDS = ['id', 'name', 'active', 'startDate', 'endDate'];
const SCHEDULE_FIELDS = ['id', 'templateId', 'optional'];
const PHASE_FIELDS = ['id', 'name', 'startDate', 'endDate', 'setsPerExercise', 'targetRir', 'allowOptional'];
// Records copied in from another provider or app carry one of these markers;
// the app's own log writes never do (validateLog rejects them).
const PROVIDER_MARKERS = ['source', 'source_detail', 'provider'];

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Returns { start, end } for a valid inclusive 1-31 day range, otherwise null. */
export function parseRange(start, end) {
  if (!validDate(start) || !validDate(end)) return null;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1 || days > MAX_RANGE_DAYS) return null;
  return { start, end };
}

export function validTimezone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The account's stored timezone when it has a valid one, else America/New_York. */
export function resolveTimezone(...candidates) {
  return candidates.find(validTimezone) ?? DEFAULT_TIMEZONE;
}

export function localDay(value, timezone) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A log's day: the local day of startTime, falling back to the stored date. */
export function logDay(log, timezone) {
  return localDay(log.startTime, timezone) ?? (validDate(log.date) ? log.date : null);
}

function fields(row, keys) {
  const source = row && typeof row === 'object' ? row : {};
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}

const list = (value) => (Array.isArray(value) ? value : []);
const isDeleted = (row) => Boolean(row.deleted === true || row.deletedAt || row.deleted_at);
const isProviderCopy = (row) => PROVIDER_MARKERS.some((k) => row[k] != null && row[k] !== '');
// Fail closed on anything that names Oura (recovery data must never reach the
// model), matching whole words so notes like "encouraging" are not dropped.
const mentionsOura = (row) => /\boura\b/i.test(JSON.stringify(row));
const excluded = (row) => isDeleted(row) || isProviderCopy(row) || mentionsOura(row);

function exerciseItem(item, exercises) {
  const exercise = exercises.get(item?.exerciseId);
  const base = fields(item, ITEM_FIELDS);
  return {
    exerciseId: base.exerciseId,
    name: exercise?.name ?? null,
    muscleGroup: exercise?.muscleGroup ?? null,
    ...base,
    setupProfile: fields(item?.setupProfile, SETUP_FIELDS),
    sets: list(item?.sets).map((set) => fields(set, SET_FIELDS)),
  };
}

function projectLog(log, day, exercises) {
  const base = fields(log, LOG_FIELDS);
  return {
    id: base.id,
    name: base.name,
    day,
    ...base,
    exerciseItems: list(log.exerciseItems).map((item) => exerciseItem(item, exercises)),
    prescription: log.prescription && typeof log.prescription === 'object'
      ? { ...fields(log.prescription, PRESCRIPTION_FIELDS), exerciseItems: list(log.prescription.exerciseItems).map((item) => exerciseItem(item, exercises)) }
      : null,
  };
}

function projectProgram(program) {
  return {
    ...fields(program, PROGRAM_FIELDS),
    schedule: list(program.schedule).map((slot) => fields(slot, SCHEDULE_FIELDS)),
    phases: list(program.phases).map((phase) => fields(phase, PHASE_FIELDS)),
  };
}

/** Builds the `data` object from items already read for the account. */
export function checkinEvidence({ logs, exerciseItems, programs, range, timezone }) {
  const exercises = new Map(exerciseItems.filter((e) => e?.id && !isDeleted(e))
    .map((e) => [e.id, { name: e.name ?? null, muscleGroup: e.muscleGroup ?? null }]));
  const selected = [];
  for (const log of logs) {
    if (!log || typeof log !== 'object' || excluded(log)) continue;
    const day = logDay(log, timezone);
    if (!day || day < range.start || day > range.end) continue;
    selected.push(projectLog(log, day, exercises));
  }
  selected.sort((a, b) => String(a.startTime || a.date || a.day).localeCompare(String(b.startTime || b.date || b.day))
    || String(a.id).localeCompare(String(b.id)));
  return {
    status: 'ok',
    logs: selected,
    programs: programs.filter((p) => p && typeof p === 'object' && !excluded(p)).map(projectProgram)
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}
