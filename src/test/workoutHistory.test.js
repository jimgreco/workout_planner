import { describe, expect, it } from 'vitest';
import { routineExerciseNeedsWeightIncrease, routineExerciseWeightAdvice } from '../workoutHistory.js';

const rangeRoutineItem = {
  exerciseId: 'bench',
  weightType: 'weight',
  sets: [
    { placeholderReps: '8-12', weight: '' },
    { placeholderReps: '8-12', weight: '' },
  ],
};

function finishedLog({ date, reps, exerciseId = 'bench' }) {
  return {
    id: `log-${date}`,
    name: 'Push Day',
    date,
    status: 'finished',
    exerciseItems: [{
      exerciseId,
      weightType: 'weight',
      sets: [
        { reps: '10', weight: '100' },
        { reps, weight: '100' },
      ],
    }],
  };
}

describe('routineExerciseNeedsWeightIncrease', () => {
  it('marks a routine exercise when the latest final set reaches the range cap', () => {
    expect(routineExerciseNeedsWeightIncrease(rangeRoutineItem, [
      finishedLog({ date: '2026-05-20', reps: '12' }),
    ])).toBe(true);
  });

  it('does not mark when only an older log reached the range cap', () => {
    expect(routineExerciseNeedsWeightIncrease(rangeRoutineItem, [
      finishedLog({ date: '2026-05-20', reps: '12' }),
      finishedLog({ date: '2026-05-27', reps: '11' }),
    ])).toBe(false);
  });

  it('does not mark non-range routine targets', () => {
    expect(routineExerciseNeedsWeightIncrease({
      ...rangeRoutineItem,
      sets: [{ placeholderReps: '12' }, { placeholderReps: '12' }],
    }, [
      finishedLog({ date: '2026-05-20', reps: '12' }),
    ])).toBe(false);
  });

  it('requires both sides of a side-specific range to reach the cap', () => {
    const item = {
      exerciseId: 'curl',
      weightType: 'weight',
      sets: [
        { placeholderRepsLeft: '8-12', placeholderRepsRight: '8-12' },
      ],
    };
    const log = {
      id: 'log-curl',
      date: '2026-05-20',
      status: 'finished',
      exerciseItems: [{
        exerciseId: 'curl',
        weightType: 'weight',
        sets: [{ repsLeft: '12', repsRight: '11', weight: '25' }],
      }],
    };

    expect(routineExerciseNeedsWeightIncrease(item, [log])).toBe(false);
  });

  it.each(['skipped', 'unrecorded'])('ignores %s sets with retained reps', (completion) => {
    const log = finishedLog({ date: '2026-05-20', reps: '12' });
    log.exerciseItems[0].sets[1].completion = completion;
    expect(routineExerciseNeedsWeightIncrease(rangeRoutineItem, [log])).toBe(false);
  });

  it.each([
    { baselineId: 'previous-technique' },
    { setupProfile: { id: 'different-machine' } },
    { weightType: 'double' },
  ])('does not suggest an increase from a different comparison context: %j', (context) => {
    const log = finishedLog({ date: '2026-05-20', reps: '12' });
    Object.assign(log.exerciseItems[0], context);
    expect(routineExerciseNeedsWeightIncrease(rangeRoutineItem, [log])).toBe(false);
  });

  it('does not suggest an increase after Smith resistance changes', () => {
    const log = finishedLog({ date: '2026-05-20', reps: '12' });
    Object.assign(log.exerciseItems[0], { weightType: 'smith_double', setupProfile: { id: 'smith', smithBarWeight: 20 } });
    const item = { ...rangeRoutineItem, weightType: 'smith_double', setupProfile: { id: 'smith', smithBarWeight: 35 } };
    expect(routineExerciseNeedsWeightIncrease(item, [log])).toBe(false);
  });
});

