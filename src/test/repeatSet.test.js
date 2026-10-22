import { describe, expect, it } from 'vitest';
import { repeatLastSetPlan, repeatingLastSet } from '../repeatSet.js';
import { hasRecordedReps } from '../setEvidence.js';

const recorded = { reps: '8', weight: '0', completion: 'recorded', rir: '0', rpe: '10', restStartTime: 1000, restDuration: 90 };
const unfinished = { reps: '', weight: '', completion: 'unrecorded', placeholderReps: '8-12', restTargetSeconds: 120 };

describe('repeat last set', () => {
  it('prefills only the next eligible row, retaining identity, targets and equipment', () => {
    const item = { exerciseId: 'bench', weightType: 'smith_double', setupProfile: { id: 'smith', smithBarWeight: 0 }, baselineId: 'b', targetRIR: 2,
      sets: [recorded, unfinished, { ...unfinished }] };
    const result = repeatingLastSet(item);
    expect(result).toMatchObject({ ...item, sets: [recorded, { ...unfinished, reps: '8', weight: '0', completion: 'unrecorded', rir: null, rpe: null, restStartTime: null, restDuration: null }, unfinished] });
    expect(result.sets[0]).toBe(item.sets[0]);
    expect(result.sets[2]).toBe(item.sets[2]);
    expect(result.setupProfile).toBe(item.setupProfile);
    expect(result.sets.filter(hasRecordedReps)).toHaveLength(1);
    expect(item.sets[1]).toEqual(unfinished);
    expect(repeatingLastSet(result)).toEqual(result);
    expect(repeatingLastSet(JSON.parse(JSON.stringify(result)))).toEqual(JSON.parse(JSON.stringify(result)));
  });

  it.each(['bar_double', 'smith_double', 'weight', 'double'])('preserves explicit zero and unknown load in %s mode', weightType => {
    for (const weight of ['0', '', undefined]) {
      const result = repeatingLastSet({ weightType, sets: [{ ...recorded, weight }, unfinished] });
      expect(result.sets[1].weight).toBe(weight ?? '');
    }
  });

  it('copies time-based/bodyweight reps without inventing load', () => {
    expect(repeatingLastSet({ weightType: 'none', sets: [{ ...recorded, reps: '60' }, unfinished] }).sets[1])
      .toMatchObject({ reps: '60', weight: '', completion: 'unrecorded' });
  });

  it.each(['separateSides', 'linkedSides'])('preserves %s data including a missing side without fallback', repMode => {
    const source = { ...recorded, reps: '', repsLeft: '8', repsRight: '', repMode };
    expect(repeatingLastSet({ sets: [source, { ...unfinished, repsRight: '12' }] }).sets[1])
      .toMatchObject({ reps: '', repsLeft: '8', repsRight: '', repMode, completion: 'unrecorded' });
  });

  it('never uses placeholders, skipped rows, zero-only reps or unrecorded convenience values as evidence', () => {
    for (const source of [unfinished, { ...recorded, completion: 'skipped' }, { ...recorded, completion: 'unrecorded' }, { reps: '0', weight: '100' }, { placeholderReps: '12', weight: '100' }]) {
      expect(repeatLastSetPlan([source, unfinished])).toBeNull();
    }
    expect(repeatLastSetPlan([])).toBeNull();
    expect(repeatLastSetPlan([recorded])).toBeNull();
  });

  it('never replaces recorded/skipped rows or a running/settled rest, including zero seconds', () => {
    for (const target of [recorded, { reps: '7' }, { ...unfinished, completion: 'skipped' }, { ...unfinished, restStartTime: 1000 }, { ...unfinished, restDuration: 0 }]) {
      expect(repeatLastSetPlan([recorded, target])).toBeNull();
    }
  });

  it('selects the closest preceding compatible recorded set, skipping warmups and drop sets', () => {
    const sets = [recorded, { ...recorded, reps: '5' }, { ...recorded, setType: 'warmup' }, { ...unfinished, completion: 'skipped' }, unfinished];
    expect(repeatLastSetPlan(sets)).toEqual({ sourceIndex: 1, targetIndex: 4 });
    expect(repeatingLastSet({ sets }).sets[4].reps).toBe('5');
    expect(repeatLastSetPlan([{ ...recorded, setType: 'warmup' }, unfinished])).toBeNull();
    expect(repeatLastSetPlan([recorded, { ...unfinished, setType: 'drop' }])).toBeNull();
    expect(repeatLastSetPlan([{ ...recorded, setType: 'warmup' }, { ...unfinished, setType: 'warmup' }])).toEqual({ sourceIndex: 0, targetIndex: 1 });
  });

  it('advances only after the user records the prefilled row', () => {
    let item = { sets: [recorded, unfinished, { ...unfinished }] };
    item = repeatingLastSet(item);
    expect(repeatLastSetPlan(item.sets)).toEqual({ sourceIndex: 0, targetIndex: 1 });
    item.sets[1] = { ...item.sets[1], reps: '6', completion: 'recorded' };
    expect(repeatLastSetPlan(item.sets)).toEqual({ sourceIndex: 1, targetIndex: 2 });
    expect(repeatingLastSet(item).sets[2].reps).toBe('6');
  });
});
