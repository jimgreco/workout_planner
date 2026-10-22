import { completionLabel, hasRecordedReps } from './setEvidence.js';

// Only current-session evidence is eligible. Keep warmups/drop sets separate
// from ordinary working sets, and never replace an already recorded/skipped row.
export function repeatLastSetPlan(sets = []) {
  for (let targetIndex = 1; targetIndex < sets.length; targetIndex += 1) {
    const target = sets[targetIndex];
    if (completionLabel(target) !== 'unrecorded' || target.restStartTime != null || target.restDuration != null) continue;
    for (let sourceIndex = targetIndex - 1; sourceIndex >= 0; sourceIndex -= 1) {
      const source = sets[sourceIndex];
      if (hasRecordedReps(source) && (source.setType || 'working') === (target.setType || 'working')) {
        return { sourceIndex, targetIndex };
      }
    }
  }
  return null;
}

export function repeatingLastSet(item) {
  const plan = repeatLastSetPlan(item.sets);
  if (!plan) return item;
  const source = item.sets[plan.sourceIndex];
  return {
    ...item,
    sets: item.sets.map((set, index) => index !== plan.targetIndex ? set : {
      ...set,
      reps: source.reps ?? '',
      repsLeft: source.repsLeft,
      repsRight: source.repsRight,
      repMode: source.repMode,
      weight: item.weightType === 'none' ? '' : (source.weight ?? ''),
      completion: 'unrecorded',
      rir: null,
      rpe: null,
      restStartTime: null,
      restDuration: null,
    }),
  };
}
