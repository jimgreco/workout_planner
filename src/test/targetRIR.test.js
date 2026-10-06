import { describe, it, expect } from 'vitest';
import { targetRIRForSet, targetGoalLabel, setTargetGoalLabel } from '../targetRIR.js';
import { routinePrescription } from '../programs.js';
describe('planned RIR', () => {
  it('formats compact goals without interpreting actual effort as a target', () => {
    expect(targetGoalLabel('8 (6-10)', 2)).toBe('Goal 6–10+2');
    expect(targetGoalLabel('6-10', 0)).toBe('Goal 6–10+0');
    expect(targetGoalLabel('6-10', null)).toBe('Goal 6–10');
    expect(targetGoalLabel('', 2)).toBe('Goal 2 RIR');
    expect(setTargetGoalLabel({ placeholderRepsLeft: '8 (6-10)', placeholderRepsRight: '9 (8-12)' }, 2)).toBe('Goal 6–10/8–12+2');
    expect(targetRIRForSet({}, { rir: '0' })).toBeNull();
    expect(targetRIRForSet({ targetRIR: 2 }, { setType: 'warmup' })).toBeNull();
    expect(targetRIRForSet({ targetRIR: 2 }, {}, { usesTime: true })).toBeNull();
  });
  it('clones targets while preserving rep ranges and separate phase guidance', () => {
    const source = { id: 't', name: 'Routine', exerciseItems: [{ exerciseId: 'bench', targetRIR: 2, sets: [{ reps: '6-10' }] }] };
    const program = { id: 'p', name: 'Program', schedule: [], phases: [{ name: 'Build', startDate: '2026-10-01', endDate: '2026-10-31', targetRir: 3 }] };
    const snapshot = routinePrescription(source, program, '2026-10-06');
    expect(snapshot.exerciseItems[0].targetRIR).toBe(2);
    expect(snapshot.targetRir).toBe(3);
    snapshot.exerciseItems[0].targetRIR = 1;
    expect(source.exerciseItems[0].targetRIR).toBe(2);
    expect(source.exerciseItems[0].sets[0].reps).toBe('6-10');
  });
});
