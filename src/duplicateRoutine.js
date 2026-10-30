// A library copy is a prescription, with no saved-resource or program identity.
export function duplicateRoutine(source, routines, id = crypto.randomUUID()) {
  const original = source.name.trim() || 'Routine';
  const copyName = suffix => {
    let prefix = '';
    for (const character of original) {
      if (prefix.length + character.length > 120 - suffix.length) break;
      prefix += character;
    }
    return `${prefix}${suffix}`;
  };
  const names = new Set(routines.map(routine => routine.name.trim().toLowerCase()));
  let name = copyName(' copy');
  for (let suffix = 2; names.has(name.toLowerCase()); suffix += 1) name = copyName(` copy ${suffix}`);
  return {
    id,
    name,
    description: source.description ?? '',
    gymId: source.gymId ?? null,
    exerciseItems: structuredClone(source.exerciseItems ?? []),
  };
}
