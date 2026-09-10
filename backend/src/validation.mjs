export class ValidationError extends Error {
  constructor(message, options = undefined) {
    super(message);
    this.name = 'ValidationError';
    if (options?.cause) this.cause = options.cause;
    if (options?.details) this.details = options.details;
  }
}

export const MAX_BODY_BYTES = 512 * 1024;

const MUSCLE_GROUPS = new Set([
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Full Body', 'Cardio', 'Other',
]);
const WEIGHT_TYPES = new Set(['weight', 'double', 'bar_double', 'none']);
const SET_TYPES = new Set(['warmup', 'working', 'drop', 'failure']);
const SUPERSET_GROUPS = new Set(['A', 'B', 'C', 'D']);
const PROGRESSION_TYPES = new Set(['double_progression', 'linear_weight', 'linear_reps', 'none']);
const DELOAD_TYPES = new Set(['every_n_weeks', 'none']);
const LOG_STATUSES = new Set(['planning', 'active', 'finished', 'skipped']);

function fail(message) {
  throw new ValidationError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported field "${key}"`);
  }
}

export function validateId(id, label = 'id') {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    fail(`${label} is invalid`);
  }
  return id;
}

function stringValue(value, label, { required = false, max = 255, allowEmpty = !required } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`${label} is required`);
    return undefined;
  }
  if (typeof value !== 'string') fail(`${label} must be a string`);
  if (!allowEmpty && value.trim().length === 0) fail(`${label} is required`);
  if (value.length > max) fail(`${label} is too long`);
  return value;
}

function boolValue(value, label) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
  return value;
}

function intValue(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function optionalIntValue(value, label, min, max) {
  if (value === undefined || value === null) return undefined;
  return intValue(value, label, min, max);
}

function optionalNumber(value, label, min, max) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label} must be a number between ${min} and ${max}`);
  }
  return value;
}

function dateValue(value, label, { required = false } = {}) {
  const str = stringValue(value, label, { required, max: 10, allowEmpty: false });
  if (str === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) fail(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== str) {
    fail(`${label} must be a real calendar date`);
  }
  return str;
}

function isoDateTimeValue(value, label) {
  const str = stringValue(value, label, { max: 64 });
  if (str === undefined || str === '') return str;
  if (Number.isNaN(Date.parse(str))) fail(`${label} must be an ISO timestamp`);
  return str;
}

function idArray(value, label) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 100) fail(`${label} must be an array`);
  return value.map((item, index) => validateId(item, `${label}[${index}]`));
}

function weekdayValue(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    fail(`${label} must be an integer between 0 and 6`);
  }
  return value;
}

function optionalRevision(value, label) {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    fail(`${label} must be a non-negative integer`);
  }
  return value;
}

function personalBest(value) {
  if (value === undefined || value === null) return undefined;
  assertObject(value, 'personalBest');
  assertAllowedKeys(value, new Set(['weight', 'reps', 'date']), 'personalBest');
  const weight = stringValue(value.weight, 'personalBest.weight', { required: true, max: 32, allowEmpty: false });
  const reps = stringValue(value.reps, 'personalBest.reps', { max: 32, allowEmpty: false });
  const date = dateValue(value.date, 'personalBest.date');
  return {
    weight,
    ...(reps ? { reps } : {}),
    ...(date ? { date } : {}),
  };
}

