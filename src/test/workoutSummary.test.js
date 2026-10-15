import { describe, expect, it } from 'vitest';
import { workoutSummary } from '../workoutHistory.js';

describe('workout summary', () => {
  it('preserves evidence, unilateral loads, notes and paused duration without copying placeholders', () => {
    const log = { name: 'Push', date: '2026-10-15', notes: 'Hotel gym', startTime: '2026-10-15T12:00:00Z', endTime: '2026-10-15T13:00:00Z', pausedDurationMs: 600000,
      exerciseItems: [{ exerciseId: 'bench', weightType: 'bar_double', sets: [
        { repsLeft: '8', repsRight: '6', weight: '10', setType: 'warmup', rir: '', completion: 'recorded' },
        { reps: '8', weight: '20', completion: 'skipped' },
        { placeholderReps: '99', placeholderWeight: '999', completion: 'unrecorded' },
      ] }, { exerciseId: 'removed', weightType: 'none', sets: [] }] };
    const original = structuredClone(log);
    const text = workoutSummary(log, [{ id: 'bench', name: 'Bench Press' }]);
    expect(text).toContain('Date: 2026-10-15\nDuration: 50m');
    expect(text).toContain('Set 1: Warmup · 8/6 x 10 lb (bar + 2x)');
    expect(text).toContain('Set 2: Skipped · 8 x 20 lb (bar + 2x)');
    expect(text).toContain('Set 3: Not recorded · — x — (bar + 2x)');
    expect(text).toContain('Unknown exercise\n\nNotes: Hotel gym');
    expect(text).not.toMatch(/RIR|999|99/);
    expect(log).toEqual(original);
  });
});
