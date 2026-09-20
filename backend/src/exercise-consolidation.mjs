// Reviewed movement families. Do not use fuzzy matching: position, grip, and
// unilateral variants can represent intentionally distinct exercises.
export const EXERCISE_FAMILIES = [
  { name: 'Chest Press', names: ['Chest Press', 'Bench Press', 'Dumbbell Bench Press', 'DB Bench Press', 'Machine Chest Press'] },
  { name: 'Incline Chest Press', names: ['Incline Chest Press', 'Incline Bench Press', 'Incline Dumbbell Press', 'Incline DB Press'] },
  { name: 'Overhead Press', names: ['Overhead Press', 'BB Overhead Press', 'Dumbbell Shoulder Press', 'DB Shoulder Press'] },
  { name: 'Biceps Curl', names: ['Biceps Curl', 'Barbell Curl', 'BB Curl', 'Dumbbell Curl', 'DB Curl', 'Cable Curl'] },
  { name: 'Chest Fly', names: ['Chest Fly', 'DB Chest Fly', 'Cable Crossover'] },
  { name: 'Reverse Fly', names: ['Reverse Fly', 'DB Rear Delt Fly', 'Cable Rear-Delt Fly', 'Reverse Pec Deck'] },
  { name: 'Chest Supported Row', names: ['Chest Supported Row', 'DB Chest Supported Row'] },
  { name: 'Hip Thrust', names: ['Hip Thrust', 'BB Hip Thrust', 'Hip-Thrust Machine', 'Smith Hip Thrust'] },
  { name: 'Standing Calf Raise', names: ['Standing Calf Raise', 'Smith Standing Calf Raise'] },
  { name: 'Seated Calf Raise', names: ['Seated Calf Raise', 'Seated Dumbbell Calf Raise'] },
  { name: 'Step-up', names: ['Step-up', 'Weighted Step Up'] },
];

function unionEquipment(exercises) {
  return [...new Map(exercises.flatMap(exercise => exercise.equipmentAlternatives || []).map(ref => [JSON.stringify(ref), ref])).values()];
}

export function consolidateDefaultExercises(exercises) {
  const result = exercises.filter(exercise => !EXERCISE_FAMILIES.some(family => family.names.includes(exercise.name)));
  for (const family of EXERCISE_FAMILIES) {
    const sources = exercises.filter(exercise => family.names.includes(exercise.name));
    if (!sources.length) continue;
    result.push({ ...sources[0], name: family.name, notes: 'Choose equipment and record its settings in an equipment setup.', equipmentAlternatives: unionEquipment(sources) });
  }
  return result;
}

function legacyMachine(exercise) {
  if (/^(DB |Dumbbell |Incline DB |Incline Dumbbell |Seated Dumbbell )/.test(exercise.name)) return 'Dumbbells';
  if (/^(BB |Barbell )/.test(exercise.name) || ['Bench Press', 'Incline Bench Press'].includes(exercise.name)) return 'Barbell';
  if (exercise.name.startsWith('Smith ')) return 'Smith machine';
  if (exercise.name.startsWith('Cable ')) return 'Cable station';
  if (exercise.name === 'Reverse Pec Deck') return 'Reverse pec deck';
  if (exercise.name === 'Machine Chest Press') return 'Chest press machine';
  if (exercise.name === 'Hip-Thrust Machine') return 'Hip thrust machine';
  return 'Unspecified equipment (' + exercise.name + ')';
}

export function planFamily(items, family, now = new Date().toISOString()) {
  const sources = items.filter(item => item.SK.startsWith('EXERCISE#') && family.names.includes(item.name));
  if (!sources.length || (sources.length === 1 && sources[0].name === family.name)) return null;
  const target = sources.find(item => item.name === family.name) || sources.find(item => item.name === family.names[1]) || sources[0];
  const byID = new Map(sources.map(item => [item.id, item]));
  const profiles = new Map();
  const addProfile = profile => { if (profile) profiles.set(profile.id, profile); };
  for (const source of sources) for (const profile of source.equipmentSetups || []) addProfile(profile);
  function legacyProfile(source, weightType = 'weight') {
    const id = 'legacy-' + source.id + '-' + weightType;
    const machine = legacyMachine(source);
    const profile = { id, name: machine, gym: '', machine, seat: '', grip: '', loadConvention: 'Original weight mode: ' + weightType };
    if (!profiles.has(id)) addProfile(profile);
    return profiles.get(id);
  }
  // Even unused variants remain available as setups instead of disappearing.
  for (const source of sources) legacyProfile(source);
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewrite(entry)]));
    const source = byID.get(value.exerciseId);
    if (source) {
      const profile = value.setupProfile || legacyProfile(source, value.weightType || 'weight');
      addProfile(profile);
      result.exerciseId = target.id;
      result.setupProfile = profile;
      result.baselineId = value.baselineId || profile.id;
      if (value.useIndividualReps === undefined && source.isUnilateral != null) result.useIndividualReps = source.isUnilateral;
      if (!value.description && (source.description || source.notes)) result.description = source.description || source.notes;
    }
    if (Array.isArray(value.pbExerciseIds)) result.pbExerciseIds = [...new Set(value.pbExerciseIds.map(id => byID.has(id) ? target.id : id))];
    return result;
  }
  const changed = [];
  for (const item of items) {
    if (!/^(LOG|TEMPLATE|PROGRAM)#/.test(item.SK)) continue;
    const updated = rewrite(item);
    if (JSON.stringify(updated) !== JSON.stringify(item)) changed.push({ before: item, after: { ...updated, revision: (item.revision || 0) + 1, updatedAt: now } });
  }
  // Saved library settings take precedence over immutable historical snapshots.
  for (const source of sources) for (const profile of source.equipmentSetups || []) addProfile(profile);
  const canonical = { ...target, name: family.name, notes: 'Choose equipment and record its settings in an equipment setup.', equipmentAlternatives: unionEquipment(sources), equipmentSetups: [...profiles.values()], revision: (target.revision || 0) + 1, updatedAt: now };
  // A global PB would compare incompatible implements. Original manual PBs,
  // notes, and descriptions remain in the archived source records and backup.
  delete canonical.personalBest;
  delete canonical.description;
  delete canonical.isUnilateral;
  changed.push({ before: target, after: canonical });
  const removed = sources.filter(source => source.id !== target.id);
  const archives = sources.map(source => ({ ...source, SK: 'EXERCISE_ARCHIVE#equipment-setups-v1#' + source.id, mergedInto: target.id, archivedAt: now }));
  return { name: family.name, sourceNames: sources.map(source => source.name), targetID: target.id, changed, removed, archives };
}