function workoutSet(value, index) {
  assertObject(value, `set ${index + 1}`);
  assertAllowedKeys(
    value,
    new Set(['reps', 'repsLeft', 'repsRight', 'repMode', 'weight', 'placeholderReps', 'placeholderRepsLeft', 'placeholderRepsRight', 'placeholderWeight', 'placeholderWeightType', 'restStartTime', 'restDuration', 'restTargetSeconds', 'rpe', 'rir', 'setType', 'completion']),
    `set ${index + 1}`,
  );
  const set = {};
  for (const field of ['reps', 'repsLeft', 'repsRight', 'weight', 'placeholderReps', 'placeholderRepsLeft', 'placeholderRepsRight', 'placeholderWeight']) {
    const str = stringValue(value[field], `set.${field}`, { max: 64 });
    if (str !== undefined) set[field] = str;
  }
  const repMode = stringValue(value.repMode, 'set.repMode', { max: 32 });
  if (repMode !== undefined) {
    if (!new Set(['single', 'separateSides', 'linkedSides']).has(repMode)) fail('set.repMode is invalid');
    set.repMode = repMode;
  }
  const placeholderWeightType = stringValue(value.placeholderWeightType, 'set.placeholderWeightType', { max: 16 });
  if (placeholderWeightType !== undefined) {
    if (!WEIGHT_TYPES.has(placeholderWeightType)) fail('set.placeholderWeightType is invalid');
    set.placeholderWeightType = placeholderWeightType;
  }
  for (const field of ['rpe', 'rir']) {
    const str = stringValue(value[field], `set.${field}`, { max: 8 });
    if (str !== undefined) set[field] = str;
  }
  const completion = stringValue(value.completion, 'set.completion', { max: 16 });
  if (completion !== undefined) {
    if (!['recorded', 'skipped', 'unrecorded'].includes(completion)) fail('set.completion is invalid');
    set.completion = completion;
  }
  const setType = stringValue(value.setType, 'set.setType', { max: 16 });
  if (setType !== undefined) {
    if (!SET_TYPES.has(setType)) fail('set.setType is invalid');
    set.setType = setType;
  }
  const restStartTime = optionalNumber(value.restStartTime, 'set.restStartTime', 0, 9_999_999_999_999);
  if (restStartTime !== undefined) set.restStartTime = restStartTime;
  const restDuration = optionalNumber(value.restDuration, 'set.restDuration', 0, 24 * 60 * 60);
  if (restDuration !== undefined) set.restDuration = restDuration;
  const restTargetSeconds = optionalIntValue(value.restTargetSeconds, 'set.restTargetSeconds', 0, 3600);
  if (restTargetSeconds > 0) set.restTargetSeconds = restTargetSeconds;
  return set;
}

function setupProfile(value) {
  assertObject(value, 'setupProfile');
  assertAllowedKeys(value, new Set(['id','name','gym','machine','seat','grip','loadConvention']), 'setupProfile');
  const result = { id: validateId(value.id, 'setupProfile.id') };
  for (const key of ['name','gym','machine','seat','grip','loadConvention']) result[key] = stringValue(value[key], `setupProfile.${key}`, { required: key === 'name', max: 120, allowEmpty: key !== 'name' }) ?? '';
  return result;
}
function programPhases(value, start, end) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 24) fail('Use at most 24 phases.');
  let previousEnd = '';
  const phaseIds = new Set();
  return [...value].sort((a,b) => String(a.startDate).localeCompare(String(b.startDate))).map(v => {
    assertObject(v, 'phase');
    assertAllowedKeys(v, new Set(['id','name','startDate','endDate','setsPerExercise','targetRir','notes','allowOptional']), 'phase');
    const phase = { id: validateId(v.id,'phase.id'), name: stringValue(v.name,'phase.name',{required:true,max:120,allowEmpty:false}), startDate: dateValue(v.startDate,'phase.startDate',{required:true}), endDate: dateValue(v.endDate,'phase.endDate',{required:true}) };
    if (phaseIds.has(phase.id)) fail('Phase ids must be unique.');
    phaseIds.add(phase.id);
    if (phase.endDate < phase.startDate || phase.startDate < start || (end && phase.endDate > end) || phase.startDate <= previousEnd) fail('Phase dates must be ordered, nonoverlapping, and inside the program dates.');
    previousEnd = phase.endDate;
    if (v.setsPerExercise != null) phase.setsPerExercise = optionalIntValue(v.setsPerExercise,'phase.setsPerExercise',1,20);
    if (v.targetRir != null) phase.targetRir = optionalIntValue(v.targetRir,'phase.targetRir',0,10);
    phase.notes = stringValue(v.notes,'phase.notes',{max:1000}) ?? '';
    phase.allowOptional = boolValue(v.allowOptional,'phase.allowOptional') ?? true;
    return phase;
  });
}
function prescription(value) {
  assertObject(value, 'prescription');
  assertAllowedKeys(value, new Set(['templateId','templateName','programId','programName','phaseName','day','optional','exerciseItems','targetRir']), 'prescription');
  const result = { templateId: validateId(value.templateId,'prescription.templateId'), templateName: stringValue(value.templateName,'prescription.templateName',{required:true,max:120}), day: dateValue(value.day,'prescription.day',{required:true}), optional: boolValue(value.optional,'prescription.optional') ?? false, exerciseItems: exerciseItems(value.exerciseItems,'prescription.exerciseItems') };
  if (value.programId) result.programId = validateId(value.programId,'prescription.programId');
  for (const key of ['programName','phaseName']) if (value[key] != null) result[key] = stringValue(value[key],`prescription.${key}`,{max:120});
  if (value.targetRir != null) result.targetRir = optionalIntValue(value.targetRir,'prescription.targetRir',0,10);
  return result;
}

