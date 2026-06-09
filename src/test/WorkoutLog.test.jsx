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

    const option = screen.getByRole('option', { name: /strength plan/i });
    fireEvent.change(option.closest('select'), { target: { value: 'program-1:tmpl-1' } });

    await waitFor(() => expect(saveLog).toHaveBeenCalledOnce());
    expect(saveLog.mock.calls[0][0]).toMatchObject({
      name: 'Push Day',
      status: 'planning',
      exerciseItems: [{ exerciseId: 'bench' }],
    });
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
  });
});
