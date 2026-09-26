import { effectiveWeight, smithLoadContext } from './weight.js';
import { isWorkingSet, normalizedRir } from './setEvidence.js';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day) {
  return new Date(`${day}T00:00:00`);
}

function numeric(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function setRepTotal(set) {
  const reps = numeric(set.reps);
  if (set.repMode === 'single' || set.repMode === 'linkedSides') {
    return Math.max(reps, numeric(set.repsLeft), numeric(set.repsRight));
  }
  const sideTotal = numeric(set.repsLeft) + numeric(set.repsRight);
  return sideTotal > 0 ? sideTotal : reps;
}

function setRepBest(set) {
  return Math.max(numeric(set.reps), numeric(set.repsLeft), numeric(set.repsRight));
}

function setVolume(set, weightType, barWeight) {
  return (effectiveWeight(set.weight, weightType, barWeight) ?? 0) * setRepTotal(set);
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

export function personalBestLabel(personalBest, usesTime = false) {
  if (!personalBest?.weight) return '';
  const weight = `${formatPersonalBestValue(personalBest.weight)} lbs`;
  const reps = formatPersonalBestValue(personalBest.reps);
  return numeric(personalBest.reps) > 0 ? `${weight} x ${reps} ${usesTime ? 'secs' : 'reps'}` : weight;
}

export function bestPersonalBestSet(sets = [], weightType = 'weight', barWeight) {
  return sets.reduce((best, set) => {
    if (!isWorkingSet(set)) return best;
    const weightValue = effectiveWeight(set.weight, weightType, barWeight);
    if (weightValue === null || weightValue <= 0) return best;
    const repsValue = setRepBest(set);
    if (!best || weightValue > best.weightValue || (weightValue === best.weightValue && repsValue > best.repsValue)) {
      return {
        weight: String(weightValue),
        reps: repsValue > 0 ? String(repsValue) : undefined,
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

// Contextual records are derived from immutable workout setup snapshots. The
// exercise-level PB remains the manually editable record for unscoped workouts.
export function hasPersonalBestContext(item) {
  return Boolean(item.baselineId || item.setupProfile?.id || item.weightType === 'smith_double');
}

export function personalBestContext(item) {
  return JSON.stringify([item.exerciseId, item.baselineId || '', item.setupProfile?.id || '', item.weightType || 'weight', smithLoadContext(item)]);
}

function comparePersonalBestLogs(a, b) {
  const key = log => log.startTime || log.endTime || `${log.date}T00:00:00`;
  return key(a).localeCompare(key(b)) || a.id.localeCompare(b.id);
}

function recordedPersonalBest(item, logs) {
  const context = personalBestContext(item);
  let best;
  for (const log of logs.filter(log => log.status === 'finished').sort(comparePersonalBestLogs)) {
    for (const previous of log.exerciseItems || []) {
      if (personalBestContext(previous) !== context) continue;
      const candidate = bestPersonalBestSet(previous.sets, previous.weightType, previous.setupProfile?.smithBarWeight);
      if (isPersonalBestImprovement(candidate, best)) best = personalBestPayload(candidate, log.date);
    }
  }
  return best;
}

export function personalBestForItem(item, logs = [], legacyBest) {
  return hasPersonalBestContext(item) ? recordedPersonalBest(item, logs) : legacyBest;
}

export function latestPersonalBest(exercise, logs = []) {
  const item = logs.filter(log => log.status === 'finished').sort(comparePersonalBestLogs).reverse()
    .flatMap(log => log.exerciseItems || []).find(item => item.exerciseId === exercise.id);
  return { best: item ? personalBestForItem(item, logs, exercise.personalBest) : exercise.personalBest,
    contextual: Boolean(item && hasPersonalBestContext(item)) };
}

// Repair missing contextual badges on read, using all history before any UI
// date filtering. This also handles corrections/deletions without rewriting sets.
export function logsWithPersonalBests(logs = []) {
  const bests = new Map();
  const badges = new Map();
  for (const log of logs.filter(log => log.status === 'finished').sort(comparePersonalBestLogs)) {
    const items = log.exerciseItems || [];
    const ids = new Set((log.pbExerciseIds || []).filter(id => items.some(item => item.exerciseId === id && !hasPersonalBestContext(item))));
    for (const item of items.filter(hasPersonalBestContext)) {
      const key = personalBestContext(item);
      const candidate = bestPersonalBestSet(item.sets, item.weightType, item.setupProfile?.smithBarWeight);
      if (isPersonalBestImprovement(candidate, bests.get(key))) {
        ids.add(item.exerciseId);
        bests.set(key, personalBestPayload(candidate, log.date));
      }
    }
    badges.set(log.id, [...ids]);
  }
  return logs.map(log => badges.has(log.id) ? { ...log, pbExerciseIds: badges.get(log.id), hasPB: badges.get(log.id).length > 0 } : log);
}

export function personalBestIdsForWorkout(log, logs = [], exercises = []) {
  const prior = logs.filter(previous => previous.id !== log.id && comparePersonalBestLogs(previous, log) < 0);
  const editing = logs.some(previous => previous.id === log.id && previous.status === 'finished');
  const ids = new Set();
  for (const item of log.exerciseItems || []) {
    const candidate = bestPersonalBestSet(item.sets, item.weightType, item.setupProfile?.smithBarWeight);
    let best = recordedPersonalBest(item, prior);
    if (!hasPersonalBestContext(item)) {
      const legacy = exercises.find(exercise => exercise.id === item.exerciseId)?.personalBest;
      // The current exercise PB may have been set by this workout (or a later
      // one). It cannot be used to erase this workout's historical achievement.
      if (!editing) best = legacy; // Preserve the explicit Reset PB action for general records.
      else if (legacy?.date && legacy.date < log.date) {
        const legacyCandidate = { weightValue: numeric(legacy.weight), repsValue: numeric(legacy.reps) };
        if (isPersonalBestImprovement(legacyCandidate, best)) best = legacy;
      }
    }
    if (isPersonalBestImprovement(candidate, best)) ids.add(item.exerciseId);
  }
  return [...ids];
}

export function setLabel(set, weightType = 'weight', usesTime = false) {
  const reps = set.repsLeft || set.repsRight
    ? `${set.repsLeft || '—'}/${set.repsRight || '—'}`
    : (set.reps || '—');
  const unit = usesTime ? 'secs' : 'reps';
  const typePrefix = set.setType && set.setType !== 'working'
    ? `${set.setType.charAt(0).toUpperCase()}${set.setType.slice(1)} · `
    : '';
  const effort = [
    set.rpe ? `RPE ${set.rpe}` : '',
    normalizedRir(set.rir) !== null ? `RIR ${normalizedRir(set.rir)}` : '',
  ].filter(Boolean).join(' · ');
  const effortSuffix = effort ? ` · ${effort}` : '';
  if (weightType === 'none') return `${typePrefix}${reps} ${unit}${effortSuffix}`;
  const weight = set.weight ? `${formatWeight(set.weight)} lb` : '—';
  const suffix = weightType === 'smith_double' ? ' (Smith + 2x)' : weightType === 'bar_double' ? ' (bar + 2x)' : weightType === 'double' ? ' (2x)' : '';
  return `${typePrefix}${reps} x ${weight}${suffix}${effortSuffix}`;
}

export function estimateOneRepMax(weight, reps) {
  const w = numeric(weight);
  const r = numeric(reps);
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

export function getExerciseHistory(exerciseId, logs = []) {
  const latestItem = finishedLogs(logs).flatMap(log => log.exerciseItems || []).find(item => item.exerciseId === exerciseId);
  const baseline = latestItem?.baselineId;
  return finishedLogs(logs)
    .map((log) => {
      const item = (log.exerciseItems || []).find((entry) => entry.exerciseId === exerciseId);
      if (!item || (item.baselineId || null) !== (baseline || null) || smithLoadContext(item) !== smithLoadContext(latestItem)) return null;
      const sets = (item.sets || []).filter(isWorkingSet);
      const volume = sets.reduce((sum, set) => sum + setVolume(set, item.weightType, item.setupProfile?.smithBarWeight), 0);
      const bestSet = sets.reduce((best, set) => {
        const weight = effectiveWeight(set.weight, item.weightType, item.setupProfile?.smithBarWeight);
        if (weight === null) return best;
        const reps = setRepBest(set);
        const score = item.weightType === 'none'
          ? reps
          : estimateOneRepMax(weight, reps);
        if (score <= 0) return best;
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

function summarizeLogsForTrend(logs, exerciseById) {
  let workouts = 0;
  let volume = 0;
  let sets = 0;

  for (const log of logs) {
    workouts += 1;
    for (const item of log.exerciseItems || []) {
      const itemSets = (item.sets || []).filter(isWorkingSet);
      sets += itemSets.length;
      volume += itemSets.reduce((sum, set) => sum + setVolume(set, item.weightType, item.setupProfile?.smithBarWeight), 0);
      if (!exerciseById.has(item.exerciseId)) exerciseById.set(item.exerciseId, { id: item.exerciseId, name: 'Unknown', muscleGroup: 'Other' });
    }
  }

  return { workouts, volume, sets };
}

function trendMetric(id, label, current, previous) {
  const delta = current - previous;
  const percent = previous > 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0);
  return { id, label, current, previous, delta, percent };
}

function buildPeriodTrends(allFinished, scopedLogs, rangeDays, exerciseById) {
  const days = Number(rangeDays);
  if (!Number.isFinite(days)) return [];

  const currentStart = new Date();
  currentStart.setHours(0, 0, 0, 0);
  currentStart.setDate(currentStart.getDate() - days + 1);
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - days);

  const previousLogs = allFinished.filter((log) => {
    const date = parseDay(log.date);
    return date >= previousStart && date < currentStart;
  });

  const current = summarizeLogsForTrend(scopedLogs, exerciseById);
  const previous = summarizeLogsForTrend(previousLogs, exerciseById);

  return [
    trendMetric('workouts', 'Workouts', current.workouts, previous.workouts),
    trendMetric('volume', 'Volume', current.volume, previous.volume),
    trendMetric('sets', 'Sets', current.sets, previous.sets),
  ];
}

function strongestExerciseImprovement(exercises, scopedLogs) {
  return exercises
    .map((exercise) => {
      const history = getExerciseHistory(exercise.id, scopedLogs);
      const latestEntry = history[0];
      const latest = latestEntry?.bestSet;
      if (!latest || !latestEntry) return null;
      const previousEntry = history.slice(1)
        .filter((entry) => entry.bestSet)
        .sort((a, b) => b.bestSet.score - a.bestSet.score)[0];
      const previous = previousEntry?.bestSet;
      if (!previous || latest.score <= previous.score) return null;
      return {
        exercise,
        latest: { ...latest, item: latestEntry.item, date: latestEntry.date },
        previous: { ...previous, item: previousEntry.item, date: previousEntry.date },
        delta: latest.score - previous.score,
        percent: ((latest.score - previous.score) / previous.score) * 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.percent - a.percent)[0] ?? null;
}

export function buildProgress(logs = [], exercises = [], rangeDays = '90') {
  const allFinished = finishedLogs(logsWithPersonalBests(logs));
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
      const sets = (item.sets || []).filter(isWorkingSet);
      const setCount = sets.length;
      const volume = sets.reduce((sum, set) => sum + setVolume(set, item.weightType, item.setupProfile?.smithBarWeight), 0);
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
    trends: buildPeriodTrends(allFinished, scopedLogs, rangeDays, exerciseById),
    strongestImprovement: strongestExerciseImprovement(exercises, scopedLogs),
  };
}

export function formatVolume(value) {
  const rounded = Math.round(value);
  if (rounded >= 1000000) return `${(rounded / 1000000).toFixed(1)}M lb`;
  if (rounded >= 1000) return `${Math.round(rounded / 1000)}k lb`;
  return `${rounded.toLocaleString()} lb`;
}
