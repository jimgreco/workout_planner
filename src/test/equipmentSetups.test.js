import { describe, expect, it } from 'vitest';
import { cleanSetup, currentSetup, exerciseSetups, setupLabel } from '../equipmentSetups.js';

describe('exercise setup library', () => {
  it('merges history and routines by ID, preferring saved library details', () => {
    const old = { id: 'a', gym: 'Home', machine: 'Dumbbells', seat: '1' };
    const latest = { ...old, seat: '3' };
    const exercise = { id: 'press', equipmentSetups: [latest] };
    const logs = [{ date: '2026-02-01', exerciseItems: [{ exerciseId: 'press', setupProfile: old }] }];
    const routines = [{ exerciseItems: [{ exerciseId: 'press', setupProfile: { id: 'b', machine: 'Barbell' } }, { exerciseId: 'row', setupProfile: { id: 'c' } }] }];
    expect(exerciseSetups(exercise, logs, routines, old)).toEqual([{ id: 'b', machine: 'Barbell' }, latest]);
    expect(currentSetup(exercise, old)).toEqual(latest);
    expect(logs[0].exerciseItems[0].setupProfile).toEqual(old);
  });
  it('uses chronological history and retains legacy labels only as a fallback', () => {
    const logs = [
      { date: '2026-09-19', exerciseItems: [{ exerciseId: 'press', setupProfile: { id: 'a', seat: 'new' } }] },
      { date: '2026-01-01', exerciseItems: [{ exerciseId: 'press', setupProfile: { id: 'a', seat: 'old' } }] },
    ];
    expect(exerciseSetups({ id: 'press' }, logs)[0].seat).toBe('new');
    expect(setupLabel({ name: 'Custom title', gym: 'Home', machine: 'Barbell' })).toBe('Home · Barbell');
    expect(setupLabel({ name: 'Legacy title' })).toBe('Legacy title');
    expect(cleanSetup({ id: 'a', gym: ' Home ', machine: ' Barbell ' })).toMatchObject({ id: 'a', name: 'Home · Barbell' });
  });
});

it('deleted setups stay out of choices even when referenced in logs, routines, or the current snapshot', async () => {
  const { removingSetup } = await import('../equipmentSetups.js');
  const profile = { id: 'home', gym: 'Home', machine: 'Dumbbells' };
  const old = { id: 'press', equipmentSetups: [profile] };
  const snapshot = { exerciseId: 'press', setupProfile: profile };
  const updated = removingSetup(old, profile.id);
  expect(exerciseSetups(updated, [{ exerciseItems: [snapshot] }], [{ exerciseItems: [snapshot] }], profile)).toEqual([]);
  expect(currentSetup(updated, profile)).toBeUndefined();
  expect(old.equipmentSetups).toEqual([profile]);
  expect(snapshot.setupProfile).toEqual(profile);
  expect(removingSetup(updated, profile.id).deletedEquipmentSetupIds).toEqual(['home']);
});
