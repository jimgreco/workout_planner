import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Templates from '../pages/Templates.jsx';
import { saveLog, saveProgram, saveTemplate } from '../api.js';

vi.mock('../api.js', () => ({
  saveTemplate: vi.fn(async (template) => [template]),
  deleteTemplate: vi.fn(async () => []),
  saveProgram: vi.fn(async (program) => [program]),
  deleteProgram: vi.fn(async () => []),
  saveLog: vi.fn(async (log) => [log]),
  saveSettings: vi.fn(async (settings) => settings),
}));

const exercises = [
  { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' },
  { id: 'press', name: 'Overhead Press', muscleGroup: 'Shoulders' },
  { id: 'pushdown', name: 'Tricep Pushdown', muscleGroup: 'Triceps' },
  { id: 'pulldown', name: 'Lat Pulldown', muscleGroup: 'Back' },
  { id: 'row', name: 'Seated Cable Row', muscleGroup: 'Back' },
  { id: 'curl', name: 'Dumbbell Curl', muscleGroup: 'Biceps' },
  { id: 'squat', name: 'Barbell Squat', muscleGroup: 'Quads' },
  { id: 'rdl', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings' },
  { id: 'calf', name: 'Standing Calf Raise', muscleGroup: 'Calves' },
];

function todayKey() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

describe('Routines page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates starter routines from the exercise library', async () => {
    const onUpdate = vi.fn();
    render(
      <Templates
        templates={[]}
        exercises={exercises}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={onUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add starter routines/i }));

    await waitFor(() => expect(saveTemplate).toHaveBeenCalledTimes(3));
    expect(saveTemplate.mock.calls[0][0]).toMatchObject({
      name: 'Push Starter',
      exerciseItems: [
        { exerciseId: 'bench', sets: [{ reps: '10', weight: '' }, { reps: '10', weight: '' }, { reps: '10', weight: '' }] },
        { exerciseId: 'press' },
        { exerciseId: 'pushdown' },
      ],
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('saves a structured program progression rule', async () => {
    const onProgramsUpdate = vi.fn();
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={onProgramsUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /new program/i }));
    fireEvent.change(screen.getByPlaceholderText(/3 day strength/i), { target: { value: 'Strength Block' } });
    fireEvent.change(screen.getByLabelText(/progression rule/i), { target: { value: 'linear_weight' } });
    fireEvent.change(screen.getByLabelText(/weight increment/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/deload rule/i), { target: { value: 'every_n_weeks' } });
    fireEvent.change(screen.getByLabelText(/deload every weeks/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/deload load percent/i), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/deload rep percent/i), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText(/deload start date/i), { target: { value: '2026-05-25' } });
    fireEvent.click(screen.getByRole('button', { name: /create program/i }));

    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveProgram.mock.calls[0][0]).toMatchObject({
      name: 'Strength Block',
      progression: { type: 'linear_weight', weightIncrement: 10 },
      deload: { type: 'every_n_weeks', everyWeeks: 5, loadPercent: 80, repPercent: 90, startDate: '2026-05-25' },
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('marks the next planned workout as skipped', async () => {
    const onLogsChanged = vi.fn();
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[]}
        programs={[{ id: 'program-1', name: 'Strength Plan', active: true, schedule: [{ weekday: new Date().getDay(), templateId: 'tmpl-1' }] }]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={() => {}}
        onLogsChanged={onLogsChanged}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0]).toMatchObject({
      name: 'Push Day',
      status: 'skipped',
      exerciseItems: [],
    });
    expect(onLogsChanged).toHaveBeenCalled();
  });

  it('shows active program adherence beyond the current week', () => {
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[{ id: 'log-1', name: 'Push Day', date: todayKey(), status: 'finished', exerciseItems: [] }]}
        programs={[{ id: 'program-1', name: 'Strength Plan', active: true, schedule: [{ weekday: new Date().getDay(), templateId: 'tmpl-1' }] }]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={() => {}}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    expect(screen.getByLabelText(/4 week program adherence/i)).toBeTruthy();
    expect(screen.getByText(/4-week completion/i)).toBeTruthy();
  });
});