function exerciseItem(value, index) {
  assertObject(value, `exerciseItems[${index}]`);
  assertAllowedKeys(value, new Set(['exerciseId', 'weightType', 'sets', 'restTargetSeconds', 'supersetGroup', 'description', 'useIndividualReps', 'baselineId', 'techniqueNote', 'setupProfile']), `exerciseItems[${index}]`);
  const exerciseId = validateId(value.exerciseId, `exerciseItems[${index}].exerciseId`);
  const weightType = stringValue(value.weightType, `exerciseItems[${index}].weightType`, { max: 16 }) ?? 'weight';
  if (!WEIGHT_TYPES.has(weightType)) fail(`exerciseItems[${index}].weightType is invalid`);
  if (!Array.isArray(value.sets) || value.sets.length > 50) {
    fail(`exerciseItems[${index}].sets must contain at most 50 sets`);
  }
  const item = {
    exerciseId,
    weightType,
    sets: value.sets.map(workoutSet),
  };
  if (value.setupProfile != null) item.setupProfile = setupProfile(value.setupProfile);
  if (value.baselineId != null) item.baselineId = validateId(value.baselineId, 'baselineId');
  const techniqueNote = stringValue(value.techniqueNote, 'techniqueNote', { max: 300 });
  if (techniqueNote !== undefined) item.techniqueNote = techniqueNote;
  const description = stringValue(value.description, `exerciseItems[${index}].description`, { max: 1000 });
  if (description !== undefined) item.description = description;
  const useIndividualReps = boolValue(value.useIndividualReps, `exerciseItems[${index}].useIndividualReps`);
  if (useIndividualReps !== undefined) item.useIndividualReps = useIndividualReps;
  const restTargetSeconds = optionalIntValue(value.restTargetSeconds, `exerciseItems[${index}].restTargetSeconds`, 0, 3600);
  if (restTargetSeconds > 0) item.restTargetSeconds = restTargetSeconds;
  const supersetGroup = stringValue(value.supersetGroup, `exerciseItems[${index}].supersetGroup`, { max: 8 });
  if (supersetGroup) {
    if (!SUPERSET_GROUPS.has(supersetGroup)) fail(`exerciseItems[${index}].supersetGroup is invalid`);
    item.supersetGroup = supersetGroup;
  }
  return item;
}

function exerciseItems(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 80) fail(`${label} must contain at most 80 exercises`);
  return value.map(exerciseItem);
}

function requireMatchingId(body, pathId) {
  validateId(pathId);
  if (body.id !== undefined && body.id !== pathId) fail('body id must match path id');
}

export function validateSettings(body) {
  assertObject(body, 'settings');
  assertAllowedKeys(body, new Set(['defaultSets', 'defaultReps', 'defaultRestTargetSeconds', 'advancedMode']), 'settings');
  return {
    defaultSets: intValue(body.defaultSets, 'defaultSets', 1, 20),
    defaultReps: intValue(body.defaultReps, 'defaultReps', 1, 100),
    defaultRestTargetSeconds: optionalIntValue(body.defaultRestTargetSeconds, 'defaultRestTargetSeconds', 0, 3600) ?? 0,
    advancedMode: boolValue(body.advancedMode, 'advancedMode') ?? false,
  };
}

