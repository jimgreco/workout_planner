import { describe, expect, it } from 'vitest';
import { routineExerciseNeedsWeightIncrease } from '../workoutHistory.js';

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
});
