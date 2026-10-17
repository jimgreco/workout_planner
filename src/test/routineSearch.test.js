import { describe, expect, it } from 'vitest';
import { filterRoutines } from '../routineSearch.js';

const exercises = [
  { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' },
  { id: 'row', name: 'Cable Row', muscleGroup: 'Back' },
  { id: 'squat', name: 'Squat', muscleGroup: 'Quads' },
];
const routines = [
  { id: 'upper', name: 'Upper Day', description: 'Short hotel session', exerciseItems: [{ exerciseId: 'bench' }, { exerciseId: 'row' }] },
  { id: 'lower', name: 'Lower Day', exerciseItems: [{ exerciseId: 'squat' }] },
  { id: 'retired', name: 'Old Routine', description: null, exerciseItems: [{ exerciseId: 'removed' }] },
];

describe('routine search', () => {
  it('finds all words across the routine name, description, exercises, and muscle groups', () => {
    for (const query of ['UPPER', 'hotel', 'bench', 'chest', '  HOTEL\tchest\nrow ']) {
      expect(filterRoutines(routines, query, exercises).map(routine => routine.id)).toEqual(['upper']);
    }
    expect(filterRoutines(routines, 'quads lower', exercises).map(routine => routine.id)).toEqual(['lower']);
    expect(filterRoutines(routines, 'chest squat', exercises)).toEqual([]);
  });

  it('restores the original order for empty searches and leaves prescriptions untouched', () => {
    const original = structuredClone(routines);
    expect(filterRoutines(routines, 'day', exercises)).toEqual(routines.slice(0, 2));
    expect(filterRoutines(routines, '', exercises)).toEqual(routines);
    expect(filterRoutines(routines, ' \t\n', exercises)).toEqual(routines);
    expect(routines).toEqual(original);
  });

  it('handles missing descriptions, removed exercises, and empty libraries', () => {
    expect(filterRoutines(routines, 'old', exercises)).toEqual([routines[2]]);
    expect(filterRoutines(routines, 'removed', exercises)).toEqual([]);
    expect(filterRoutines(routines, 'bench', [])).toEqual([]);
    expect(filterRoutines([{ id: 'empty', name: 'Recovery' }], 'recovery', [])).toHaveLength(1);
    expect(filterRoutines([], 'day', exercises)).toEqual([]);
  });
});
