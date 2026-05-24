import { describe, expect, it } from 'vitest';
import { buildProgress, summarizeExercise } from '../progress.js';

const exercises = [
  { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' },
  { id: 'curl', name: 'Dumbbell Curl', muscleGroup: 'Biceps' },
];

const logs = [
  {
    id: 'log-1',
    name: 'Push',
    date: '2026-05-20',
    status: 'finished',
    pbExerciseIds: ['bench'],
    exerciseItems: [
      {
        exerciseId: 'bench',
        weightType: 'weight',
        sets: [
          { reps: '8', weight: '100' },
          { reps: '6', weight: '120' },
        ],
      },
    ],
  },
  {
    id: 'log-2',
    name: 'Arms',
    date: '2026-05-21',
    status: 'finished',
    exerciseItems: [
      {
        exerciseId: 'curl',
        weightType: 'double',
        sets: [{ reps: '10', weight: '25' }],
      },
    ],
  },
  {
    id: 'active',
    name: 'Draft',
    date: '2026-05-22',
    status: 'active',
    exerciseItems: [
      {
        exerciseId: 'bench',
        weightType: 'weight',
        sets: [{ reps: '1', weight: '999' }],
      },
    ],
  },
];

describe('progress calculations', () => {
  it('summarizes finished workout volume and ignores active drafts', () => {
    const progress = buildProgress(logs, exercises, 'all');

    expect(progress.totalWorkouts).toBe(2);
    expect(progress.totalSets).toBe(3);
    expect(progress.totalVolume).toBe(2020);
    expect(progress.pbCount).toBe(1);
    expect(progress.muscleSplit.map((item) => item.muscleGroup)).toEqual(['Chest', 'Biceps']);
  });

  it('builds per-exercise history and best sets', () => {
    const bench = summarizeExercise(exercises[0], logs);

    expect(bench.sessions).toBe(1);
    expect(bench.totalVolume).toBe(1520);
    expect(bench.best.set.weight).toBe('120');
  });
});
