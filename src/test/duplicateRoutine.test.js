import { describe, expect, it } from 'vitest';
import { duplicateRoutine } from '../duplicateRoutine.js';
import source from '../../test-fixtures/duplicate-routine.json';
import { validateTemplate } from '../../backend/src/validation.mjs';

describe('duplicate routine prescription', () => {
  it('keeps complete prescription and missing references, with a new independent identity', () => {
    const copy = duplicateRoutine({ ...source, programId: 'do-not-copy', expectedRevision: 12 }, [source], 'draft');
    expect(copy).toEqual({ id: 'draft', name: 'Push Day copy', description: source.description, gymId: source.gymId, exerciseItems: source.exerciseItems });
    expect(validateTemplate(copy, copy.id).exerciseItems).toHaveLength(2);
    expect(copy.exerciseItems).not.toBe(source.exerciseItems);
    expect(copy.exerciseItems[0].setupProfile).not.toBe(source.exerciseItems[0].setupProfile);
    copy.exerciseItems[0].sets[0].reps = '5';
    copy.exerciseItems[0].setupProfile.name = 'Different machine';
    expect(source.exerciseItems[0].sets[0].reps).toBe('8-12');
    expect(source.exerciseItems[0].setupProfile.name).toBe('Smith');
    expect(duplicateRoutine(source, [source]).id).not.toBe(duplicateRoutine(source, [source]).id);
  });
  it('finds an available name without overwriting a case-insensitive name collision', () => {
    expect(duplicateRoutine(source, [{ name: ' PUSH DAY COPY ' }, { name: 'Push Day copy 2' }]).name).toBe('Push Day copy 3');
  });
  it('keeps long unicode copy names within the API limit and preserves optional empty values', () => {
    const long = { name: '🏋'.repeat(60), exerciseItems: [] };
    const first = duplicateRoutine(long, []);
    const second = duplicateRoutine(long, [first]);
    expect(first.name.length).toBeLessThanOrEqual(120);
    expect(second.name.length).toBeLessThanOrEqual(120);
    expect(second.name.endsWith(' copy 2')).toBe(true);
    expect(validateTemplate(second, second.id).name).toBe(second.name);
    expect(duplicateRoutine({ name: '  ' }, [], 'empty')).toEqual({ id: 'empty', name: 'Routine copy', description: '', gymId: null, exerciseItems: [] });
  });
});
