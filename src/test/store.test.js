import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExercises, saveExercise, deleteExercise,
  getTemplates, saveTemplate, deleteTemplate,
  getLogs, saveLog, deleteLog, getLogsByDate,
} from '../store';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const UID = 'test-user-123';

beforeEach(() => {
  localStorageMock.clear();
});

// ── Exercises ──────────────────────────────────────────────────────────────────
describe('exercises', () => {
  it('returns empty array when no exercises stored', () => {
    expect(getExercises(UID)).toEqual([]);
  });

  it('saves a new exercise and assigns an id', () => {
    const result = saveExercise(UID, { name: 'Bench Press', muscleGroup: 'Chest', notes: '' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeDefined();
    expect(result[0].name).toBe('Bench Press');
  });

  it('saves multiple exercises', () => {
    saveExercise(UID, { name: 'Squat', muscleGroup: 'Quads', notes: '' });
    const result = saveExercise(UID, { name: 'Deadlift', muscleGroup: 'Back', notes: '' });
    expect(result).toHaveLength(2);
  });

  it('updates an existing exercise by id', () => {
    const [ex] = saveExercise(UID, { name: 'Curl', muscleGroup: 'Biceps', notes: '' });
    const updated = saveExercise(UID, { ...ex, name: 'Barbell Curl' });
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('Barbell Curl');
  });

  it('deletes an exercise by id', () => {
    const [ex] = saveExercise(UID, { name: 'Press', muscleGroup: 'Shoulders', notes: '' });
    const result = deleteExercise(UID, ex.id);
    expect(result).toHaveLength(0);
  });

  it('does not delete other exercises', () => {
    const [ex1] = saveExercise(UID, { name: 'A', muscleGroup: 'Core', notes: '' });
    saveExercise(UID, { name: 'B', muscleGroup: 'Core', notes: '' });
    const result = deleteExercise(UID, ex1.id);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('B');
  });

  it('keeps data isolated between different user IDs', () => {
    saveExercise('user-a', { name: 'Squat', muscleGroup: 'Quads', notes: '' });
    saveExercise('user-b', { name: 'Press', muscleGroup: 'Chest', notes: '' });
    expect(getExercises('user-a')).toHaveLength(1);
    expect(getExercises('user-a')[0].name).toBe('Squat');
    expect(getExercises('user-b')).toHaveLength(1);
    expect(getExercises('user-b')[0].name).toBe('Press');
  });
});

// ── Templates ──────────────────────────────────────────────────────────────────
describe('templates', () => {
  it('returns empty array when no templates stored', () => {
    expect(getTemplates(UID)).toEqual([]);
  });

  it('saves a new template with an id', () => {
    const result = saveTemplate(UID, { name: 'Push Day', description: '', exerciseItems: [] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeDefined();
    expect(result[0].name).toBe('Push Day');
  });

  it('updates an existing template', () => {
    const [t] = saveTemplate(UID, { name: 'Old Name', description: '', exerciseItems: [] });
    const updated = saveTemplate(UID, { ...t, name: 'New Name' });
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('New Name');
  });

  it('deletes a template by id', () => {
    const [t] = saveTemplate(UID, { name: 'Leg Day', description: '', exerciseItems: [] });
    const result = deleteTemplate(UID, t.id);
    expect(result).toHaveLength(0);
  });
});

// ── Workout Logs ───────────────────────────────────────────────────────────────
describe('workout logs', () => {
  it('returns empty array when no logs stored', () => {
    expect(getLogs(UID)).toEqual([]);
  });

  it('saves a new log with an id', () => {
    const result = saveLog(UID, { name: 'Monday Push', date: '2025-01-06', notes: '', exerciseItems: [] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeDefined();
    expect(result[0].date).toBe('2025-01-06');
  });

  it('saves multiple logs', () => {
    saveLog(UID, { name: 'A', date: '2025-01-01', notes: '', exerciseItems: [] });
    const result = saveLog(UID, { name: 'B', date: '2025-01-02', notes: '', exerciseItems: [] });
    expect(result).toHaveLength(2);
  });

  it('updates an existing log', () => {
    const [log] = saveLog(UID, { name: 'Old', date: '2025-01-01', notes: '', exerciseItems: [] });
    const updated = saveLog(UID, { ...log, name: 'Updated' });
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe('Updated');
  });

  it('deletes a log by id', () => {
    const [log] = saveLog(UID, { name: 'Workout', date: '2025-01-01', notes: '', exerciseItems: [] });
    const result = deleteLog(UID, log.id);
    expect(result).toHaveLength(0);
  });

  it('getLogsByDate returns only logs matching date', () => {
    saveLog(UID, { name: 'A', date: '2025-01-01', notes: '', exerciseItems: [] });
    saveLog(UID, { name: 'B', date: '2025-01-02', notes: '', exerciseItems: [] });
    saveLog(UID, { name: 'C', date: '2025-01-01', notes: '', exerciseItems: [] });
    const result = getLogsByDate(UID, '2025-01-01');
    expect(result).toHaveLength(2);
    expect(result.every((l) => l.date === '2025-01-01')).toBe(true);
  });

  it('getLogsByDate returns empty array for date with no logs', () => {
    saveLog(UID, { name: 'A', date: '2025-01-01', notes: '', exerciseItems: [] });
    expect(getLogsByDate(UID, '2025-12-31')).toEqual([]);
  });
});
