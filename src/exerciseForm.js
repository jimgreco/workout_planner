export const emptyExercise = () => ({
  name: '',
  muscleGroup: 'Other',
  notes: '',
  description: '',
  isUnilateral: false,
  defaultSets: '',
  defaultReps: '',
});

export function cleanExerciseForm(form) {
  const exercise = { ...form, name: form.name.trim() };
  if (!exercise.defaultSets) delete exercise.defaultSets;
  if (!exercise.defaultReps) delete exercise.defaultReps;
  return exercise;
}
