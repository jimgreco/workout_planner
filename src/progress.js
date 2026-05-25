const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day) {
  return new Date(`${day}T00:00:00`);
}

function numeric(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function weightMultiplier(weightType) {
  return weightType === 'double' ? 2 : 1;
}

function setVolume(set, weightType) {
  return numeric(set.weight) * numeric(set.reps) * weightMultiplier(weightType);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function finishedLogs(logs = []) {
  return logs
    .filter((log) => log.status === 'finished')
    .sort((a, b) => (
      b.date.localeCompare(a.date)
      || String(b.endTime ?? b.startTime ?? '').localeCompare(String(a.endTime ?? a.startTime ?? ''))
      || b.id.localeCompare(a.id)
    ));
}

export function formatWeight(value) {
  return formatNumber(numeric(value));
}

function formatPersonalBestValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = Number(text);
  return Number.isFinite(parsed) ? formatNumber(parsed) : text;
}

export function personalBestLabel(personalBest) {
  if (!personalBest?.weight) return '';
  const weight = `${formatPersonalBestValue(personalBest.weight)} lbs`;
  const reps = formatPersonalBestValue(personalBest.reps);
  return numeric(personalBest.reps) > 0 ? `${weight} x ${reps} reps` : weight;
}

export function bestPersonalBestSet(sets = []) {
  return sets.reduce((best, set) => {
    const weightValue = numeric(set.weight);
    if (weightValue <= 0) return best;
    const repsValue = numeric(set.reps);
    if (!best || weightValue > best.weightValue || (weightValue === best.weightValue && repsValue > best.repsValue)) {
      return {
        weight: formatNumber(weightValue),
        reps: repsValue > 0 ? formatNumber(repsValue) : undefined,
        weightValue,
        repsValue,
      };
    }
    return best;
  }, null);
}

export function isPersonalBestImprovement(candidate, personalBest) {
  if (!candidate) return false;
  const currentWeight = numeric(personalBest?.weight);
  const currentReps = numeric(personalBest?.reps);
  if (candidate.weightValue > currentWeight) return true;
  if (candidate.weightValue === currentWeight && candidate.repsValue > currentReps) return true;
  return false;
}

export function personalBestPayload(candidate, date) {
  if (!candidate) return undefined;
  return {
    weight: candidate.weight,
    ...(candidate.reps ? { reps: candidate.reps } : {}),
    date,
  };
}

export function setLabel(set, weightType = 'weight') {
  const reps = set.reps || '—';
  const typePrefix = set.setType && set.setType !== 'working'
    ? `${set.setType.charAt(0).toUpperCase()}${set.setType.slice(1)} · `
    : '';
  const effort = [
    set.rpe ? `RPE ${set.rpe}` : '',
    set.rir ? `RIR ${set.rir}` : '',
  ].filter(Boolean).join(' · ');
  const effortSuffix = effort ? ` · ${effort}` : '';
  if (weightType === 'none') return `${typePrefix}${reps} reps${effortSuffix}`;
  const weight = set.weight ? `${formatWeight(set.weight)} lb` : '—';
  return `${typePrefix}${reps} x ${weight}${weightType === 'double' ? ' (2x)' : ''}${effortSuffix}`;
}

export function estimateOneRepMax(weight, reps) {
  const w = numeric(weight);
  const r = numeric(reps);
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

export function getExerciseHistory(exerciseId, logs = []) {
  return finishedLogs(logs)
    .map((log) => {
      const item = (log.exerciseItems || []).find((entry) => entry.exerciseId === exerciseId);
      if (!item) return null;
      const sets = item.sets || [];
      const volume = sets.reduce((sum, set) => sum + setVolume(set, item.weightType), 0);
      const bestSet = sets.reduce((best, set) => {
        const weight = numeric(set.weight) * weightMultiplier(item.weightType);
        const reps = numeric(set.reps);
        const score = item.weightType === 'none'
          ? reps
          : estimateOneRepMax(set.weight, set.reps) * weightMultiplier(item.weightType);
        if (!best || score > best.score) {
          return { set, score, weight, reps };
        }
        return best;
      }, null);
      return {
        id: `${log.id}-${exerciseId}`,
        logId: log.id,
        logName: log.name,
        date: log.date,
        item,
        sets,
        setCount: sets.length,
        volume,
        bestSet,
      };
    })
    .filter(Boolean);
}

export function summarizeExercise(exercise, logs = []) {
  const history = getExerciseHistory(exercise.id, logs);
  const totalVolume = history.reduce((sum, entry) => sum + entry.volume, 0);
  const totalSets = history.reduce((sum, entry) => sum + entry.setCount, 0);
  const best = history.reduce((currentBest, entry) => {
    if (!entry.bestSet) return currentBest;
    if (!currentBest || entry.bestSet.score > currentBest.score) {
      return { ...entry.bestSet, date: entry.date, item: entry.item };
    }
    return currentBest;
  }, null);

  return {
    exercise,
    history,
    sessions: history.length,
    totalVolume,
    totalSets,
    best,
    lastTrained: history[0]?.date,
  };
}

function startOfWeek(day) {
  const date = parseDay(day);
  const offset = date.getDay();
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function workoutStreak(logs) {
  const dates = [...new Set(logs.map((log) => log.date))].sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const previous = parseDay(dates[i - 1]);
    const current = parseDay(dates[i]);
    if (Math.round((previous - current) / DAY_MS) !== 1) break;
    streak += 1;
  }
  return streak;
}

function inRange(log, rangeDays) {
  if (rangeDays === 'all') return true;
  const days = Number(rangeDays);
  if (!Number.isFinite(days)) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return parseDay(log.date) >= cutoff;
}

export function buildProgress(logs = [], exercises = [], rangeDays = '90') {
  const allFinished = finishedLogs(logs);
  const scopedLogs = allFinished.filter((log) => inRange(log, rangeDays));
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  const weeklyMap = new Map();
  const muscleMap = new Map();
  let totalVolume = 0;
  let totalSets = 0;

  for (const log of scopedLogs) {
    const week = startOfWeek(log.date);
    const weekStats = weeklyMap.get(week) ?? { week, workouts: 0, volume: 0 };
    weekStats.workouts += 1;

    for (const item of log.exerciseItems || []) {
      const exercise = exerciseById.get(item.exerciseId);
      const muscleGroup = exercise?.muscleGroup || 'Other';
      const sets = item.sets || [];
      const setCount = sets.length;
      const volume = sets.reduce((sum, set) => sum + setVolume(set, item.weightType), 0);
      totalVolume += volume;
      totalSets += setCount;
      weekStats.volume += volume;

      const muscleStats = muscleMap.get(muscleGroup) ?? { muscleGroup, sets: 0, volume: 0 };
      muscleStats.sets += setCount;
      muscleStats.volume += volume;
      muscleMap.set(muscleGroup, muscleStats);
    }

    weeklyMap.set(week, weekStats);
  }

  const topExercises = exercises
    .map((exercise) => summarizeExercise(exercise, scopedLogs))
    .filter((summary) => summary.sessions > 0)
    .sort((a, b) => (
      b.totalVolume - a.totalVolume
      || b.sessions - a.sessions
      || a.exercise.name.localeCompare(b.exercise.name)
    ));

  const recentPBs = allFinished
    .flatMap((log) => (log.pbExerciseIds || []).map((exerciseId) => ({
      id: `${log.id}-${exerciseId}`,
      date: log.date,
      logName: log.name,
      exercise: exerciseById.get(exerciseId),
    })))
    .filter((entry) => entry.exercise)
    .slice(0, 6);

  return {
    logs: scopedLogs,
    totalWorkouts: scopedLogs.length,
    totalVolume,
    totalSets,
    averageSets: scopedLogs.length ? totalSets / scopedLogs.length : 0,
    streak: workoutStreak(allFinished),
    pbCount: scopedLogs.reduce((sum, log) => sum + (log.pbExerciseIds?.length || 0), 0),
    weeklySeries: [...weeklyMap.values()].sort((a, b) => a.week.localeCompare(b.week)),
    muscleSplit: [...muscleMap.values()].sort((a, b) => b.sets - a.sets),
    topExercises,
    recentPBs,
  };
}

export function formatVolume(value) {
  const rounded = Math.round(value);
  if (rounded >= 1000000) return `${(rounded / 1000000).toFixed(1)}M lb`;
  if (rounded >= 1000) return `${Math.round(rounded / 1000)}k lb`;
  return `${rounded.toLocaleString()} lb`;
}
