import { describe, it, expect } from 'vitest';
import { pauseWorkout, resumeWorkout, finishWorkoutTiming, formatWorkoutDuration } from '../workoutTiming.js';

const start = Date.parse('2026-10-05T10:00:00.000Z');
const at = seconds => start + seconds * 1000;
const log = {
  id: 'pause', name: 'Keep me', startTime: new Date(start).toISOString(), status: 'active', notes: 'Unchanged',
  exerciseItems: [{ exerciseId: 'bench', baselineId: 'original', setupProfile: { id: 'setup' }, sets: [
    { reps: '10', weight: '90', restDuration: 45, rir: null, completion: 'recorded' },
    { reps: '8', weight: '100', restStartTime: at(50), rir: '0', completion: 'recorded' },
  ] }],
};

describe('workout pause timing', () => {
  it('freezes elapsed and rest time across repeated pauses, resume and persisted restore', () => {
    const paused = pauseWorkout(log, at(60));
    expect(pauseWorkout(paused, at(90))).toBe(paused);
    expect(paused.exerciseItems).toEqual(log.exerciseItems);
    expect(formatWorkoutDuration(paused, at(3600))).toBe('1m');
    let resumed = resumeWorkout(JSON.parse(JSON.stringify(paused)), at(3660));
    expect(resumed.pausedDurationMs).toBe(3600000);
    expect(at(3660) - resumed.exerciseItems[0].sets[1].restStartTime).toBe(10000);
    expect(resumeWorkout(resumed, at(3670))).toBe(resumed);
    resumed = resumeWorkout(pauseWorkout(resumed, at(3720)), at(3840));
    expect(resumed.pausedDurationMs).toBe(3720000);
    expect(formatWorkoutDuration(resumed, at(3840))).toBe('2m');
    const finished = finishWorkoutTiming(pauseWorkout(resumed, at(3900)), at(7500));
    expect(finished.pausedAt).toBeNull();
    expect(finished.pausedDurationMs).toBe(7320000);
    expect(formatWorkoutDuration({ ...finished, endTime: new Date(at(7500)).toISOString() })).toBe('3m');
    expect(finished.exerciseItems[0].sets[1]).toEqual({ ...log.exerciseItems[0].sets[1], restStartTime: null, restDuration: 130 });
    expect(finished.exerciseItems[0].sets[0]).toEqual(log.exerciseItems[0].sets[0]);
    expect(finished.startTime).toBe(log.startTime);
    expect(finished.exerciseItems[0].baselineId).toBe('original');
  });

  it('keeps legacy timing and ignores pause for planning or finished sessions', () => {
    expect(formatWorkoutDuration(log, at(600))).toBe('10m');
    for (const status of ['planning', 'finished', 'skipped']) {
      const inactive = { ...log, status };
      expect(pauseWorkout(inactive, at(60))).toBe(inactive);
    }
    expect(resumeWorkout(log, at(60))).toBe(log);
    expect(finishWorkoutTiming(log, at(65)).exerciseItems[0].sets[1].restDuration).toBe(15);
  });
});
