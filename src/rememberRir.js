import { completionLabel, hasRecordedReps, normalizedRir } from './setEvidence.js';

function rememberedValue(set) {
  const value = normalizedRir(set?.rir);
  // Older clients defaulted unknown RIR to zero. Only explicit modern records
  // make that zero eligible as a preference; never reinterpret old evidence.
  if (value === '0' && set.completion !== 'recorded') return null;
  return /^(?:[0-9]|10)$/.test(value ?? '') ? value : null;
}

export function lastExerciseRir(exerciseId, logs = []) {
  const finished = logs.filter(log => log.status === 'finished').sort((a, b) => {
    const left = a.endTime || a.startTime || a.date || '';
    const right = b.endTime || b.startTime || b.date || '';
    return right.localeCompare(left) || b.id.localeCompare(a.id);
  });
  for (const log of finished) {
    for (const item of [...(log.exerciseItems || [])].reverse()) {
      if (item.exerciseId !== exerciseId) continue;
      const set = [...(item.sets || [])].reverse().find(set => hasRecordedReps(set) && set.setType !== 'warmup');
      // An explicit unknown on the latest recorded set clears the preference.
      if (set) return rememberedValue(set);
    }
  }
  return null;
}

export function prefillExerciseRir(item, exercise, logs) {
  const value = exercise?.usesTime ? null : lastExerciseRir(item.exerciseId, logs);
  return { ...item, sets: item.sets.map(set => ({ ...set, rir: null, completion: 'unrecorded', placeholderRir: set.setType === 'warmup' ? null : value })) };
}

export function rirEntryValue(set) {
  return normalizedRir(set.rir) ?? (completionLabel(set) === 'unrecorded' && set.setType !== 'warmup' ? normalizedRir(set.placeholderRir) : null);
}

export function recordingRirPrefill(set) {
  return { ...set, rir: normalizedRir(set.rir) ?? (set.setType !== 'warmup' ? normalizedRir(set.placeholderRir) : null), placeholderRir: null };
}

export function additionalSetRir(item) {
  const lastRecorded = [...item.sets].reverse().find(set => hasRecordedReps(set) && set.setType !== 'warmup');
  return lastRecorded ? rememberedValue(lastRecorded) : normalizedRir(item.sets.at(-1)?.placeholderRir);
}
