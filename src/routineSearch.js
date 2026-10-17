export function filterRoutines(templates = [], query = '', exercises = []) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return templates;

  const exercisesById = new Map(exercises.map(exercise => [exercise.id, exercise]));
  return templates.filter(template => {
    const exerciseText = (template.exerciseItems ?? []).flatMap(item => {
      const exercise = exercisesById.get(item.exerciseId);
      return [exercise?.name, exercise?.muscleGroup];
    });
    const text = [template.name, template.description, ...exerciseText]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
