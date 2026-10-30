import { describe, expect, it } from 'vitest';
import { repeatWorkoutPlan } from '../repeatWorkout.js';

describe('repeat finished workout', () => {
  it('keeps ordered targets and equipment while removing all evidence and program identity', () => {
    const source = { id: 'old', status: 'finished', name: 'Push', date: '2026-01-01', startTime: 'start', endTime: 'end', pausedAt: 99,
      pausedDurationMs: 200, hasPB: true, pbExerciseIds: ['bench'], readiness: 3, prescription: { programId: 'program' }, revision: 10,
      exerciseItems: [{ exerciseId: 'bench', targetRIR: 2, weightType: 'smith_double', setupProfile: { id: 'smith', smithBarWeight: 0 },
        baselineId: 'technique', techniqueNote: 'Pause', restTargetSeconds: 90, supersetGroup: 'A',
        sets: [{ reps: '12', weight: '45', placeholderReps: '8-12', completion: 'recorded', rir: '0', rpe: '10', restStartTime: 100, restDuration: 20, setType: 'warmup' },
          { repsLeft: '8', repsRight: '9', repMode: 'sides', completion: 'skipped' }] },
      { exerciseId: 'deleted', sets: [] }, { exerciseId: 'row', sets: [] }] };
    const before = structuredClone(source);
    const plan = repeatWorkoutPlan(source, [{ id: 'bench' }, { id: 'row' }], '2026-10-26', 'new');
    expect(plan).toMatchObject({ id: 'new', date: '2026-10-26', status: 'planning', notes: '' });
    expect(plan.exerciseItems.map(item => item.exerciseId)).toEqual(['bench', 'row']);
    expect(plan.exerciseItems[0]).toMatchObject({ targetRIR: 2, setupProfile: { id: 'smith', smithBarWeight: 0 }, baselineId: 'technique', supersetGroup: 'A' });
    expect(plan.exerciseItems[0].sets[0]).toMatchObject({ placeholderReps: '8-12', placeholderWeight: '45', reps: '', weight: '', completion: 'unrecorded', setType: 'warmup' });
    expect(plan.exerciseItems[0].sets[1]).toMatchObject({ placeholderRepsLeft: '8', placeholderRepsRight: '9', repsLeft: '', repsRight: '', completion: 'unrecorded' });
    for (const key of ['startTime','endTime','pausedAt','pausedDurationMs','hasPB','pbExerciseIds','readiness','prescription','revision']) expect(plan).not.toHaveProperty(key);
    for (const set of plan.exerciseItems[0].sets) for (const key of ['rir','rpe','restStartTime','restDuration']) expect(set).not.toHaveProperty(key);
    plan.exerciseItems[0].setupProfile.smithBarWeight = 20;
    expect(source).toEqual(before);
  });
  it('rejects unfinished or wholly missing workouts', () => {
    expect(() => repeatWorkoutPlan({ status: 'active' }, [], '2026-10-26')).toThrow(/finished/);
    expect(() => repeatWorkoutPlan({ status: 'finished', exerciseItems: [{ exerciseId: 'missing' }] }, [], '2026-10-26')).toThrow(/still available/);
  });
});
