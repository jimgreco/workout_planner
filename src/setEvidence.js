export function hasRecordedReps(set = {}) {
  if (set.completion === 'skipped' || set.completion === 'unrecorded') return false;
  return [set.reps, set.repsLeft, set.repsRight].some(v => String(v ?? '').trim() !== '' && Number(v) > 0 && Number.isFinite(Number(v)));
}
export function isWorkingSet(set = {}) {
  return hasRecordedReps(set) && set.setType !== 'warmup';
}
export function completionLabel(set = {}) {
  return set.completion || (hasRecordedReps(set) ? 'recorded' : 'unrecorded');
}
