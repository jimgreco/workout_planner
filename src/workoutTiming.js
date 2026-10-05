// Pause timestamps and accumulated duration use milliseconds, like restStartTime.
export function pauseWorkout(log, now = Date.now()) {
  if (log.status !== 'active' || !log.startTime || log.pausedAt != null) return log;
  return { ...log, pausedAt: now, pausedDurationMs: log.pausedDurationMs ?? 0 };
}

export function resumeWorkout(log, now = Date.now()) {
  if (log.status !== 'active' || log.pausedAt == null) return log;
  const interval = Math.max(0, now - log.pausedAt);
  return {
    ...log,
    pausedAt: null,
    pausedDurationMs: (log.pausedDurationMs ?? 0) + interval,
    exerciseItems: log.exerciseItems.map(item => ({
      ...item,
      sets: item.sets.map(set => set.restStartTime != null && set.restDuration == null
        ? { ...set, restStartTime: set.restStartTime + interval } : set),
    })),
  };
}

export function finishWorkoutTiming(log, now = Date.now()) {
  const restEnd = log.pausedAt ?? now;
  const finishedRests = {
    ...log,
    exerciseItems: log.exerciseItems.map(item => ({
      ...item,
      sets: item.sets.map(set => set.restStartTime != null && set.restDuration == null
        ? { ...set, restStartTime: null, restDuration: Math.max(0, Math.floor((restEnd - set.restStartTime) / 1000)) } : set),
    })),
  };
  return resumeWorkout(finishedRests, now);
}

export function formatWorkoutDuration({ startTime, endTime, pausedAt, pausedDurationMs }, now = Date.now()) {
  if (!startTime) return '';
  const end = endTime ? new Date(endTime).getTime() : (pausedAt ?? now);
  const mins = Math.max(0, Math.round((end - new Date(startTime).getTime() - (pausedDurationMs ?? 0)) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