export function validateGym(body, pathId) {
  assertObject(body, 'gym');
  assertAllowedKeys(body, new Set(['id', 'name', 'notes', 'equipment', 'revision', 'expectedRevision', 'updatedAt']), 'gym');
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  if (!Array.isArray(body.equipment) || body.equipment.length > 200) fail('equipment must be an array of at most 200 items');
  const ids = new Set();
  const equipment = body.equipment.map((item, index) => {
    const label = `equipment[${index}]`;
    assertObject(item, label);
    assertAllowedKeys(item, new Set(['id', 'name', 'category', 'details']), label);
    validateId(item.id, `${label}.id`);
    if (ids.has(item.id)) fail('equipment IDs must be unique');
    ids.add(item.id);
    const category = stringValue(item.category, `${label}.category`, { max: 40 }) ?? 'Other';
    if (!['Free weights', 'Machines', 'Cables', 'Benches & racks', 'Cardio', 'Accessories', 'Other'].includes(category)) fail(`${label}.category is invalid`);
    return {
      id: item.id,
      name: stringValue(item.name, `${label}.name`, { required: true, max: 120 }).trim(),
      category,
      details: stringValue(item.details, `${label}.details`, { max: 500 }) ?? '',
    };
  });
  return {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120 }).trim(),
    notes: stringValue(body.notes, 'notes', { max: 2000 }) ?? '',
    equipment,
  };
}

export function validateExercise(body, pathId) {
  assertObject(body, 'exercise');
  assertAllowedKeys(body, new Set(['id', 'name', 'muscleGroup', 'notes', 'description', 'isUnilateral', 'usesTime', 'defaultSets', 'defaultReps', 'personalBest', 'equipmentAlternatives', 'updatedAt', 'revision', 'expectedRevision']), 'exercise');
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const muscleGroup = stringValue(body.muscleGroup, 'muscleGroup', { max: 60 }) ?? 'Other';
  if (!MUSCLE_GROUPS.has(muscleGroup)) fail('muscleGroup is invalid');
  const exercise = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    muscleGroup,
  };
  const notes = stringValue(body.notes, 'notes', { max: 1000 });
  if (notes !== undefined) exercise.notes = notes;
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) exercise.description = description;
  const isUnilateral = boolValue(body.isUnilateral, 'isUnilateral');
  if (isUnilateral !== undefined) exercise.isUnilateral = isUnilateral;
  const usesTime = boolValue(body.usesTime, 'usesTime');
  if (usesTime !== undefined) exercise.usesTime = usesTime;
  const defaultSets = optionalIntValue(body.defaultSets, 'defaultSets', 1, 20);
  if (defaultSets !== undefined) exercise.defaultSets = defaultSets;
  const defaultReps = optionalIntValue(body.defaultReps, 'defaultReps', 1, 100);
  if (defaultReps !== undefined) exercise.defaultReps = defaultReps;
  if (body.equipmentAlternatives !== undefined) {
    if (!Array.isArray(body.equipmentAlternatives) || body.equipmentAlternatives.length > 100) fail('equipmentAlternatives must be an array of at most 100 entries');
    const refs = new Set();
    exercise.equipmentAlternatives = body.equipmentAlternatives.map((entry, index) => {
      const label = `equipmentAlternatives[${index}]`;
      assertObject(entry, label);
      assertAllowedKeys(entry, new Set(['gymId', 'equipmentId']), label);
      const gymId = validateId(entry.gymId, `${label}.gymId`);
      const equipmentId = validateId(entry.equipmentId, `${label}.equipmentId`);
      const key = `${gymId}/${equipmentId}`;
      if (refs.has(key)) fail('equipmentAlternatives must be unique');
      refs.add(key);
      return { gymId, equipmentId };
    });
  }
  const best = personalBest(body.personalBest);
  if (best !== undefined) exercise.personalBest = best;
  return exercise;
}

