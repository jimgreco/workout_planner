// Build a new prescription from history; actual training evidence never carries over.
export function repeatWorkoutPlan(source, exercises, today, id = crypto.randomUUID()) {
  if (source?.status !== 'finished') throw new Error('Choose a finished workout to repeat.');
  const known = new Set(exercises.map(exercise => exercise.id));
  const available = (source.exerciseItems || []).filter(item => known.has(item.exerciseId));
  if (!available.length) throw new Error('None of this workout’s exercises are still available.');
  const target = (planned, recorded) => String(planned ?? '').trim() || String(recorded ?? '');
  const exerciseItems = available.map(item => ({
    exerciseId: item.exerciseId,
    weightType: item.weightType,
    restTargetSeconds: item.restTargetSeconds,
    supersetGroup: item.supersetGroup,
    description: item.description,
    useIndividualReps: item.useIndividualReps,
    baselineId: item.baselineId,
    techniqueNote: item.techniqueNote,
    setupProfile: item.setupProfile ? structuredClone(item.setupProfile) : null,
    setupSelectionMade: item.setupSelectionMade,
    targetRIR: item.targetRIR ?? null,
    sets: (item.sets || []).map(set => ({
      reps: '', repsLeft: '', repsRight: '', weight: '', completion: 'unrecorded',
      repMode: set.repMode, setType: set.setType,
      placeholderReps: target(set.placeholderReps, set.reps),
      placeholderRepsLeft: target(set.placeholderRepsLeft, set.repsLeft),
      placeholderRepsRight: target(set.placeholderRepsRight, set.repsRight),
      placeholderWeight: target(set.weight, set.placeholderWeight),
      placeholderWeightType: item.weightType,
      restTargetSeconds: set.restTargetSeconds,
    })),
  }));
  return { id, name: source.name, date: today, notes: '', status: 'planning', exerciseItems };
}
