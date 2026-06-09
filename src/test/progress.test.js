import { describe, expect, it, vi } from 'vitest';
import {
  bestPersonalBestSet,
  buildProgress,
  isPersonalBestImprovement,
  personalBestLabel,
  setLabel,
  summarizeExercise,
} from '../progress.js';

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

  it('ranks personal bests by weight first and reps second', () => {
    const candidate = bestPersonalBestSet([
      { reps: '10', weight: '220' },
      { reps: '3', weight: '225' },
      { reps: '5', weight: '225' },
    ]);

    expect(candidate).toMatchObject({ weight: '225', reps: '5' });
    expect(isPersonalBestImprovement(candidate, { weight: '225', reps: '4' })).toBe(true);
    expect(isPersonalBestImprovement(candidate, { weight: '225', reps: '5' })).toBe(false);
    expect(isPersonalBestImprovement(candidate, { weight: '230', reps: '1' })).toBe(false);
    expect(personalBestLabel({ weight: '225', reps: '5' })).toBe('225 lbs x 5 reps');
    expect(personalBestLabel({ weight: '25', reps: '45' }, true)).toBe('25 lbs x 45 secs');
    expect(setLabel({ reps: '45' }, 'none', true)).toBe('45 secs');
  });

  it('uses weight type when calculating personal best weight', () => {
    expect(bestPersonalBestSet([{ reps: '5', weight: '50' }], 'double')).toMatchObject({
      weight: '100',
      reps: '5',
      weightValue: 100,
    });
    expect(bestPersonalBestSet([{ reps: '5', weight: '45' }], 'bar_double')).toMatchObject({
      weight: '135',
      reps: '5',
      weightValue: 135,
    });
    expect(bestPersonalBestSet([{ reps: '20', weight: '' }], 'none')).toBeNull();
  });

  it('filters the 7-day range inclusively', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00'));

    try {
      const rangeLogs = [
        { ...logs[0], id: 'boundary', date: '2026-05-18' },
        { ...logs[1], id: 'older', date: '2026-05-17' },
        { ...logs[1], id: 'today', date: '2026-05-24' },
      ];

      const progress = buildProgress(rangeLogs, exercises, '7');

      expect(progress.logs.map((log) => log.id)).toEqual(['today', 'boundary']);
      expect(progress.totalWorkouts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds period trends and strongest exercise improvement', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00'));

    try {
      const trendLogs = [
        {
          id: 'previous',
          name: 'Previous Push',
          date: '2026-05-17',
          status: 'finished',
          exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '5', weight: '100' }] }],
        },
        {
          id: 'earlier-current',
          name: 'Early Push',
          date: '2026-05-18',
          status: 'finished',
          exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '5', weight: '105' }] }],
        },
        {
          id: 'latest-current',
          name: 'Latest Push',
          date: '2026-05-24',
          status: 'finished',
          exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '5', weight: '115' }] }],
        },
      ];

      const progress = buildProgress(trendLogs, exercises, '7');

      expect(progress.trends.find((item) => item.id === 'workouts')).toMatchObject({
        current: 2,
        previous: 1,
        delta: 1,
      });
      expect(progress.strongestImprovement.exercise.name).toBe('Bench Press');
      expect(progress.strongestImprovement.latest.weight).toBe(115);
    } finally {
      vi.useRealTimers();
    }
  });
});
