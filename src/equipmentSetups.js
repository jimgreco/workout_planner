import { hasRecordedReps } from './setEvidence.js';
import { smithLoadContext } from './weight.js';

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
  const rawResistance = String(draft.smithBarWeight ?? '').trim();
  if (rawResistance !== '') profile.smithBarWeight = Number(rawResistance);
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

// Call only when creating a new session item, never when rendering/resuming it.
// Finished logs are the account-owned, offline/synced preference record. Planning
// and active drafts cannot promote a tentative choice, and an unspecified latest
// choice must not resurrect an older setup. updatedAt is deliberately ignored:
// editing an old workout does not make it the most recently performed workout.
export function newWorkoutEquipment(item, exercise, logs = []) {
  if (!exercise || exercise.id !== item.exerciseId) return {};
  const finished = logs.filter(log => log.status === 'finished')
    .sort((a, b) => (b.endTime || b.startTime || b.date || '').localeCompare(a.endTime || a.startTime || a.date || '') || (b.id || '').localeCompare(a.id || ''))
    .flatMap(log => log.exerciseItems || []).filter(entry => entry.exerciseId === item.exerciseId
      && (entry.setupSelectionMade === true || entry.sets?.some(hasRecordedReps)));
  const source = finished.find(entry => (!item.baselineId || entry.baselineId === item.baselineId)
    && (!item.setupProfile || entry.setupProfile?.id === item.setupProfile.id));
  const requested = item.setupProfile || source?.setupProfile;
  const setupProfile = currentSetup(exercise, requested);
  if (requested && !setupProfile) {
    // Do not fall back to some other, older machine after a deletion.
    return { baselineId: item.baselineId === requested.id ? undefined : item.baselineId, techniqueNote: item.techniqueNote };
  }
  const baselineId = item.baselineId || source?.baselineId || setupProfile?.id;
  const techniqueNote = item.techniqueNote ?? source?.techniqueNote;
  const lastItem = finished.find(entry => entry.sets?.some(hasRecordedReps)
    && entry.setupProfile?.id === setupProfile?.id
    && (entry.baselineId || entry.setupProfile?.id) === baselineId
    && smithLoadContext(entry) === smithLoadContext({ ...entry, setupProfile }));
  return { setupProfile, baselineId, techniqueNote, lastItem };
}

export function removingSetup(exercise, id) {
  return {
    ...exercise,
    equipmentSetups: (exercise.equipmentSetups || []).filter(profile => profile.id !== id),
    deletedEquipmentSetupIds: [...new Set([...(exercise.deletedEquipmentSetupIds || []), id])],
  };
}
