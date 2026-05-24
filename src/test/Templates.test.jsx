import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Templates from '../pages/Templates.jsx';
import { saveTemplate } from '../api.js';

vi.mock('../api.js', () => ({
  saveTemplate: vi.fn(async (template) => [template]),
  deleteTemplate: vi.fn(async () => []),
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
});
