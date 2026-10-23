import { describe, expect, it } from 'vitest';
import { unfinishedWorkoutSets } from '../finishReview.js';
import { repeatingLastSet } from '../repeatSet.js';

describe('unfinished workout review', () => {
  it('lists real positions without counting recorded, skipped, or warmup sets', () => {
    const rows = [{ exerciseId: 'a', sets: [
      { reps: '8' }, { reps: '8', completion: 'unrecorded' }, { completion: 'skipped' },
      { setType: 'warmup' }, { placeholderReps: '8-12' }, { repsLeft: '3', completion: 'recorded' },
      { completion: 'recorded', reps: '0' }, { reps: 'not a number' },
    ] }, { exerciseId: 'a', sets: [{ reps: '' }] }];
    const original = JSON.stringify(rows);
    expect(unfinishedWorkoutSets(rows, [{ id: 'a', name: 'Bench' }])).toEqual([
      { itemIndex: 0, exerciseId: 'a', name: 'Bench', setNumbers: [2, 5, 7, 8] },
      { itemIndex: 1, exerciseId: 'a', name: 'Bench', setNumbers: [1] },
    ]);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('keeps copied prefills unfinished through repeated taps and serialization', () => {
    const item = { exerciseId: 'a', sets: [{ reps: '8', weight: '0' }, { completion: 'unrecorded' }] };
    const repeated = repeatingLastSet(repeatingLastSet(item));
    expect(unfinishedWorkoutSets(JSON.parse(JSON.stringify([repeated])))[0].setNumbers).toEqual([2]);
    expect(repeated.sets[1]).toMatchObject({ reps: '8', weight: '0', completion: 'unrecorded' });
  });

  it('allows completed timed and side-specific evidence and empty workouts', () => {
    expect(unfinishedWorkoutSets([{ sets: [{ reps: '60' }, { repsRight: '6' }, { completion: 'skipped' }] }])).toEqual([]);
    expect(unfinishedWorkoutSets()).toEqual([]);
    expect(unfinishedWorkoutSets([{ exerciseId: 'removed', sets: [{}] }])[0].name).toBe('Exercise');
  });
});
