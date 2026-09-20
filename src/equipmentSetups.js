export const setupFields = {
  gym: 'Gym',
  machine: 'Equipment / model',
  seat: 'Seat / bench setting',
  grip: 'Grip / attachment',
  loadConvention: 'Load convention (per hand, total, stack)',
};

export function setupLabel(profile) {
  return [profile?.gym, profile?.machine].map(value => value?.trim()).filter(Boolean).join(' · ') || profile?.name || 'Equipment setup';
}

export function setupDraft(profile = {}) {
  return { ...profile, gym: profile.gym || '', machine: profile.machine || (!profile.gym ? profile.name || '' : ''),
    seat: profile.seat || '', grip: profile.grip || '', loadConvention: profile.loadConvention || '' };
}

export function cleanSetup(draft) {
  const profile = { id: draft.id || crypto.randomUUID() };
  for (const key of Object.keys(setupFields)) profile[key] = (draft[key] || '').trim();
  // Retain a derived name for older app versions and exports.
  return { ...profile, name: setupLabel(profile).slice(0, 120) };
}

export function exerciseSetups(exercise, logs = [], templates = [], current) {
  const profiles = new Map();
  const deleted = new Set(exercise.deletedEquipmentSetupIds || []);
  const add = profile => { if (profile?.id && !deleted.has(profile.id)) profiles.set(profile.id, profile); };
  const history = [...logs].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.updatedAt || '').localeCompare(b.updatedAt || ''));
  for (const source of [...history, ...templates]) {
    for (const item of [...(source.prescription?.exerciseItems || []), ...(source.exerciseItems || [])]) {
      if (item.exerciseId === exercise.id) add(item.setupProfile);
    }
  }
  add(current);
  for (const profile of exercise.equipmentSetups || []) add(profile);
  return [...profiles.values()].sort((a, b) => setupLabel(a).localeCompare(setupLabel(b)));
}

export function currentSetup(exercise, profile) {
  if (exercise?.deletedEquipmentSetupIds?.includes(profile?.id)) return undefined;
  return exercise?.equipmentSetups?.find(entry => entry.id === profile?.id) || profile;
}

export function removingSetup(exercise, id) {
  return {
    ...exercise,
    equipmentSetups: (exercise.equipmentSetups || []).filter(profile => profile.id !== id),
    deletedEquipmentSetupIds: [...new Set([...(exercise.deletedEquipmentSetupIds || []), id])],
  };
}
