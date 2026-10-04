import { isWorkingSet } from './setEvidence.js';
import { personalBestContext } from './progress.js';
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

function repRangeMax(value) {
  const text = repTargetText(value);
  const match = text.match(/^\s*\d+(?:\.\d+)?\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const max = Number.parseFloat(match[1]);
  return Number.isFinite(max) ? max : null;
}

function repNumber(value) {
  const match = cleanedText(value).match(/^\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number.parseFloat(match[0]);
  return Number.isFinite(number) ? number : null;
}

function firstRepRangeMax(values) {
  for (const value of values) {
    const max = repRangeMax(value);
    if (max !== null) return max;
  }
  return null;
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

function loggedRepValue(set = {}) {
  return Math.max(
    repNumber(set.reps) ?? 0,
    repNumber(set.repsLeft) ?? 0,
    repNumber(set.repsRight) ?? 0,
  );
}

function loggedSideRepValue(set = {}, side) {
  const sideValue = side === 'left' ? set.repsLeft : set.repsRight;
  return repNumber(sideValue) ?? repNumber(set.reps) ?? 0;
}

function routineLastSetRepCaps(set = {}) {
  const common = firstRepRangeMax([set.placeholderReps, set.reps]);
  const left = firstRepRangeMax([set.placeholderRepsLeft, set.repsLeft]);
  const right = firstRepRangeMax([set.placeholderRepsRight, set.repsRight]);
  return { common, left, right };
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

  const targetSet = item.sets.at(-1);
  const caps = routineLastSetRepCaps(targetSet);
  if (caps.common === null && caps.left === null && caps.right === null) return false;

  const lastItem = lastFinishedExerciseItem(item.exerciseId, logs);
  if (!lastItem?.sets?.length || lastItem.weightType === 'none') return false;
  if (lastItem.sets.length < item.sets.length) return false;

  const loggedSet = lastItem.sets[item.sets.length - 1];
  if (!loggedSet || !isWorkingSet(loggedSet)) return false;
  if (personalBestContext(item) !== personalBestContext(lastItem)) return false;

  if (caps.common !== null) {
    return loggedRepValue(loggedSet) >= caps.common;
  }

  const checks = [];
  if (caps.left !== null) checks.push(loggedSideRepValue(loggedSet, 'left') >= caps.left);
  if (caps.right !== null) checks.push(loggedSideRepValue(loggedSet, 'right') >= caps.right);
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
