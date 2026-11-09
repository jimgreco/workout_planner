// Weekly summary for the weekly-review routine (GET /weekly-summary).
//
// The `data` payload is a port of weekly-review's src/sources/workouts.js
// `collectWorkouts`, with src/stats.js rounding and src/week.js week math.
// Keep the keys, nesting, rounding and status values identical to that module.
// This file is pure: the handler performs the (read-only) DynamoDB reads.

import { createHash } from 'node:crypto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export const WEEK_ERROR = 'week must be a Monday (YYYY-MM-DD)';

// --- stats.js ---------------------------------------------------------------

export function round(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function delta(current, previous, digits = 0) {
  if (current == null || previous == null) return null;
  return round(current - previous, digits);
}

// --- week.js ----------------------------------------------------------------

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns { start, end } for a valid Monday YYYY-MM-DD, otherwise null. */
export function parseWeek(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  // Reject impossible dates such as 2026-02-30 that Date silently rolls over.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  if (d.getUTCDay() !== 1) return null;
  return { start: value, end: addDays(value, 6) };
}

export function previousWeek(week) {
  const start = addDays(week.start, -7);
  return { start, end: addDays(start, 6) };
}

// --- auth -------------------------------------------------------------------

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** The configured token hash, or null when the route is disabled. */
export function configuredTokenHash(env = process.env) {
  const hash = (env.WEEKLY_SUMMARY_TOKEN_SHA256 ?? '').trim().toLowerCase();
  const email = (env.WEEKLY_SUMMARY_EMAIL ?? '').trim();
  if (!email || !SHA256_HEX_RE.test(hash)) return null;
  return hash;
}

// --- workouts.js ------------------------------------------------------------

function isWorkingSet(set) {
  if (set.setType === 'warmup') return false;
  if (set.completion) return set.completion === 'recorded';
  // Older logs predate the completion field: count sets that have reps.
  return Boolean(set.reps || set.repsLeft || set.repsRight);
}

export function summarizeSessions(logs, exercises, week) {
  const inWeek = logs.filter((l) => l.date >= week.start && l.date <= week.end);
  const finished = inWeek.filter((l) => l.status === 'finished')
    .sort((a, b) => a.date.localeCompare(b.date));
  const setsByGroup = {};
  let workingSets = 0;
  let pbCount = 0;

  const sessions = finished.map((log) => {
    let sessionSets = 0;
    for (const item of log.exerciseItems ?? []) {
      const n = (item.sets ?? []).filter(isWorkingSet).length;
      sessionSets += n;
      const group = exercises[item.exerciseId]?.muscleGroup || 'Other';
      setsByGroup[group] = (setsByGroup[group] ?? 0) + n;
    }
    workingSets += sessionSets;
    const pbs = log.pbExerciseIds?.length ?? (log.hasPB ? 1 : 0);
    pbCount += pbs;
    let minutes = null;
    if (log.startTime && log.endTime) {
      const ms = Date.parse(log.endTime) - Date.parse(log.startTime) - (log.pausedDurationMs ?? 0);
      if (ms > 0 && ms < 6 * 3600e3) minutes = round(ms / 60000);
    }
    return {
      date: log.date,
      name: log.name || log.prescription?.templateName || 'Workout',
      workingSets: sessionSets,
      minutes,
      readiness: log.readiness ?? null,
      personalBests: (log.pbExerciseIds ?? []).map((id) => exercises[id]?.name).filter(Boolean),
      optional: Boolean(log.prescription?.optional),
    };
  });

  return {
    sessions,
    sessionCount: sessions.length,
    skippedCount: inWeek.filter((l) => l.status === 'skipped').length,
    workingSets,
    personalBestCount: pbCount,
    setsByMuscleGroup: Object.fromEntries(
      Object.entries(setsByGroup).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    ),
  };
}

export function activeProgram(programs, week) {
  const program = programs.find((p) => p.active) ?? null;
  if (!program) return null;
  const phase = (program.phases ?? []).find(
    (ph) => ph.startDate <= week.end && (!ph.endDate || ph.endDate >= week.start),
  );
  return { name: program.name, phase: phase?.name ?? null };
}

/**
 * Builds the `data` object from items already read for the account.
 * Logs are filtered to [prev.start, week.end] here, matching the
 * FilterExpression weekly-review applies on the server side.
 */
export function workoutsSummary({ logs, exerciseItems, programs, week, prev }) {
  const windowLogs = logs.filter((l) => typeof l.date === 'string' && l.date >= prev.start && l.date <= week.end);
  const exercises = Object.fromEntries(exerciseItems.map((e) => [e.id, { name: e.name, muscleGroup: e.muscleGroup }]));
  const current = summarizeSessions(windowLogs, exercises, week);
  const previous = summarizeSessions(windowLogs, exercises, prev);
  return {
    status: 'ok',
    program: activeProgram(programs, week),
    current,
    previous: { sessionCount: previous.sessionCount, workingSets: previous.workingSets, setsByMuscleGroup: previous.setsByMuscleGroup },
    change: {
      sessionCount: delta(current.sessionCount, previous.sessionCount),
      workingSets: delta(current.workingSets, previous.workingSets),
    },
  };
}
