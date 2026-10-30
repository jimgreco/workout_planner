// Advance in workout order, matching Complete without wrapping or finishing.
export function nextWorkoutSetPosition(items, exerciseIndex, setIndex) {
  if (!items[exerciseIndex]?.sets?.[setIndex]) return null;
  if (setIndex + 1 < items[exerciseIndex].sets.length) return { exerciseIndex, setIndex: setIndex + 1 };
  for (let next = exerciseIndex + 1; next < items.length; next += 1) {
    if (items[next].sets?.length) return { exerciseIndex: next, setIndex: 0 };
  }
  return null;
}

export function skippingWorkoutSet(items, exerciseIndex, setIndex) {
  const set = items[exerciseIndex]?.sets?.[setIndex];
  if (!set || set.completion === 'skipped') return null;
  return {
    items: items.map((item, i) => i !== exerciseIndex ? item : {
      ...item,
      sets: item.sets.map((row, s) => s !== setIndex ? row : { ...row, completion: 'skipped', restStartTime: null, restDuration: null }),
    }),
    next: nextWorkoutSetPosition(items, exerciseIndex, setIndex),
  };
}