export function validateTemplate(body, pathId) {
  assertObject(body, 'template');
  assertAllowedKeys(body, new Set(['id', 'name', 'description', 'gymId', 'exerciseItems', 'updatedAt', 'revision', 'expectedRevision']), 'template');
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const template = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    exerciseItems: exerciseItems(body.exerciseItems, 'exerciseItems'),
  };
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) template.description = description;
  if (body.gymId === null) template.gymId = null;
  else if (body.gymId !== undefined) template.gymId = validateId(body.gymId, 'gymId');
  return template;
}

function programScheduleItem(value, index) {
  assertObject(value, `schedule[${index}]`);
  assertAllowedKeys(value, new Set(['id', 'templateId', 'notes', 'optional']), `schedule[${index}]`);
  const item = {
    id: validateId(value.id, `schedule[${index}].id`),
  };
  const templateId = stringValue(value.templateId, `schedule[${index}].templateId`, { max: 128, allowEmpty: true });
  if (templateId) item.templateId = validateId(templateId, `schedule[${index}].templateId`);
  if (value.optional != null) item.optional = boolValue(value.optional,'optional');
  const notes = stringValue(value.notes, `schedule[${index}].notes`, { max: 500 });
  if (notes !== undefined) item.notes = notes;
  return item;
}

function programSchedule(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 70) fail('schedule must contain at most 70 items');
  const seenIds = new Set();
  return value.map((item, index) => {
    const scheduleItem = programScheduleItem(item, index);
    if (seenIds.has(scheduleItem.id)) return null;
    seenIds.add(scheduleItem.id);
    return scheduleItem;
  }).filter(Boolean);
}

function programInsertedRestDays(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) fail('insertedRestDays must contain at most 1000 items');
  const seenDates = new Set();
  return value.map((item, index) => {
    const date = dateValue(item, `insertedRestDays[${index}]`, { required: true });
    if (seenDates.has(date)) return null;
    seenDates.add(date);
    return date;
  }).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function programProgression(value) {
  if (value === undefined || value === null) return undefined;
  assertObject(value, 'progression');
  assertAllowedKeys(value, new Set(['type', 'minReps', 'maxReps', 'repIncrement', 'weightIncrement']), 'progression');

  const type = stringValue(value.type, 'progression.type', { required: true, max: 32, allowEmpty: false });
  if (!PROGRESSION_TYPES.has(type)) fail('progression.type is invalid');

  const progression = { type };
  if (type === 'none') return progression;

  const minReps = optionalIntValue(value.minReps, 'progression.minReps', 1, 100);
  if (minReps !== undefined) progression.minReps = minReps;
  const maxReps = optionalIntValue(value.maxReps, 'progression.maxReps', 1, 100);
  if (maxReps !== undefined) progression.maxReps = maxReps;
  if (minReps !== undefined && maxReps !== undefined && minReps > maxReps) {
    fail('progression.minReps must be less than or equal to progression.maxReps');
  }

  const repIncrement = optionalIntValue(value.repIncrement, 'progression.repIncrement', 1, 20);
  if (repIncrement !== undefined) progression.repIncrement = repIncrement;
  const weightIncrement = optionalNumber(value.weightIncrement, 'progression.weightIncrement', 0.25, 200);
  if (weightIncrement !== undefined) progression.weightIncrement = weightIncrement;

  return progression;
}

function programDeload(value) {
  if (value === undefined || value === null) return undefined;
  assertObject(value, 'deload');
  assertAllowedKeys(value, new Set(['type', 'everyWeeks', 'loadPercent', 'repPercent', 'startDate']), 'deload');

  const type = stringValue(value.type, 'deload.type', { required: true, max: 32, allowEmpty: false });
  if (!DELOAD_TYPES.has(type)) fail('deload.type is invalid');

  const deload = { type };
  if (type === 'none') return deload;

  deload.everyWeeks = optionalIntValue(value.everyWeeks, 'deload.everyWeeks', 2, 12) ?? 4;
  deload.loadPercent = optionalIntValue(value.loadPercent, 'deload.loadPercent', 40, 100) ?? 85;
  deload.repPercent = optionalIntValue(value.repPercent, 'deload.repPercent', 40, 100) ?? 100;
  deload.startDate = dateValue(value.startDate, 'deload.startDate', { required: true });

  return deload;
}

