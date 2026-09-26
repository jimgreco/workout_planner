import { describe, it, expect } from 'vitest';
import { effectiveWeight, contextualWeightPlaceholder, smithWeightCaption } from '../weight.js';
import { bestPersonalBestSet, buildProgress, getExerciseHistory } from '../progress.js';
import { cleanSetup } from '../equipmentSetups.js';
import { lastWeightTypesByExerciseId } from '../workoutHistory.js';

describe('unloaded barbell', () => {
  it('counts an explicit zero plates as a 45 lb bar, while leaving blank loads unknown', () => {
    expect(effectiveWeight('0', 'bar_double')).toBe(45);
    expect(effectiveWeight('', 'bar_double')).toBe(0);
    expect(bestPersonalBestSet([{ reps: '10', weight: '0' }], 'bar_double')).toMatchObject({ weightValue: 45 });
    const history = getExerciseHistory('press', [{
      id: 'bar', date: '2026-09-26', status: 'finished',
      exerciseItems: [{ exerciseId: 'press', weightType: 'bar_double', sets: [{ reps: '10', weight: '0' }] }],
    }]);
    expect(history[0].volume).toBe(450);
  });
});

describe('Smith + 2x', () => {
  it('adds the confirmed machine resistance, including fractional or zero resistance and an unloaded bar', () => {
    expect(effectiveWeight('45', 'smith_double', 20)).toBe(110);
    expect(effectiveWeight('45', 'smith_double', 35)).toBe(125);
    expect(effectiveWeight('10', 'smith_double', 17.5)).toBe(37.5);
    expect(effectiveWeight('45', 'smith_double', 0)).toBe(90);
    expect(effectiveWeight('0', 'smith_double', 20)).toBe(20);
    expect(effectiveWeight('45', 'bar_double')).toBe(135);
  });
  it('keeps unknown resistance distinct from confirmed zero', () => {
    for (const value of [undefined, null, '', -1, NaN, Infinity, 501]) {
      expect(effectiveWeight('45', 'smith_double', value)).toBeNull();
    }
    expect(smithWeightCaption('45', null)).toBe('90 lb plates + unknown bar');
    expect(smithWeightCaption('45', 20)).toBe('Total 110 lbs');
    expect(smithWeightCaption('', 20)).toBeNull();
  });
  it('does not invent a conversion between Smith and other load conventions', () => {
    expect(contextualWeightPlaceholder('45', 'smith_double', 'weight')).toBe('');
    expect(contextualWeightPlaceholder('45', 'bar_double', 'smith_double')).toBe('');
    expect(contextualWeightPlaceholder('45', 'smith_double', 'smith_double')).toBe('45');
    expect(contextualWeightPlaceholder('45', 'bar_double', 'weight')).toBe('135');
  });
  const item = resistance => ({ exerciseId: 'smith', weightType: 'smith_double', baselineId: 'machine-a', setupProfile: { id: 'machine-a', machine: 'Smith', smithBarWeight: resistance }, sets: [{ reps: '10', weight: '45' }] });
  const log = (id, date, resistance) => ({ id, date, name: 'Smith session', status: 'finished', exerciseItems: [item(resistance)] });
  it('excludes unknown total load from PRs and volume while retaining working-set counts', () => {
    expect(bestPersonalBestSet(item(null).sets, 'smith_double', null)).toBeNull();
    expect(bestPersonalBestSet(item(20).sets, 'smith_double', 20)).toMatchObject({ weightValue: 110 });
    const stats = buildProgress([log('a', '2026-09-25', null)], [{ id: 'smith', name: 'Smith', muscleGroup: 'Legs' }], 'all');
    expect(stats.totalSets).toBe(1);
    expect(stats.totalVolume).toBe(0);
    expect(stats.topExercises[0].best).toBeNull();
    expect(getExerciseHistory('smith', [log('a', '2026-09-25', 20)])[0].volume).toBe(1100);
  });
  it('separates different resistance snapshots and remembers the Smith mode', () => {
    const logs = [log('new', '2026-09-25', 20), log('old', '2026-09-24', 35), log('unknown', '2026-09-23', null)];
    expect(getExerciseHistory('smith', logs).map(x => x.logId)).toEqual(['new']);
    expect(lastWeightTypesByExerciseId(logs).smith).toBe('smith_double');
  });
  it('saves zero and clears the resistance without mutating the recorded profile', () => {
    const original = { id: 'machine', machine: 'Smith', smithBarWeight: 20 };
    expect(cleanSetup({ ...original, smithBarWeight: '0' }).smithBarWeight).toBe(0);
    expect(cleanSetup({ ...original, smithBarWeight: '' }).smithBarWeight).toBeUndefined();
    expect(original.smithBarWeight).toBe(20);
  });
});
