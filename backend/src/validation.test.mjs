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
      personalBest: { weight: '225', date: '2026-05-21' },
    }, 'ex-1'),
    {
      id: 'ex-1',
      name: 'Bench Press',
      muscleGroup: 'Chest',
      notes: '',
      personalBest: { weight: '225', date: '2026-05-21' },
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
    status: 'planning',
    exerciseItems: [{
      exerciseId: 'ex-1',
      weightType: 'double',
      restTargetSeconds: 90,
      supersetGroup: 'A',
      sets: [{ reps: '', weight: '', placeholderReps: '8', rpe: '8.5', rir: '2', setType: 'warmup' }],
    }],
  }, 'log-1');

  assert.equal(log.status, 'planning');
  assert.equal(log.exerciseItems[0].restTargetSeconds, 90);
  assert.equal(log.exerciseItems[0].supersetGroup, 'A');
  assert.equal(log.exerciseItems[0].sets[0].placeholderReps, '8');
  assert.equal(log.exerciseItems[0].sets[0].rpe, '8.5');
  assert.equal(log.exerciseItems[0].sets[0].rir, '2');
  assert.equal(log.exerciseItems[0].sets[0].setType, 'warmup');
  assert.throws(
    () => validateLog({ ...log, status: 'deleted' }, 'log-1'),
    ValidationError,
  );
});

test('validates template and settings boundaries', () => {
  assert.equal(validateTemplate({ id: 't-1', name: 'Push', exerciseItems: [] }, 't-1').name, 'Push');
  assert.deepEqual(validateSettings({ defaultSets: 4, defaultReps: 8 }), { defaultSets: 4, defaultReps: 8 });
  assert.throws(() => validateSettings({ defaultSets: 0, defaultReps: 8 }), ValidationError);
});

test('validates program weekly schedules', () => {
  const program = validateProgram({
    id: 'program-1',
    name: 'Strength Plan',
    active: true,
    schedule: [
      { weekday: 5, templateId: 'legs' },
      { weekday: 1, templateId: 'push', notes: 'Heavy' },
      { weekday: 1, templateId: 'pull' },
    ],
  }, 'program-1');

  assert.deepEqual(program.schedule.map((item) => `${item.weekday}:${item.templateId}`), ['1:push', '1:pull', '5:legs']);
  assert.equal(program.active, true);
  assert.throws(
    () => validateProgram({ id: 'program-1', name: 'Bad', schedule: [{ weekday: 1, templateId: 'push' }, { weekday: 1, templateId: 'push' }] }, 'program-1'),
    ValidationError,
  );
});
