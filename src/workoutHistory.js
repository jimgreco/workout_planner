const WEIGHT_TYPES = new Set(['weight', 'double', 'bar_double', 'none']);

function logSortKey(log = {}) {
  return log.endTime || log.startTime || (log.date ? `${log.date}T00:00:00` : '');
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