function programActivityItem(value, index) {
  assertObject(value, `activity[${index}]`);
  assertAllowedKeys(value, new Set(['id', 'type', 'date', 'title', 'detail']), `activity[${index}]`);

  const item = {
    id: validateId(value.id, `activity[${index}].id`),
    type: stringValue(value.type, `activity[${index}].type`, { required: true, max: 32, allowEmpty: false }),
    date: stringValue(value.date, `activity[${index}].date`, { required: true, max: 40, allowEmpty: false }),
    title: stringValue(value.title, `activity[${index}].title`, { required: true, max: 160, allowEmpty: false }),
  };
  const detail = stringValue(value.detail, `activity[${index}].detail`, { max: 500 });
  if (detail !== undefined) item.detail = detail;
  return item;
}

function programActivity(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 30) fail('activity must contain at most 30 items');
  const seen = new Set();
  return value.map((item, index) => {
    const entry = programActivityItem(item, index);
    if (seen.has(entry.id)) return null;
    seen.add(entry.id);
    return entry;
  }).filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function validateProgram(body, pathId) {
  assertObject(body, 'program');
  assertAllowedKeys(
    body,
    new Set(['id', 'name', 'description', 'schedule', 'startDate', 'endDate', 'scheduledActivation', 'phases', 'insertedRestDays', 'active', 'progression', 'deload', 'progressionRule', 'activity', 'updatedAt', 'revision', 'expectedRevision']),
    'program',
  );
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const program = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    schedule: programSchedule(body.schedule),
    startDate: dateValue(body.startDate, 'startDate', { required: true }),
    insertedRestDays: programInsertedRestDays(body.insertedRestDays),
  };
  if (body.endDate) { program.endDate = dateValue(body.endDate,'endDate'); if (program.endDate < program.startDate) fail('End date must follow the start date.'); }
  program.scheduledActivation = boolValue(body.scheduledActivation,'scheduledActivation') ?? false;
  program.phases = programPhases(body.phases,program.startDate,program.endDate);
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) program.description = description;
  const active = boolValue(body.active, 'active');
  if (active !== undefined) program.active = active;
  const progression = programProgression(body.progression);
  if (progression !== undefined) program.progression = progression;
  const deload = programDeload(body.deload);
  if (deload !== undefined) program.deload = deload;
  const progressionRule = stringValue(body.progressionRule, 'progressionRule', { max: 1000 });
  if (progressionRule !== undefined) program.progressionRule = progressionRule;
  const activity = programActivity(body.activity);
  if (activity !== undefined) program.activity = activity;
  return program;
}

export function validateLog(body, pathId) {
  assertObject(body, 'log');
  assertAllowedKeys(
    body,
    new Set(['id', 'name', 'date', 'notes', 'readiness', 'prescription', 'exerciseItems', 'startTime', 'endTime', 'status', 'hasPB', 'pbExerciseIds', 'updatedAt', 'revision', 'expectedRevision']),
    'log',
  );
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const status = stringValue(body.status, 'status', { max: 16 }) ?? 'active';
  if (!LOG_STATUSES.has(status)) fail('status is invalid');
  const log = {
    id: pathId,
    name: stringValue(body.name, 'name', { max: 120, allowEmpty: true }) ?? '',
    date: dateValue(body.date, 'date', { required: true }),
    exerciseItems: exerciseItems(body.exerciseItems, 'exerciseItems'),
    status,
  };
  const notes = stringValue(body.notes, 'notes', { max: 2000 });
  if (notes !== undefined) log.notes = notes;
  if (body.prescription != null) log.prescription = prescription(body.prescription);
  const readiness = optionalIntValue(body.readiness, 'readiness', 1, 5);
  if (readiness !== undefined) log.readiness = readiness;
  const startTime = isoDateTimeValue(body.startTime, 'startTime');
  if (startTime !== undefined) log.startTime = startTime;
  const endTime = isoDateTimeValue(body.endTime, 'endTime');
  if (endTime !== undefined) log.endTime = endTime;
  const hasPB = boolValue(body.hasPB, 'hasPB');
  if (hasPB !== undefined) log.hasPB = hasPB;
  const pbExerciseIds = idArray(body.pbExerciseIds, 'pbExerciseIds');
  if (pbExerciseIds !== undefined) log.pbExerciseIds = pbExerciseIds;
  return log;
}

