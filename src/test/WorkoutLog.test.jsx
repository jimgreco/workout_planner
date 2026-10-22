import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog, saveExercise } from '../api.js';
import { isWorkingSet } from '../setEvidence.js';

vi.mock('../api.js', () => ({
  getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []),
  getTemplates: vi.fn(() => []),
  getExercises: vi.fn(() => []),
  saveLog: vi.fn(async (log) => [log]),
  deleteLog: vi.fn(async () => []),
  saveExercise: vi.fn(async (exercise) => [exercise]),
}));

const exercises = [
  { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' },
];

const templates = [
  {
    id: 'tmpl-1',
    name: 'Push Day',
    description: '',
    exerciseItems: [
      { exerciseId: 'bench', weightType: 'weight', targetRIR: 2, sets: [{ reps: '8', weight: '' }] },
    ],
  },
];

const settings = { defaultSets: 3, defaultReps: 10, defaultRestTargetSeconds: 0 };

function todayKey() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function buildProgram(overrides = {}) {
  return {
    id: 'program-1',
    name: 'Strength Plan',
    active: true,
    schedule: [{ id: 'day-1', templateId: 'tmpl-1' }],
    startDate: todayKey(),
    insertedRestDays: [],
    ...overrides,
  };
}

describe('WorkoutLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a repeated active set as unrecorded and restores that state when resumed', async () => {
    const active = { id: 'active-repeat', name: 'Repeat fixture', date: todayKey(), status: 'active', startTime: Date.now() - 60000,
      exerciseItems: [{ exerciseId: 'bench', targetRIR: 2, sets: [
        { reps: '8', weight: '100', completion: 'recorded', restDuration: 60, rir: '0' },
        { reps: '', weight: '', completion: 'unrecorded' },
      ] }] };
    const props = { exercises, templates: [], programs: [], settings, onLogsChanged: () => {}, onExercisesChanged: () => {} };
    const view = render(<WorkoutLog {...props} logs={[active]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat last set for Bench Press' }));
    await waitFor(() => expect(saveLog).toHaveBeenCalled());
    const persisted = saveLog.mock.lastCall[0];
    expect(persisted.status).toBe('active');
    expect(persisted.exerciseItems[0].sets[1]).toMatchObject({ reps: '8', weight: '100', completion: 'unrecorded', rir: null, restStartTime: null });
    expect(persisted.exerciseItems[0].sets.filter(isWorkingSet)).toHaveLength(1);
    view.unmount();
    render(<WorkoutLog {...props} logs={[JSON.parse(JSON.stringify(persisted))]} />);
    expect(screen.getByLabelText('Status for set 2 of Bench Press')).toHaveValue('unrecorded');
    expect(screen.getByLabelText('Weight for set 2 of Bench Press')).toHaveValue(100);
    expect(screen.getByRole('button', { name: 'Repeat last set for Bench Press' })).toBeEnabled();
  });

  it('does not offer repeat while editing a finished workout', () => {
    const log = { id: 'finished-repeat', name: 'History', date: todayKey(), status: 'finished', startTime: Date.now() - 60000,
      exerciseItems: [{ exerciseId: 'bench', sets: [{ reps: '8', weight: '100', completion: 'recorded' }, { reps: '', completion: 'unrecorded' }] }] };
    render(<WorkoutLog exercises={exercises} templates={[]} logs={[log]} settings={settings} editingLog={log}
      onLogsChanged={() => {}} onExercisesChanged={() => {}} onClearEditing={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Repeat last set for Bench Press' })).not.toBeInTheDocument();
  });

  it('does not invent completed sets when adding an exercise to workout history', async () => {
    const saved = { id: 'finished', name: 'Yesterday', date: '2026-10-11', status: 'finished',
      startTime: 1791720000000, endTime: 1791723600000,
      exerciseItems: [{ exerciseId: 'bench', sets: [{ reps: '8', weight: '100', completion: 'recorded' }] }] };
    render(<WorkoutLog exercises={[...exercises, { id: 'row', name: 'Single Arm Row', muscleGroup: 'Back', isUnilateral: true }]}
      templates={[]} logs={[saved]} programs={[]} editingLog={saved} settings={settings}
      onLogsChanged={() => {}} onExercisesChanged={() => {}} onClearEditing={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Search exercises to add…'), { target: { value: 'Single Arm Row (Back)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(saveLog).toHaveBeenCalled());
    const result = saveLog.mock.calls.at(-1)[0];
    expect(result.status).toBe('finished');
    expect(result.exerciseItems[0]).toEqual(saved.exerciseItems[0]);
    expect(result.exerciseItems[1].sets).toHaveLength(3);
    for (const set of result.exerciseItems[1].sets) {
      expect(set).toMatchObject({ reps: '10', repsLeft: '10', repsRight: '10', completion: 'unrecorded' });
      expect(isWorkingSet(set)).toBe(false);
    }
  });

  it.each([
    ['America/New_York', '2026-10-13T01:30:00Z', '2026-10-12'],
    ['Pacific/Auckland', '2026-10-12T11:30:00Z', '2026-10-13'],
  ])('dates new workouts by the local calendar in %s', async (timezone, now, expectedDay) => {
    vi.stubEnv('TZ', timezone);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    try {
      const { container } = render(<WorkoutLog exercises={exercises} templates={templates}
        initialTemplate={templates[0]} logs={[]} programs={[]} settings={settings}
        onLogsChanged={() => {}} onExercisesChanged={() => {}} onClearTemplate={() => {}} />);
      await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
      expect(container.querySelector('input[type="date"]')).toHaveValue(expectedDay);
      expect(saveLog.mock.calls[0][0].date).toBe(expectedDay);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it('starts planning from an active program workout', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        logs={[]}
        programs={[buildProgram()]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/readiness/i), { target: { value: '4' } });
    const option = screen.getByRole('option', { name: /strength plan/i });
    fireEvent.change(option.closest('select'), { target: { value: 'program-1:tmpl-1' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0]).toMatchObject({
      name: 'Push Day',
      status: 'planning',
      readiness: 4,
      exerciseItems: [{ exerciseId: 'bench', targetRIR: 2 }],
    });
    expect(screen.getAllByText('Bench Press')[0]).toBeInTheDocument();
  });

  it('applies program progression when starting an active program workout', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        logs={[{
          id: 'last-log',
          name: 'Push Day',
          date: '2026-05-20',
          status: 'finished',
          exerciseItems: [
            { exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '12', weight: '100' }] },
          ],
        }]}
        programs={[buildProgram({
          progression: { type: 'double_progression', minReps: 8, maxReps: 12, repIncrement: 1, weightIncrement: 5 },
        })]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
      />,
    );

    const option = screen.getByRole('option', { name: /strength plan/i });
    fireEvent.change(option.closest('select'), { target: { value: 'program-1:tmpl-1' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].targetRIR).toBe(2);
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '12 (8-12)',
      placeholderWeight: '105',
    });
  });

  it('preserves program rep range when launched from the program page', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        initialTemplate={templates[0]}
        initialProgram={buildProgram({
          progression: { type: 'double_progression', minReps: 8, maxReps: 12, repIncrement: 1, weightIncrement: 5 },
        })}
        logs={[{
          id: 'last-log',
          name: 'Push Day',
          date: '2026-05-20',
          status: 'finished',
          exerciseItems: [
            { exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '12', weight: '100' }] },
          ],
        }]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
        onClearTemplate={() => {}}
      />,
    );

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '12 (8-12)',
      placeholderWeight: '105',
    });
    expect(screen.getByLabelText(/min reps/i)).toHaveValue('8');
    expect(screen.getByLabelText(/max reps/i)).toHaveValue('12');
  });

  it('preserves a routine rep range when launched into planning', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        initialTemplate={{
          id: 'tmpl-range',
          name: 'Range Day',
          description: '',
          exerciseItems: [
            {
              exerciseId: 'bench',
              weightType: 'weight',
              useIndividualReps: false,
              sets: [{ reps: '8', placeholderReps: '8-12', weight: '' }],
            },
          ],
        }}
        logs={[]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
        onClearTemplate={() => {}}
      />,
    );

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '8-12',
    });
    expect(screen.getByLabelText(/min reps/i)).toHaveValue('8');
    expect(screen.getByLabelText(/max reps/i)).toHaveValue('12');
  });

  it('uses the last logged load setting when repeating an exercise', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        initialTemplate={{
          id: 'tmpl-load',
          name: 'Repeat Load Day',
          description: '',
          exerciseItems: [
            {
              exerciseId: 'bench',
              weightType: 'weight',
              sets: [{ reps: '8', weight: '' }],
            },
          ],
        }}
        logs={[{
          id: 'last-log',
          name: 'Push Day',
          date: '2026-05-20',
          status: 'finished',
          exerciseItems: [
            { exerciseId: 'bench', weightType: 'bar_double', sets: [{ reps: '8', weight: '55' }] },
          ],
        }]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
        onClearTemplate={() => {}}
      />,
    );

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0]).toMatchObject({
      weightType: 'bar_double',
      sets: [expect.objectContaining({
        placeholderWeight: '55',
        placeholderWeightType: 'bar_double',
      })],
    });
  });

  it('edits an exercise from the workout planning screen', async () => {
    const onExercisesChanged = vi.fn();
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        initialTemplate={templates[0]}
        logs={[]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={onExercisesChanged}
        onClearTemplate={() => {}}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit exercise/i }));
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. bench press/i), { target: { value: 'Barbell Bench Press' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(saveExercise).toHaveBeenCalledWith(expect.objectContaining({
      id: 'bench',
      name: 'Barbell Bench Press',
    })));
    expect(onExercisesChanged).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'bench', name: 'Barbell Bench Press' }),
    ]));
  });

  it('uses a shared unilateral routine target when planning a workout', async () => {
    render(
      <WorkoutLog
        exercises={[{ id: 'curl', name: 'Dumbbell Curl', muscleGroup: 'Biceps', isUnilateral: true }]}
        templates={[{
          id: 'tmpl-curl',
          name: 'Arm Day',
          description: '',
          exerciseItems: [{
            exerciseId: 'curl',
            weightType: 'weight',
            sets: [{ reps: '6', placeholderReps: '10', placeholderRepsLeft: '8', placeholderRepsRight: '9', weight: '' }],
          }],
        }]}
        logs={[]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
      />,
    );

    const option = screen.getByRole('option', { name: /arm day/i });
    fireEvent.change(option.closest('select'), { target: { value: 'tmpl-curl' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '10',
      placeholderRepsLeft: '10',
      placeholderRepsRight: '10',
    });
  });

  it('uses legacy unilateral side targets before stale routine reps', async () => {
    render(
      <WorkoutLog
        exercises={[{ id: 'curl', name: 'Dumbbell Curl', muscleGroup: 'Biceps', isUnilateral: true }]}
        templates={[{
          id: 'tmpl-curl',
          name: 'Arm Day',
          description: '',
          exerciseItems: [{
            exerciseId: 'curl',
            weightType: 'weight',
            sets: [{ reps: '6', placeholderRepsLeft: '8', placeholderRepsRight: '9', weight: '' }],
          }],
        }]}
        logs={[]}
        programs={[]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
      />,
    );

    const option = screen.getByRole('option', { name: /arm day/i });
    fireEvent.change(option.closest('select'), { target: { value: 'tmpl-curl' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '8',
      placeholderRepsLeft: '8',
      placeholderRepsRight: '9',
    });
  });
});

describe('saving contextual personal bests', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('repairs the missing badge when saving a baseline workout without overwriting the general PB', async () => {
    const entry = { exerciseId: 'bench', baselineId: 'new-technique', weightType: 'weight', sets: [{ reps: '8', weight: '100' }] };
    const saved = { id: 'baseline-log', name: 'Baseline session', date: todayKey(), status: 'finished', exerciseItems: [entry], hasPB: false, pbExerciseIds: [] };
    const onClearEditing = vi.fn();
    render(<WorkoutLog exercises={[{ ...exercises[0], personalBest: { weight: '300', reps: '5' } }]} templates={[]} logs={[saved]} programs={[]} editingLog={saved} settings={settings} onLogsChanged={() => {}} onExercisesChanged={() => {}} onClearEditing={onClearEditing} />);
    expect(await screen.findByText(/Setup PB: 100 lbs x 8 reps/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onClearEditing).toHaveBeenCalled());
    expect(saveLog.mock.lastCall[0]).toMatchObject({ hasPB: true, pbExerciseIds: ['bench'], exerciseItems: [entry] });
    expect(saveExercise).not.toHaveBeenCalled();
  });

  it('keeps an existing general PB badge after a later higher record', async () => {
    const entry = { exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '8', weight: '100' }] };
    const saved = { id: 'old-record', name: 'Old session', date: '2026-09-18', status: 'finished', exerciseItems: [entry], hasPB: true, pbExerciseIds: ['bench'] };
    const later = { ...saved, id: 'later', date: '2026-09-20', exerciseItems: [{ ...entry, sets: [{ reps: '8', weight: '120' }] }] };
    const onClearEditing = vi.fn();
    render(<WorkoutLog exercises={[{ ...exercises[0], personalBest: { weight: '120', reps: '8', date: '2026-09-20' } }]} templates={[]} logs={[saved, later]} programs={[]} editingLog={saved} settings={settings} onLogsChanged={() => {}} onExercisesChanged={() => {}} onClearEditing={onClearEditing} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onClearEditing).toHaveBeenCalled());
    expect(saveLog.mock.lastCall[0]).toMatchObject({ hasPB: true, pbExerciseIds: ['bench'] });
    expect(saveExercise).not.toHaveBeenCalled();
  });
});
