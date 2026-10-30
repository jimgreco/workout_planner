import { describe, expect, it } from 'vitest';
import { additionalSetRir, lastExerciseRir, prefillExerciseRir, recordingRirPrefill, rirEntryValue } from '../rememberRir.js';
import { isWorkingSet } from '../setEvidence.js';
const row = (rir, extra = {}) => ({ reps: '8', completion: 'recorded', rir, ...extra });
const log = (date, sets, extra = {}) => ({ id: date, date, status: 'finished', exerciseItems: [{ exerciseId: 'press', sets }], ...extra });

describe('remembered exercise RIR', () => {
  it('uses the latest recorded working set in session order, not edit time or targets', () => {
    const old = log('2026-10-01', [row('4')], { updatedAt: '2099-01-01' });
    const recent = log('2026-10-02', [row('2'), row('0'), row('8', { setType: 'warmup' }), row('7', { completion: 'skipped' }), row('6', { completion: 'unrecorded' })]);
    expect(lastExerciseRir('press', [recent, old, log('2026-10-03', [row('9')], { status: 'active' }), log('2026-10-04', [row('9')], { status: 'planning' })])).toBe('0');
    expect(lastExerciseRir('row', [recent])).toBeNull();
    expect(lastExerciseRir('press', [])).toBeNull();
    expect(lastExerciseRir('press', [old, log('2026-10-05', [row(null)])])).toBeNull();
    expect(lastExerciseRir('press', [log('2026-10-02', [row('0', { completion: undefined })])])).toBeNull();
    for (const invalid of ['', ' ', '11', '-1', '2.5', 'oops']) expect(lastExerciseRir('press', [log('2026-10-02', [row(invalid)])])).toBeNull();
  });
  it('snapshots an editable prefill without inventing evidence, survives serialization, and preserves targets/history', () => {
    const history = [log('2026-10-02', [row('0')])];
    const before = JSON.stringify(history);
    const item = { exerciseId: 'press', targetRIR: 3, sets: [{ reps: '', placeholderReps: '8' }, { reps: '', setType: 'warmup' }] };
    const draft = prefillExerciseRir(item, {}, history);
    const restored = JSON.parse(JSON.stringify(draft));
    expect(restored.targetRIR).toBe(3);
    expect(restored.sets[0]).toMatchObject({ rir: null, placeholderRir: '0', completion: 'unrecorded' });
    expect(isWorkingSet(restored.sets[0])).toBe(false);
    expect(rirEntryValue(restored.sets[0])).toBe('0');
    expect(restored.sets[1].placeholderRir).toBeNull();
    expect(prefillExerciseRir(item, { usesTime: true }, history).sets[0].placeholderRir).toBeNull();
    expect(JSON.stringify(history)).toBe(before);
    expect(item.sets[0].placeholderRir).toBeUndefined();
    const entered = recordingRirPrefill({ ...restored.sets[0], reps: '8', completion: 'recorded' });
    expect(entered).toMatchObject({ rir: '0', placeholderRir: null });
    expect(rirEntryValue({ ...restored.sets[0], completion: 'skipped' })).toBeNull();
    expect(rirEntryValue({ ...restored.sets[0], completion: 'recorded' })).toBeNull();
    expect(recordingRirPrefill({ ...restored.sets[0], rir: '4' }).rir).toBe('4');
    expect(recordingRirPrefill({ ...restored.sets[0], rir: null, placeholderRir: null }).rir).toBeNull();
    expect(additionalSetRir({ sets: [entered] })).toBe('0');
    expect(additionalSetRir({ sets: [entered, row(null)] })).toBeNull();
  });
});
