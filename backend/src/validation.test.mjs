import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ValidationError,
  validateExercise,
  validateLog,
  validateProgram,
  validateSettings,
  validateTemplate,
} from './validation.mjs';

test('sanitizes valid exercise payloads', () => {
  assert.deepEqual(
    validateExercise({
      id: 'ex-1',
      name: 'Bench Press',
      muscleGroup: 'Chest',
      notes: '',
      usesTime: true,
      personalBest: { weight: '225', reps: '5', date: '2026-05-21' },
    }, 'ex-1'),
    {
      id: 'ex-1',
      name: 'Bench Press',
      muscleGroup: 'Chest',
      notes: '',
      usesTime: true,
      personalBest: { weight: '225', reps: '5', date: '2026-05-21' },
    },
  );
});

test('rejects unsupported exercise fields', () => {
  assert.throws(
    () => validateExercise({ id: 'ex-1', name: 'Bench', muscleGroup: 'Chest', admin: true }, 'ex-1'),
    ValidationError,
  );
});

test('validates nested workout log limits and statuses', () => {
  const log = validateLog({
    id: 'log-1',
    name: '',
    date: '2026-05-21',
    readiness: 4,
    status: 'planning',
    exerciseItems: [{
      exerciseId: 'ex-1',
      weightType: 'bar_double',
      restTargetSeconds: 90,
      supersetGroup: 'A',
      description: 'Keep elbows tucked',
      useIndividualReps: true,
      sets: [{ reps: '', repsLeft: '8', repsRight: '8', weight: '', placeholderReps: '8', placeholderRepsLeft: '8', placeholderRepsRight: '8', placeholderWeight: '135', placeholderWeightType: 'weight', restTargetSeconds: 120, rpe: '8.5', rir: '2', setType: 'warmup' }],
    }],
  }, 'log-1');

  assert.equal(log.status, 'planning');
  assert.equal(log.readiness, 4);
  assert.equal(log.exerciseItems[0].weightType, 'bar_double');
  assert.equal(log.exerciseItems[0].restTargetSeconds, 90);
  assert.equal(log.exerciseItems[0].supersetGroup, 'A');
  assert.equal(log.exerciseItems[0].description, 'Keep elbows tucked');
  assert.equal(log.exerciseItems[0].useIndividualReps, true);
  assert.equal(log.exerciseItems[0].sets[0].placeholderReps, '8');
  assert.equal(log.exerciseItems[0].sets[0].repsLeft, '8');
  assert.equal(log.exerciseItems[0].sets[0].placeholderRepsLeft, '8');
  assert.equal(log.exerciseItems[0].sets[0].placeholderWeightType, 'weight');
  assert.equal(log.exerciseItems[0].sets[0].restTargetSeconds, 120);
  assert.equal(log.exerciseItems[0].sets[0].rpe, '8.5');
  assert.equal(log.exerciseItems[0].sets[0].rir, '2');
  assert.equal(log.exerciseItems[0].sets[0].setType, 'warmup');
  assert.throws(
    () => validateLog({ ...log, status: 'deleted' }, 'log-1'),
    ValidationError,
  );
  assert.throws(
    () => validateLog({
      ...log,
      exerciseItems: [{ ...log.exerciseItems[0], sets: [{ ...log.exerciseItems[0].sets[0], placeholderWeightType: 'kettlebells' }] }],
    }, 'log-1'),
    ValidationError,
  );
});

test('validates template and settings boundaries', () => {
  assert.equal(validateTemplate({ id: 't-1', name: 'Push', exerciseItems: [] }, 't-1').name, 'Push');
  assert.deepEqual(
    validateSettings({ defaultSets: 4, defaultReps: 8, defaultRestTargetSeconds: 90, advancedMode: true }),
    { defaultSets: 4, defaultReps: 8, defaultRestTargetSeconds: 90, advancedMode: true },
  );
  assert.equal(validateSettings({ defaultSets: 4, defaultReps: 8 }).advancedMode, false);
  assert.throws(() => validateSettings({ defaultSets: 0, defaultReps: 8 }), ValidationError);
});

test('allows skipped workout logs', () => {
  const log = validateLog({
    id: 'skip-1',
    name: 'Push',
    date: '2026-05-25',
    status: 'skipped',
    notes: 'Travel day',
    exerciseItems: [],
  }, 'skip-1');

  assert.equal(log.status, 'skipped');
  assert.equal(log.notes, 'Travel day');
});

test('validates program weekly schedules', () => {
  const program = validateProgram({
    id: 'program-1',
    name: 'Strength Plan',
    active: true,
    progression: { type: 'double_progression', minReps: 8, maxReps: 12, repIncrement: 1, weightIncrement: 5 },
    deload: { type: 'every_n_weeks', everyWeeks: 4, loadPercent: 85, repPercent: 100, startDate: '2026-05-25' },
    activity: [
      { id: 'activity-1', type: 'delay', date: '2026-05-26T12:00:00.000Z', title: 'Delayed schedule', detail: 'Moved Push Day to Tuesday' },
    ],
    schedule: [
      { weekday: 5, templateId: 'legs' },
      { weekday: 1, templateId: 'push', notes: 'Heavy' },
      { weekday: 1, templateId: 'pull' },
    ],
    timeline: [
      { date: '2026-06-23', templateId: 'legs' },
      { date: '2026-06-21' },
      { date: '2026-06-21', templateId: 'push' },
    ],
  }, 'program-1');

  assert.deepEqual(program.schedule.map((item) => `${item.weekday}:${item.templateId}`), ['1:push', '5:legs']);
  assert.deepEqual(program.timeline, [
    { date: '2026-06-21' },
    { date: '2026-06-23', templateId: 'legs' },
  ]);
  assert.equal(program.active, true);
  assert.deepEqual(program.progression, { type: 'double_progression', minReps: 8, maxReps: 12, repIncrement: 1, weightIncrement: 5 });
  assert.deepEqual(program.deload, { type: 'every_n_weeks', everyWeeks: 4, loadPercent: 85, repPercent: 100, startDate: '2026-05-25' });
  assert.deepEqual(program.activity, [
    { id: 'activity-1', type: 'delay', date: '2026-05-26T12:00:00.000Z', title: 'Delayed schedule', detail: 'Moved Push Day to Tuesday' },
  ]);
  assert.deepEqual(
    validateProgram({ id: 'program-1', name: 'Backcompat', schedule: [{ weekday: 1, templateId: 'push' }, { weekday: 1, templateId: 'pull' }] }, 'program-1').schedule,
    [{ weekday: 1, templateId: 'push' }],
  );
  assert.throws(
    () => validateProgram({ id: 'program-1', name: 'Bad', progression: { type: 'double_progression', minReps: 12, maxReps: 8 }, schedule: [] }, 'program-1'),
    ValidationError,
  );
  assert.throws(
    () => validateProgram({ id: 'program-1', name: 'Bad', deload: { type: 'every_n_weeks', everyWeeks: 1, startDate: '2026-05-25' }, schedule: [] }, 'program-1'),
    ValidationError,
  );
  assert.throws(
    () => validateProgram({ id: 'program-1', name: 'Bad', schedule: [], timeline: [{ date: 'tomorrow' }] }, 'program-1'),
    ValidationError,
  );
});
