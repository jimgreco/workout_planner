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

// A new comparison context keeps the prescription and actual entries, but drops
// suggestions copied from the old machine or technique.
export function clearComparisonHints(set) {
  const goal = value => value?.match(/\(([^)]*)\)\s*$/)?.[1]?.trim() ?? value;
  return { ...set, placeholderReps: goal(set.placeholderReps),
    placeholderRepsLeft: goal(set.placeholderRepsLeft), placeholderRepsRight: goal(set.placeholderRepsRight),
    placeholderWeight: '', placeholderWeightType: undefined };
}

const teachesEquipment = entry => entry.setupSelectionMade === true || entry.sets?.some(hasRecordedReps);

function routineEquipmentOverride(item, template, finishedLogs) {
  if (!template?.id || (!item.setupProfile && !item.baselineId)) return undefined;
  const previous = finishedLogs.find(log => log.prescription?.templateId === template.id
    && log.exerciseItems?.some(entry => entry.exerciseId === item.exerciseId && teachesEquipment(entry)));
  const prescribed = previous?.prescription?.exerciseItems?.find(entry => entry.exerciseId === item.exerciseId);
  if (!prescribed || prescribed.setupProfile?.id !== item.setupProfile?.id
    || (prescribed.baselineId ?? undefined) !== (item.baselineId ?? undefined)
    || (prescribed.techniqueNote ?? undefined) !== (item.techniqueNote ?? undefined)) return undefined;
  // A routine edited since that workout began is a new prescription. The saved
  // prescription also fences legacy routines without an updatedAt timestamp.
  if (template.updatedAt != null) {
    const editedAt = Date.parse(template.updatedAt), startedAt = Date.parse(previous.startTime);
    if (!Number.isFinite(editedAt) || !Number.isFinite(startedAt) || editedAt > startedAt) return undefined;
  }
  const selected = previous.exerciseItems.find(entry => entry.exerciseId === item.exerciseId && teachesEquipment(entry));
  // A technique-only change must not erase an explicit routine baseline.
  return selected.setupProfile?.id !== prescribed.setupProfile?.id ? selected : undefined;
}

// Call only when creating a new session item, never when rendering/resuming it.
// Finished logs are the account-owned, offline/synced preference record. Planning
// and active drafts cannot promote a tentative choice, and an unspecified latest
// choice must not resurrect an older setup. updatedAt is deliberately ignored:
// editing an old workout does not make it the most recently performed workout.
export function newWorkoutEquipment(item, exercise, logs = [], template) {
  if (!exercise || exercise.id !== item.exerciseId) return {};
  const finishedLogs = logs.filter(log => log.status === 'finished')
    .sort((a, b) => (b.endTime || b.startTime || b.date || '').localeCompare(a.endTime || a.startTime || a.date || '') || (b.id || '').localeCompare(a.id || ''));
  const finished = finishedLogs.flatMap(log => log.exerciseItems || [])
    .filter(entry => entry.exerciseId === item.exerciseId && teachesEquipment(entry));
  const override = routineEquipmentOverride(item, template, finishedLogs);
  const context = override || item;
  const source = override || finished.find(entry => (!item.baselineId || entry.baselineId === item.baselineId)
    && (!item.setupProfile || entry.setupProfile?.id === item.setupProfile.id));
  const requested = override ? override.setupProfile : item.setupProfile || source?.setupProfile;
  const setupProfile = currentSetup(exercise, requested);
  if (requested && !setupProfile) {
    // Do not fall back to some other, older machine after a deletion.
    return { baselineId: context.baselineId === requested.id ? undefined : context.baselineId, techniqueNote: context.techniqueNote };
  }
  const baselineId = context.baselineId || source?.baselineId || setupProfile?.id;
  const techniqueNote = context.techniqueNote ?? source?.techniqueNote;
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
