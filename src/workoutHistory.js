import { isWorkingSet } from './setEvidence.js';
import { personalBestContext, setLabel } from './progress.js';
import { formatWorkoutDuration } from './workoutTiming.js';
const WEIGHT_TYPES = new Set(['weight', 'double', 'bar_double', 'smith_double', 'none']);

function logSortKey(log = {}) {
  return log.endTime || log.startTime || (log.date ? `${log.date}T00:00:00` : '');
}

function cleanedText(value) {
  return String(value ?? '').trim();
}

function repTargetText(value) {
  const text = cleanedText(value);
  if (!text) return '';
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open >= 0 && close > open) {
    const goal = text.slice(open + 1, close).trim();
    if (goal) return goal;
  }
  return text;
}

function lastFinishedExerciseItem(exerciseId, logs = []) {
  const finished = [...logs]
    .filter((log) => log.status === 'finished')
    .sort((a, b) => logSortKey(b).localeCompare(logSortKey(a)));

  for (const log of finished) {
    const item = (log.exerciseItems || []).find((entry) => entry.exerciseId === exerciseId);
    if (item) return item;
  }
  return null;
}

export function lastWeightTypesByExerciseId(logs = []) {
  const result = {};
  const finished = [...logs]
    .filter((log) => log.status === 'finished')
    .sort((a, b) => logSortKey(b).localeCompare(logSortKey(a)));

  for (const log of finished) {
    for (const item of log.exerciseItems || []) {
      if (!item.exerciseId || result[item.exerciseId]) continue;
      const weightType = item.weightType || 'weight';
      if (WEIGHT_TYPES.has(weightType)) result[item.exerciseId] = weightType;
    }
  }

  return result;
}

export function routineExerciseNeedsWeightIncrease(item = {}, logs = []) {
  if (!item.exerciseId || item.weightType === 'none' || !item.sets?.length) return false;
  const targets = item.sets.filter(set => set.setType !== 'warmup');
  const targetSet = targets.at(-1);
  if (!targetSet) return false;
  const lastItem = lastFinishedExerciseItem(item.exerciseId, logs);
  if (!lastItem?.sets?.length || lastItem.weightType === 'none') return false;
  const recorded = lastItem.sets.filter(set => set.setType !== 'warmup');
  const loggedSet = recorded[targets.length - 1];
  if (!loggedSet || !isWorkingSet(loggedSet)) return false;
  if (personalBestContext(item) !== personalBestContext(lastItem)) return false;

  // A shared range applies to each side. Side targets override it, and an
  // explicitly blank side must not inherit a stale common rep count.
  const hasSides = usesSideReps(targetSet) || usesSideReps(loggedSet);
  const checks = [];
  for (const side of hasSides ? ['Left', 'Right'] : ['']) {
    const range = targetRange(targetSet, side);
    if (!range) continue;
    const value = side ? loggedSet[`reps${side}`] ?? loggedSet.reps : loggedSet.reps;
    const reps = recordedRepNumber(value);
    checks.push(reps !== null && reps >= range.max);
  }
  return checks.length > 0 && checks.every(Boolean);
}

function repRangeBounds(value) {
  const match = repTargetText(value).match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  return min > 0 && max >= min ? { min, max } : null;
}

function targetRange(set, side) {
  const sideFields = side ? [set[`placeholderReps${side}`], set[`reps${side}`]] : [];
  return [...sideFields, set.placeholderReps, set.reps].map(repRangeBounds).find(Boolean);
}

function recordedRepNumber(value) {
  const text = cleanedText(value);
  const number = Number(text);
  return text && Number.isFinite(number) && number > 0 ? number : null;
}

function usesSideReps(set) {
  return set.repMode === 'separateSides' || set.repMode === 'linkedSides'
    || ['repsLeft', 'repsRight', 'placeholderRepsLeft', 'placeholderRepsRight'].some(key => cleanedText(set[key]));
}

// Compare prescribed working-set positions, so an inserted warmup or a new
// third prescribed set cannot hide a miss in the two sets actually performed.
export function routineExerciseWeightDecreaseReason(item = {}, logs = []) {
  if (!item.exerciseId || item.weightType === 'none') return null;
  const lastItem = lastFinishedExerciseItem(item.exerciseId, logs);
  if (!lastItem || personalBestContext(item) !== personalBestContext(lastItem)) return null;
  const targets = (item.sets || []).filter(set => set.setType !== 'warmup');
  const recorded = (lastItem.sets || []).filter(set => set.setType !== 'warmup');
  for (let index = 0; index < Math.min(targets.length, recorded.length); index += 1) {
    const set = recorded[index];
    if (!isWorkingSet(set) || !Number.isFinite(Number(set.weight)) || !(Number(set.weight) > 0)) continue;
    const hasSides = set.repMode === 'separateSides' || set.repMode === 'linkedSides'
      || cleanedText(set.repsLeft) || cleanedText(set.repsRight);
    const sides = hasSides ? ['Left', 'Right'] : [''];
    for (const side of sides) {
      const range = targetRange(targets[index], side);
      const value = side ? set[`reps${side}`] ?? set.reps : set.reps;
      const reps = recordedRepNumber(value);
      if (range && reps !== null && reps < range.min) {
        const sideLabel = side ? ` (${side.toLowerCase()})` : '';
        return `Last time, set ${index + 1}${sideLabel}: ${reps} reps; target ${range.min}–${range.max}. Try the next lighter weight than you used for that set, keeping your reps controlled.`;
      }
    }
  }
  return null;
}

export function routineExerciseWeightAdvice(item = {}, logs = [], { usesTime = false } = {}) {
  if (usesTime) return null;
  const message = routineExerciseWeightDecreaseReason(item, logs);
  // A missed lower bound takes priority even if a later, lighter set hit its cap.
  if (message) return { direction: 'decrease', label: 'Lower weight', message };
  if (routineExerciseNeedsWeightIncrease(item, logs)) {
    return { direction: 'increase', label: 'Add weight', message: 'Increase weight next time.' };
  }
  return null;
}
export function matchesHistorySearch(log, query, exercises) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const names = new Map(exercises.map(exercise => [exercise.id, exercise.name]));
  const text = [log.name, log.date, log.notes, ...(log.exerciseItems ?? []).map(item => names.get(item.exerciseId))]
    .filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every(term => text.includes(term));
}

export function workoutSummary(log, exercises) {
  const lines = [log.name, `Date: ${log.date}`];
  if (log.startTime && log.endTime) lines.push(`Duration: ${formatWorkoutDuration(log)}`);
  for (const item of log.exerciseItems ?? []) {
    const exercise = exercises.find(entry => entry.id === item.exerciseId);
    lines.push('', exercise?.name || 'Unknown exercise');
    for (const [index, set] of (item.sets ?? []).entries()) {
      lines.push(`Set ${index + 1}: ${setLabel(set, item.weightType, exercise?.usesTime)}`);
    }
  }
  if (log.notes) lines.push('', `Notes: ${log.notes}`);
  return lines.join('\n');
}

export const HISTORY_DATE_RANGES = [
  { days: 0, label: 'All time' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

export function matchesHistoryDateRange(day, days, today) {
  if (!days) return true;
  // Date-only values use calendar arithmetic; elapsed hours would drift at DST.
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return day >= start.toISOString().slice(0, 10) && day <= today;
}
