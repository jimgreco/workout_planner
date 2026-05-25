import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Exercises from '../pages/Exercises';
import { saveExercise } from '../api.js';

// Mock api.js — functions are now async and have no userId param
vi.mock('../api.js', () => ({
  saveExercise: vi.fn(async (ex) => {
    const saved = ex.id ? ex : { ...ex, id: 'new-id' };
    return [saved];
  }),
  deleteExercise: vi.fn(async () => []),
}));

const UID = 'test-user';

const sampleExercises = [
  { id: 'e1', name: 'Bench Press', muscleGroup: 'Chest', notes: '' },
  { id: 'e2', name: 'Squat', muscleGroup: 'Quads', notes: 'Keep back straight' },
];

describe('Exercises page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exercise names', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Squat')).toBeInTheDocument();
  });

  it('shows muscle group badges', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    expect(screen.getByText('Chest')).toBeInTheDocument();
    expect(screen.getByText('Quads')).toBeInTheDocument();
  });

  it('shows notes when present', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    expect(screen.getByText(/Keep back straight/i)).toBeInTheDocument();
  });

  it('shows personal best reps when present', () => {
    render(<Exercises exercises={[
      { ...sampleExercises[0], personalBest: { weight: '225', reps: '5', date: '2026-05-21' } },
    ]} onUpdate={() => {}} />);

    expect(screen.getByText(/225 lbs x 5 reps/i)).toBeInTheDocument();
  });

  it('shows empty state when no exercises', () => {
    render(<Exercises exercises={[]} onUpdate={() => {}} />);
    expect(screen.getByText(/No exercises yet/i)).toBeInTheDocument();
  });

  it('filters exercises by search', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    const search = screen.getByPlaceholderText(/search exercises/i);
    fireEvent.change(search, { target: { value: 'bench' } });
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.queryByText('Squat')).not.toBeInTheDocument();
  });

  it('shows no-match message when search has no results', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    const search = screen.getByPlaceholderText(/search exercises/i);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/No exercises match/i)).toBeInTheDocument();
  });

  it('opens add modal on button click', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    fireEvent.click(screen.getAllByText(/Add Exercise/i)[0]);
    expect(screen.getByRole('heading', { name: 'Add Exercise' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Bench Press/i)).toBeInTheDocument();
  });

  it('disables save button when name is empty', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    fireEvent.click(screen.getAllByText(/Add Exercise/i)[0]);
    const saveBtn = screen.getAllByText(/Add Exercise/i, { selector: 'button.btn-primary' })[1];
    expect(saveBtn).toBeDisabled();
  });

  it('enables save button when name is filled', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    fireEvent.click(screen.getAllByText(/Add Exercise/i)[0]);
    fireEvent.change(screen.getByPlaceholderText(/e.g. Bench Press/i), { target: { value: 'Pull Up' } });
    const saveBtn = screen.getAllByText(/Add Exercise/i, { selector: 'button.btn-primary' })[1];
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls onUpdate and closes modal on save', async () => {
    const onUpdate = vi.fn();
    render(<Exercises exercises={sampleExercises} onUpdate={onUpdate} />);
    fireEvent.click(screen.getAllByText(/Add Exercise/i)[0]);
    fireEvent.change(screen.getByPlaceholderText(/e.g. Bench Press/i), { target: { value: 'Pull Up' } });
    fireEvent.click(screen.getAllByText(/Add Exercise/i, { selector: 'button.btn-primary' })[1]);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
    expect(screen.queryByPlaceholderText(/e.g. Bench Press/i)).not.toBeInTheDocument();
  });

  it('saves optional reps with manual personal bests', async () => {
    const onUpdate = vi.fn();
    render(<Exercises exercises={sampleExercises} onUpdate={onUpdate} />);

    fireEvent.click(screen.getAllByTitle('Edit PB')[0]);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 225/i), { target: { value: '225' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. 5/i), { target: { value: '5' } });
    fireEvent.click(screen.getByText(/Save PB/i, { selector: 'button.btn-primary' }));

    await waitFor(() => expect(saveExercise).toHaveBeenCalledOnce());
    expect(saveExercise.mock.calls[0][0].personalBest).toEqual({
      weight: '225',
      reps: '5',
      date: expect.any(String),
    });
  });

  it('opens delete confirmation modal', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('Delete Exercise')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
