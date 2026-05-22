export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const MAX_BODY_BYTES = 128 * 1024;

const MUSCLE_GROUPS = new Set([
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Full Body', 'Cardio', 'Other',
]);
const WEIGHT_TYPES = new Set(['weight', 'double', 'none']);
const LOG_STATUSES = new Set(['planning', 'active', 'finished']);

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

function personalBest(value) {
  if (value === undefined || value === null) return undefined;
  assertObject(value, 'personalBest');
  assertAllowedKeys(value, new Set(['weight', 'date']), 'personalBest');
  const weight = stringValue(value.weight, 'personalBest.weight', { required: true, max: 32, allowEmpty: false });
  const date = dateValue(value.date, 'personalBest.date');
  return date ? { weight, date } : { weight };
}

function workoutSet(value, index) {
  assertObject(value, `set ${index + 1}`);
  assertAllowedKeys(
    value,
    new Set(['reps', 'weight', 'placeholderReps', 'placeholderWeight', 'restStartTime', 'restDuration']),
    `set ${index + 1}`,
  );
  const set = {};
  for (const field of ['reps', 'weight', 'placeholderReps', 'placeholderWeight']) {
    const str = stringValue(value[field], `set.${field}`, { max: 64 });
    if (str !== undefined) set[field] = str;
  }
  const restStartTime = optionalNumber(value.restStartTime, 'set.restStartTime', 0, 9_999_999_999_999);
  if (restStartTime !== undefined) set.restStartTime = restStartTime;
  const restDuration = optionalNumber(value.restDuration, 'set.restDuration', 0, 24 * 60 * 60);
  if (restDuration !== undefined) set.restDuration = restDuration;
  return set;
}

function exerciseItem(value, index) {
  assertObject(value, `exerciseItems[${index}]`);
  assertAllowedKeys(value, new Set(['exerciseId', 'weightType', 'sets']), `exerciseItems[${index}]`);
  const exerciseId = validateId(value.exerciseId, `exerciseItems[${index}].exerciseId`);
  const weightType = stringValue(value.weightType, `exerciseItems[${index}].weightType`, { max: 16 }) ?? 'weight';
  if (!WEIGHT_TYPES.has(weightType)) fail(`exerciseItems[${index}].weightType is invalid`);
  if (!Array.isArray(value.sets) || value.sets.length > 50) {
    fail(`exerciseItems[${index}].sets must contain at most 50 sets`);
  }
  return {
    exerciseId,
    weightType,
    sets: value.sets.map(workoutSet),
  };
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
  assertAllowedKeys(body, new Set(['defaultSets', 'defaultReps']), 'settings');
  return {
    defaultSets: intValue(body.defaultSets, 'defaultSets', 1, 20),
    defaultReps: intValue(body.defaultReps, 'defaultReps', 1, 100),
  };
}

export function validateExercise(body, pathId) {
  assertObject(body, 'exercise');
  assertAllowedKeys(body, new Set(['id', 'name', 'muscleGroup', 'notes', 'personalBest']), 'exercise');
  requireMatchingId(body, pathId);
  const muscleGroup = stringValue(body.muscleGroup, 'muscleGroup', { max: 60 }) ?? 'Other';
  if (!MUSCLE_GROUPS.has(muscleGroup)) fail('muscleGroup is invalid');
  const exercise = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    muscleGroup,
  };
  const notes = stringValue(body.notes, 'notes', { max: 1000 });
  if (notes !== undefined) exercise.notes = notes;
  const best = personalBest(body.personalBest);
  if (best !== undefined) exercise.personalBest = best;
  return exercise;
}

export function validateTemplate(body, pathId) {
  assertObject(body, 'template');
  assertAllowedKeys(body, new Set(['id', 'name', 'description', 'exerciseItems']), 'template');
  requireMatchingId(body, pathId);
  const template = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    exerciseItems: exerciseItems(body.exerciseItems, 'exerciseItems'),
  };
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) template.description = description;
  return template;
}

export function validateLog(body, pathId) {
  assertObject(body, 'log');
  assertAllowedKeys(
    body,
    new Set(['id', 'name', 'date', 'notes', 'exerciseItems', 'startTime', 'endTime', 'status', 'hasPB', 'pbExerciseIds']),
    'log',
  );
  requireMatchingId(body, pathId);
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