export function validateFeedback(body) {
  assertObject(body, 'feedback');
  assertAllowedKeys(body, new Set(['message', 'build']), 'feedback');
  return {
    message: stringValue(body.message, 'message', { required: true, max: 2000, allowEmpty: false }),
    build: stringValue(body.build, 'build', { max: 500 }) ?? '',
  };
}

function importArray(value, label, max) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${label} must contain at most ${max} items`);
  return value;
}

export function validateImport(body) {
  assertObject(body, 'import');
  assertAllowedKeys(body, new Set(['mode', 'data']), 'import');
  const mode = stringValue(body.mode, 'mode', { max: 20 }) ?? 'merge';
  if (!['merge', 'emptyOnly'].includes(mode)) fail('mode is invalid');

  const data = body.data;
  assertObject(data, 'data');
  assertAllowedKeys(
    data,
    new Set(['exportedAt', 'exercises', 'templates', 'logs', 'programs', 'gyms', 'settings', 'feedback']),
    'data',
  );

  const exportedAt = isoDateTimeValue(data.exportedAt, 'exportedAt');
  const exercises = importArray(data.exercises, 'exercises', 1000)
    .map((exercise, index) => {
      assertObject(exercise, `exercises[${index}]`);
      return validateExercise(exercise, exercise.id);
    });
  const templates = importArray(data.templates, 'templates', 1000)
    .map((template, index) => {
      assertObject(template, `templates[${index}]`);
      return validateTemplate(template, template.id);
    });
  const logs = importArray(data.logs, 'logs', 2000)
    .map((log, index) => {
      assertObject(log, `logs[${index}]`);
      return validateLog(log, log.id);
    });
  const settings = data.settings === undefined || data.settings === null
    ? undefined
    : validateSettings(data.settings);
  const programs = importArray(data.programs, 'programs', 100)
    .map((program, index) => {
      assertObject(program, `programs[${index}]`);
      return validateProgram(program, program.id);
    });

  const gyms = importArray(data.gyms, 'gyms', 100).map((gym, index) => {
    assertObject(gym, `gyms[${index}]`);
    return validateGym(gym, gym.id);
  });
  if (new Set(gyms.map((gym) => gym.id)).size !== gyms.length) fail('gym IDs must be unique');
  return { mode, exportedAt, exercises, templates, logs, programs, gyms, settings };
}

export function validateAuthBody(body, provider) {
  assertObject(body, 'auth');
  if (provider === 'google') {
    assertAllowedKeys(body, new Set(['credential']), 'auth');
    return {
      credential: stringValue(body.credential, 'credential', { required: true, max: 8192, allowEmpty: false }),
    };
  }
  assertAllowedKeys(body, new Set(['identityToken', 'profile']), 'auth');
  const profile = body.profile;
  if (profile !== undefined) {
    assertObject(profile, 'profile');
    assertAllowedKeys(profile, new Set(['name', 'email', 'picture']), 'profile');
  }
  return {
    identityToken: stringValue(body.identityToken, 'identityToken', { required: true, max: 8192, allowEmpty: false }),
    profile: profile
      ? {
          name: stringValue(profile.name, 'profile.name', { max: 120 }) ?? '',
          email: stringValue(profile.email, 'profile.email', { max: 320 }) ?? '',
          picture: stringValue(profile.picture, 'profile.picture', { max: 1000 }) ?? '',
        }
      : undefined,
  };
}