describe('routineExerciseWeightAdvice', () => {
  const advice = (sets, target = rangeRoutineItem, context = {}, options = {}) => routineExerciseWeightAdvice(target, [{
    ...finishedLog({ date: '2026-10-02', reps: '12' }),
    exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', sets, ...context }],
  }], options);

  it('prioritizes a lower-weight cue when an earlier set misses the floor but the final set hits the cap', () => {
    expect(advice([{ reps: '7', weight: '100', rir: '2' }, { reps: '12', weight: '90' }])).toEqual({
      direction: 'decrease', label: 'Lower weight',
      message: 'Last time, set 1: 7 reps; target 8–12. Try the next lighter weight than you used for that set, keeping your reps controlled.',
    });
  });

  it('keeps the add-weight cue and gives no cue for reps within the range', () => {
    expect(advice([{ reps: '10', weight: '100' }, { reps: '12', weight: '100' }])?.direction).toBe('increase');
    expect(advice([{ reps: '8', weight: '100' }, { reps: '10', weight: '100' }])).toBeNull();
  });

  it('ignores warmups and still checks performed sets when the new routine adds a third set', () => {
    const target = { ...rangeRoutineItem, sets: [{ reps: '5', setType: 'warmup' }, ...rangeRoutineItem.sets, { reps: '8-12' }] };
    expect(advice([{ reps: '3', weight: '50', setType: 'warmup' }, { reps: '10', weight: '100' }, { reps: '7', weight: '100' }], target)?.message).toContain('set 2: 7 reps');
    expect(advice([{ reps: '3', weight: '50', setType: 'warmup' }, { reps: '10', weight: '100' }, { reps: '10', weight: '100' }], target)).toBeNull();
  });

  it.each(['skipped', 'unrecorded'])('does not treat %s sets as missed targets or shift later set targets', completion => {
    const target = { ...rangeRoutineItem, sets: [{ reps: '10-15' }, { reps: '6-8' }] };
    expect(advice([{ reps: '2', weight: '100', completion }, { reps: '7', weight: '100' }], target)).toBeNull();
  });

  it.each(['', '8-12', '0'])('ignores unrecorded or nonnumeric reps: %s', reps => {
    expect(advice([{ reps, placeholderReps: '7 (8-12)', weight: '100' }])).toBeNull();
  });

  it.each(['', '0', 'invalid', 'Infinity'])('requires a recorded reducible load: %s', weight => {
    expect(advice([{ reps: '7', weight }])).toBeNull();
  });

  it('supports common and side-specific ranges without treating missing side reps as zero', () => {
    expect(advice([{ repsLeft: '7', repsRight: '12', repMode: 'separateSides', weight: '25' }])?.message).toContain('set 1 (left): 7 reps; target 8–12');
    const target = { ...rangeRoutineItem, sets: [{ placeholderReps: '12 (8–12)', placeholderRepsLeft: '9 (10–15)', placeholderRepsRight: '12 (8–12)' }] };
    expect(advice([{ repsLeft: '9', repsRight: '12', weight: '25' }], target)?.message).toContain('target 10–15');
    expect(advice([{ repsLeft: '', repsRight: '10', weight: '25', repMode: 'separateSides' }])).toBeNull();
  });

  it.each([null, '', '0', '2'])('uses recorded reps with RIR %s without requiring or inventing failure', rir => {
    expect(advice([{ reps: '7', weight: '100', rir }])?.direction).toBe('decrease');
  });

  it.each([{ baselineId: 'other' }, { setupProfile: { id: 'other' } }, { weightType: 'double' }])('ignores an incompatible setup: %j', context => {
    expect(advice([{ reps: '7', weight: '100' }], rangeRoutineItem, context)).toBeNull();
  });

  it('respects Smith resistance snapshots and can suggest fewer plates without inventing a bar weight', () => {
    const target = { ...rangeRoutineItem, weightType: 'smith_double', setupProfile: { id: 'smith' } };
    const context = { weightType: 'smith_double', setupProfile: { id: 'smith' } };
    expect(advice([{ reps: '7', weight: '45' }], target, context)?.direction).toBe('decrease');
    expect(advice([{ reps: '7', weight: '45' }], target, { ...context, setupProfile: { id: 'smith', smithBarWeight: 20 } })).toBeNull();
  });

  it.each(['12', '12-8', '0-12', 'bad-12'])('does not invent a lower bound for %s', reps => {
    expect(advice([{ reps: '7', weight: '100' }], { ...rangeRoutineItem, sets: [{ reps }] })).toBeNull();
  });

  it('does not recommend changing bodyweight or timed exercises', () => {
    expect(advice([{ reps: '7', weight: '100' }], { ...rangeRoutineItem, weightType: 'none' }, { weightType: 'none' })).toBeNull();
    expect(advice([{ reps: '7', weight: '100' }], rangeRoutineItem, {}, { usesTime: true })).toBeNull();
  });

  it('uses the latest finished evidence and clears advice after reps recover', () => {
    const poor = finishedLog({ date: '2026-10-01', reps: '7' });
    const recovered = finishedLog({ date: '2026-10-02', reps: '10' });
    expect(routineExerciseWeightAdvice(rangeRoutineItem, [poor, recovered])).toBeNull();
    recovered.status = 'active';
    expect(routineExerciseWeightAdvice(rangeRoutineItem, [poor, recovered])?.direction).toBe('decrease');
  });
});
