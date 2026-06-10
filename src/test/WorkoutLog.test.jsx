import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog } from '../api.js';

vi.mock('../api.js', () => ({
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
      { exerciseId: 'bench', weightType: 'weight', sets: [{ reps: '8', weight: '' }] },
    ],
  },
];

const settings = { defaultSets: 3, defaultReps: 10, defaultRestTargetSeconds: 0 };

describe('WorkoutLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts planning from an active program workout', async () => {
    render(
      <WorkoutLog
        exercises={exercises}
        templates={templates}
        logs={[]}
        programs={[{
          id: 'program-1',
          name: 'Strength Plan',
          active: true,
          schedule: [{ weekday: new Date().getDay(), templateId: 'tmpl-1' }],
        }]}
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
      exerciseItems: [{ exerciseId: 'bench' }],
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
        programs={[{
          id: 'program-1',
          name: 'Strength Plan',
          active: true,
          schedule: [{ weekday: new Date().getDay(), templateId: 'tmpl-1' }],
          progression: { type: 'double_progression', minReps: 8, maxReps: 12, repIncrement: 1, weightIncrement: 5 },
        }]}
        settings={settings}
        onLogsChanged={() => {}}
        onExercisesChanged={() => {}}
      />,
    );

    const option = screen.getByRole('option', { name: /strength plan/i });
    fireEvent.change(option.closest('select'), { target: { value: 'program-1:tmpl-1' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0].exerciseItems[0].sets[0]).toMatchObject({
      placeholderReps: '12 (8)',
      placeholderWeight: '105',
    });
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
