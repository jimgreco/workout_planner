import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ValidationError,
  validateExercise,
  validateLog,
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
      sets: [{ reps: '', weight: '', placeholderReps: '8' }],
    }],
  }, 'log-1');

  assert.equal(log.status, 'planning');
  assert.equal(log.exerciseItems[0].sets[0].placeholderReps, '8');
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
