import { describe, expect, it } from 'vitest';
import { newWorkoutEquipment, removingSetup } from '../equipmentSetups.js';

const home = { id: 'home', gym: 'Home', machine: 'Dumbbells', seat: '1' };
const gym = { id: 'gym', gym: 'Gym', machine: 'Smith', smithBarWeight: 0 };
const exercise = { id: 'press', name: 'Press', equipmentSetups: [home, gym] };
const item = { exerciseId: 'press', sets: [{ reps: '6-10' }], targetRIR: 2 };
const log = (id, profile, extra = {}) => ({ id, date: '2026-10-06', endTime: `2026-10-06T${id}:00:00Z`, status: 'finished', exerciseItems: [{ ...item, baselineId: profile?.id, setupProfile: profile, sets: [{ reps: '8', weight: '50', rir: '0' }] }], ...extra });
const resolve = (logs, prescribed = item, ex = exercise) => newWorkoutEquipment(prescribed, ex, logs);

describe('remembered equipment setup', () => {
  it('uses actual session time for two same-day workouts, ignoring old edits and draft prescriptions', () => {
    const logs = [log('09', home, { updatedAt: '2099-01-01' }), log('14', gym), log('18', home, { status: 'planning' }), log('19', home, { status: 'active' })];
    const before = JSON.stringify(logs);
    expect(resolve(logs).setupProfile).toEqual(gym);
    expect(JSON.stringify(logs)).toBe(before);
    expect(resolve([...logs].reverse()).setupProfile).toEqual(gym);
  });
  it('honors explicit routine equipment and baseline before the last-used default', () => {
    const old = log('09', home);
    const recent = log('14', gym);
    expect(resolve([old, recent], { ...item, setupProfile: home })).toMatchObject({ setupProfile: home, baselineId: home.id, lastItem: old.exerciseItems[0] });
    expect(resolve([old, recent], { ...item, baselineId: 'new-technique', techniqueNote: 'New depth' })).toEqual({ setupProfile: undefined, baselineId: 'new-technique', techniqueNote: 'New depth', lastItem: undefined });
  });
  it('uses current library settings, preserves old snapshots, and rejects stale Smith weight history', () => {
    const previous = log('14', gym);
    previous.exerciseItems[0].weightType = 'smith_double';
    const updated = { ...gym, seat: '3', smithBarWeight: 25 };
    expect(resolve([previous], item, { ...exercise, equipmentSetups: [home, updated] })).toMatchObject({ setupProfile: updated, baselineId: gym.id, lastItem: undefined });
    expect(previous.exerciseItems[0].setupProfile).toEqual(gym);
  });
  it('does not resurrect deleted setups or fall back to an older machine', () => {
    const ex = removingSetup(exercise, gym.id);
    expect(resolve([log('09', home), log('14', gym)], item, ex).setupProfile).toBeUndefined();
    expect(resolve([log('09', home)], { ...item, setupProfile: gym, baselineId: gym.id }, ex)).toEqual({ baselineId: undefined, techniqueNote: undefined });
  });
  it('remembers unspecified, supports legacy history, and keys by exercise ID, never name or equipment category', () => {
    expect(resolve([log('09', home), log('14', undefined)]).setupProfile).toBeUndefined();
    expect(resolve([log('09', home)], item, { id: 'press' }).setupProfile).toEqual(home);
    expect(resolve([log('09', home)], { ...item, exerciseId: 'another-press' }, { ...exercise, id: 'another-press' }).setupProfile).toBeUndefined();
    expect(newWorkoutEquipment(item, undefined, [log('09', home)])).toEqual({});
  });
  it('discarding an active choice leaves the finished preference; deletion of the latest finished log follows remaining history', () => {
    const finished = log('09', home);
    const draft = log('14', gym, { status: 'active' });
    expect(resolve([finished, draft]).setupProfile).toEqual(home);
    expect(resolve([finished]).setupProfile).toEqual(home);
    expect(resolve([finished, { ...draft, status: 'finished' }]).setupProfile).toEqual(gym);
    expect(resolve([]).setupProfile).toBeUndefined();
  });
});

it('does not learn unused/skipped automatic defaults, but remembers an explicit choice including unspecified', () => {
  const used = log('09', home);
  const unused = log('14', gym);
  for (const sets of [[], [{ placeholderReps: '8' }], [{ reps: '8', completion: 'skipped' }], [{ reps: '8', completion: 'unrecorded' }]]) {
    unused.exerciseItems[0].sets = sets;
    expect(resolve([used, unused]).setupProfile).toEqual(home);
  }
  unused.exerciseItems[0].setupSelectionMade = true;
  expect(resolve([used, unused]).setupProfile).toEqual(gym);
  expect(resolve([used, unused]).lastItem).toBeUndefined();
  unused.exerciseItems[0].setupProfile = undefined;
  expect(resolve([used, unused]).setupProfile).toBeUndefined();
});
