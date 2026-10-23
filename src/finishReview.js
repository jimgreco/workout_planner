import { hasRecordedReps } from './setEvidence.js';

// Review only missing working-set evidence. A copied prefill is still unrecorded,
// and intentionally skipped sets or warmups must not hold up finishing.
export function unfinishedWorkoutSets(items = [], exercises = []) {
  return items.flatMap((item, itemIndex) => {
    const setNumbers = (item.sets || []).flatMap((set, index) => (
      set.setType !== 'warmup' && set.completion !== 'skipped' && !hasRecordedReps(set)
        ? [index + 1] : []
    ));
    return setNumbers.length ? [{
      itemIndex,
      exerciseId: item.exerciseId,
      name: exercises.find((exercise) => exercise.id === item.exerciseId)?.name || 'Exercise',
      setNumbers,
    }] : [];
  });
}
