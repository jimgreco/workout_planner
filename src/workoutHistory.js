const WEIGHT_TYPES = new Set(['weight', 'double', 'bar_double', 'none']);

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
  if (!loggedSet) return false;

  if (caps.common !== null) {
    return loggedRepValue(loggedSet) >= caps.common;
  }

  const checks = [];
  if (caps.left !== null) checks.push(loggedSideRepValue(loggedSet, 'left') >= caps.left);
  if (caps.right !== null) checks.push(loggedSideRepValue(loggedSet, 'right') >= caps.right);
  return checks.length > 0 && checks.every(Boolean);
}
