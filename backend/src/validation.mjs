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
const WEIGHT_TYPES = new Set(['weight', 'double', 'none']);
const SET_TYPES = new Set(['warmup', 'working', 'drop', 'failure']);
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
  assertAllowedKeys(value, new Set(['weight', 'date']), 'personalBest');
  const weight = stringValue(value.weight, 'personalBest.weight', { required: true, max: 32, allowEmpty: false });
  const date = dateValue(value.date, 'personalBest.date');
  return date ? { weight, date } : { weight };
}

function workoutSet(value, index) {
  assertObject(value, `set ${index + 1}`);
  assertAllowedKeys(
    value,
    new Set(['reps', 'weight', 'placeholderReps', 'placeholderWeight', 'restStartTime', 'restDuration', 'rpe', 'rir', 'setType']),
    `set ${index + 1}`,
  );
  const set = {};
  for (const field of ['reps', 'weight', 'placeholderReps', 'placeholderWeight']) {
    const str = stringValue(value[field], `set.${field}`, { max: 64 });
    if (str !== undefined) set[field] = str;
  }
  for (const field of ['rpe', 'rir']) {
    const str = stringValue(value[field], `set.${field}`, { max: 8 });
    if (str !== undefined) set[field] = str;
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
  return set;
}

function exerciseItem(value, index) {
  assertObject(value, `exerciseItems[${index}]`);
  assertAllowedKeys(value, new Set(['exerciseId', 'weightType', 'sets', 'restTargetSeconds']), `exerciseItems[${index}]`);
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
  const restTargetSeconds = optionalIntValue(value.restTargetSeconds, `exerciseItems[${index}].restTargetSeconds`, 0, 3600);
  if (restTargetSeconds > 0) item.restTargetSeconds = restTargetSeconds;
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
  assertAllowedKeys(body, new Set(['defaultSets', 'defaultReps']), 'settings');
  return {
    defaultSets: intValue(body.defaultSets, 'defaultSets', 1, 20),
    defaultReps: intValue(body.defaultReps, 'defaultReps', 1, 100),
  };
}

export function validateExercise(body, pathId) {
  assertObject(body, 'exercise');
  assertAllowedKeys(body, new Set(['id', 'name', 'muscleGroup', 'notes', 'personalBest', 'updatedAt', 'revision', 'expectedRevision']), 'exercise');
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
  const best = personalBest(body.personalBest);
  if (best !== undefined) exercise.personalBest = best;
  return exercise;
}

export function validateTemplate(body, pathId) {
  assertObject(body, 'template');
  assertAllowedKeys(body, new Set(['id', 'name', 'description', 'exerciseItems', 'updatedAt', 'revision', 'expectedRevision']), 'template');
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const template = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    exerciseItems: exerciseItems(body.exerciseItems, 'exerciseItems'),
  };
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) template.description = description;
  return template;
}

function programScheduleItem(value, index) {
  assertObject(value, `schedule[${index}]`);
  assertAllowedKeys(value, new Set(['weekday', 'templateId', 'notes']), `schedule[${index}]`);
  const item = {
    weekday: weekdayValue(value.weekday, `schedule[${index}].weekday`),
    templateId: validateId(value.templateId, `schedule[${index}].templateId`),
  };
  const notes = stringValue(value.notes, `schedule[${index}].notes`, { max: 500 });
  if (notes !== undefined) item.notes = notes;
  return item;
}

function programSchedule(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 70) fail('schedule must contain at most 70 items');
  const seen = new Set();
  return value.map((item, index) => {
    const scheduleItem = programScheduleItem(item, index);
    const key = `${scheduleItem.weekday}:${scheduleItem.templateId}`;
    if (seen.has(key)) fail('schedule can contain each routine once per weekday');
    seen.add(key);
    return scheduleItem;
  }).sort((a, b) => a.weekday - b.weekday);
}

export function validateProgram(body, pathId) {
  assertObject(body, 'program');
  assertAllowedKeys(
    body,
    new Set(['id', 'name', 'description', 'schedule', 'active', 'progressionRule', 'updatedAt', 'revision', 'expectedRevision']),
    'program',
  );
  requireMatchingId(body, pathId);
  optionalRevision(body.expectedRevision, 'expectedRevision');
  const program = {
    id: pathId,
    name: stringValue(body.name, 'name', { required: true, max: 120, allowEmpty: false }),
    schedule: programSchedule(body.schedule),
  };
  const description = stringValue(body.description, 'description', { max: 1000 });
  if (description !== undefined) program.description = description;
  const active = boolValue(body.active, 'active');
  if (active !== undefined) program.active = active;
  const progressionRule = stringValue(body.progressionRule, 'progressionRule', { max: 1000 });
  if (progressionRule !== undefined) program.progressionRule = progressionRule;
  return program;
}

export function validateLog(body, pathId) {
  assertObject(body, 'log');
  assertAllowedKeys(
    body,
    new Set(['id', 'name', 'date', 'notes', 'exerciseItems', 'startTime', 'endTime', 'status', 'hasPB', 'pbExerciseIds', 'updatedAt', 'revision', 'expectedRevision']),
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
    new Set(['exportedAt', 'exercises', 'templates', 'logs', 'programs', 'settings', 'feedback']),
    'data',
  );

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

  return { mode, exercises, templates, logs, programs, settings };
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
