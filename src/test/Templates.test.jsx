import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Templates from '../pages/Templates.jsx';
import { saveExercise, saveLog, saveProgram, saveTemplate } from '../api.js';

vi.mock('../api.js', () => ({
  saveTemplate: vi.fn(async (template) => [template]),
  deleteTemplate: vi.fn(async () => []),
  saveProgram: vi.fn(async (program) => [program]),
  deleteProgram: vi.fn(async () => []),
  saveLog: vi.fn(async (log) => [log]),
  saveExercise: vi.fn(async (exercise) => [exercise]),
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

function dayKey(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function cycleDay(id, templateId = '') {
  return templateId ? { id, templateId } : { id };
}

function buildProgram(schedule, overrides = {}) {
  return {
    id: 'program-1',
    name: 'Strength Plan',
    active: true,
    schedule,
    startDate: todayKey(),
    insertedRestDays: [],
    ...overrides,
  };
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
        logs={[{
          id: 'log-1',
          date: '2026-01-01',
          status: 'finished',
          exerciseItems: [{ exerciseId: 'bench', weightType: 'bar_double', sets: [{ reps: '8', weight: '45' }] }],
        }]}
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
        { exerciseId: 'bench', weightType: 'bar_double', sets: [{ reps: '10', weight: '' }, { reps: '10', weight: '' }, { reps: '10', weight: '' }] },
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
    expect(screen.getByText(/days: 1/i)).toBeTruthy();
    fireEvent.click(screen.getByTitle(/add cycle day/i));
    expect(screen.getByText(/days: 2/i)).toBeTruthy();
    fireEvent.click(screen.getByTitle(/remove cycle day/i));
    expect(screen.getByText(/days: 1/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/day 1 routine/i), { target: { value: 'tmpl-1' } });
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
      startDate: todayKey(),
      schedule: [expect.objectContaining({ templateId: 'tmpl-1' })],
      progression: { type: 'linear_weight', weightIncrement: 10 },
      deload: { type: 'every_n_weeks', everyWeeks: 5, loadPercent: 80, repPercent: 90, startDate: '2026-05-25' },
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('marks routine exercises that should increase weight next time', () => {
    render(
      <Templates
        mode="routines"
        templates={[{
          id: 'tmpl-1',
          name: 'Push Day',
          description: '',
          exerciseItems: [{
            exerciseId: 'bench',
            weightType: 'weight',
            sets: [{ placeholderReps: '8-12' }, { placeholderReps: '8-12' }],
          }],
        }]}
        exercises={exercises}
        logs={[{
          id: 'log-1',
          name: 'Push Day',
          date: '2026-05-20',
          status: 'finished',
          exerciseItems: [{
            exerciseId: 'bench',
            weightType: 'weight',
            sets: [{ reps: '10', weight: '100' }, { reps: '12', weight: '100' }],
          }],
        }]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    expect(screen.getByLabelText(/bench press: increase weight next time/i)).toBeInTheDocument();
  });

  it('marks the next planned workout as skipped', async () => {
    const onLogsChanged = vi.fn();
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([cycleDay('day-1', 'tmpl-1')])]}
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
    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0]).toMatchObject({
      name: 'Push Day',
      status: 'skipped',
      exerciseItems: [],
    });
    expect(saveProgram.mock.calls[0][0].activity[0]).toMatchObject({
      type: 'skip',
      title: 'Skipped Push Day',
    });
    expect(onLogsChanged).toHaveBeenCalled();
  });

  it('starts the next workout with active program context', () => {
    const onStartWorkout = vi.fn();
    const program = buildProgram([cycleDay('day-1', 'tmpl-1')], {
      progression: { type: 'double_progression', minReps: 8, maxReps: 12 },
    });
    const template = { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] };
    render(
      <Templates
        mode="programs"
        templates={[template]}
        exercises={exercises}
        logs={[]}
        programs={[program]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={() => {}}
        onSettingsUpdate={() => {}}
        onStartWorkout={onStartWorkout}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(onStartWorkout).toHaveBeenCalledWith(template, program);
  });

  it('sets a cycle day to rest', async () => {
    const onProgramsUpdate = vi.fn();
    render(
      <Templates
        templates={[
          { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] },
        ]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([cycleDay('day-1', 'tmpl-1')])]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={onProgramsUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /manage .*push day/i }));
    fireEvent.change(screen.getByLabelText(/routine/i), { target: { value: '' } });

    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveProgram.mock.calls[0][0]).toMatchObject({
      id: 'program-1',
      schedule: [expect.objectContaining({ id: 'day-1' })],
    });
    expect(saveProgram.mock.calls[0][0].activity[0]).toMatchObject({
      type: 'schedule_edit',
      title: 'Set Day 1 as rest',
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('swaps two scheduled program days', async () => {
    const onProgramsUpdate = vi.fn();
    render(
      <Templates
        templates={[
          { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] },
          { id: 'tmpl-2', name: 'Pull Day', description: '', exerciseItems: [] },
        ]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([
          cycleDay('day-1', 'tmpl-1'),
          cycleDay('day-2', 'tmpl-2'),
        ])]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={onProgramsUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /manage .*push day/i }));
    fireEvent.click(screen.getByRole('button', { name: /swap with day 2: pull day/i }));

    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveProgram.mock.calls[0][0].schedule.map((item) => item.id)).toEqual(['day-2', 'day-1']);
    expect(saveProgram.mock.calls[0][0].activity[0]).toMatchObject({
      type: 'swap',
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('shows active program adherence beyond the current week', () => {
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[{ id: 'log-1', name: 'Push Day', date: todayKey(), status: 'finished', exerciseItems: [] }]}
        programs={[buildProgram([cycleDay('day-1', 'tmpl-1')])]}
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

  it('shows the upcoming active program schedule', () => {
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([cycleDay('day-1', 'tmpl-1'), cycleDay('day-2')])]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={() => {}}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    expect(screen.getByLabelText(/upcoming program schedule/i)).toBeTruthy();
    expect(screen.getByText(/upcoming/i)).toBeTruthy();
    expect(screen.getByText(/next 3 weeks/i)).toBeTruthy();
    expect(screen.getAllByText(/push day/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/rest/i).length).toBeGreaterThan(0);
  });

  it('inserts a rest day and stores it as a schedule pushback', async () => {
    const onProgramsUpdate = vi.fn();
    render(
      <Templates
        mode="programs"
        templates={[
          { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] },
          { id: 'tmpl-2', name: 'Pull Day', description: '', exerciseItems: [] },
        ]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([
          cycleDay('day-1', 'tmpl-1'),
          cycleDay('day-2', 'tmpl-2'),
        ])]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={onProgramsUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /insert rest day on today/i }));

    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveProgram.mock.calls[0][0].insertedRestDays).toEqual([dayKey(0)]);
    expect(saveProgram.mock.calls[0][0].activity[0]).toMatchObject({
      type: 'rest_insert',
      title: 'Inserted rest day',
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('removes an inserted rest day and pulls the schedule forward', async () => {
    const onProgramsUpdate = vi.fn();
    render(
      <Templates
        mode="programs"
        templates={[
          { id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] },
          { id: 'tmpl-2', name: 'Pull Day', description: '', exerciseItems: [] },
        ]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([
          cycleDay('day-1', 'tmpl-1'),
          cycleDay('day-2', 'tmpl-2'),
        ], {
          insertedRestDays: [dayKey(0)],
        })]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={onProgramsUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /remove inserted rest day on today/i }));

    await waitFor(() => expect(saveProgram).toHaveBeenCalledOnce());
    expect(saveProgram.mock.calls[0][0].insertedRestDays).toEqual([]);
    expect(saveProgram.mock.calls[0][0].activity[0]).toMatchObject({
      type: 'rest_remove',
      title: 'Removed inserted rest day',
    });
    expect(onProgramsUpdate).toHaveBeenCalled();
  });

  it('shows recent program activity', () => {
    render(
      <Templates
        templates={[{ id: 'tmpl-1', name: 'Push Day', description: '', exerciseItems: [] }]}
        exercises={exercises}
        logs={[]}
        programs={[buildProgram([cycleDay('day-1', 'tmpl-1')], {
          activity: [{ id: 'activity-1', type: 'delay', title: 'Delayed schedule', detail: 'Push Day moved later', date: '2026-05-26T12:00:00.000Z' }],
        })]}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onProgramsUpdate={() => {}}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    expect(screen.getByLabelText(/program activity/i)).toBeTruthy();
    expect(screen.getByText(/delayed schedule/i)).toBeTruthy();
    expect(screen.getByText(/push day moved later/i)).toBeTruthy();
  });

  it('opens new exercise from the program add menu', async () => {
    const onExercisesUpdate = vi.fn();
    render(
      <Templates
        templates={[]}
        exercises={exercises}
        settings={{ defaultSets: 3, defaultReps: 10 }}
        onUpdate={() => {}}
        onExercisesUpdate={onExercisesUpdate}
        onSettingsUpdate={() => {}}
        onStartWorkout={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /new exercise/i }));
    fireEvent.change(screen.getByPlaceholderText(/bench press/i), { target: { value: 'Incline Press' } });
    fireEvent.click(screen.getAllByRole('button', { name: /add exercise/i }).at(-1));

    await waitFor(() => expect(saveExercise).toHaveBeenCalledOnce());
    expect(saveExercise.mock.calls[0][0]).toMatchObject({ name: 'Incline Press' });
    expect(onExercisesUpdate).toHaveBeenCalled();
  });
});
