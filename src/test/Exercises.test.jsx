import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Exercises from '../pages/Exercises';

// Mock the store module
vi.mock('../store', () => ({
  saveExercise: vi.fn((ex) => {
    const saved = ex.id ? ex : { ...ex, id: 'new-id' };
    return [saved];
  }),
  deleteExercise: vi.fn(() => []),
}));

const sampleExercises = [
  { id: 'e1', name: 'Bench Press', muscleGroup: 'Chest', notes: '' },
  { id: 'e2', name: 'Squat', muscleGroup: 'Quads', notes: 'Keep back straight' },
];

describe('Exercises page', () => {
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
    expect(screen.getByText('Keep back straight')).toBeInTheDocument();
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
    fireEvent.click(screen.getByText('+ Add Exercise'));
    expect(screen.getByRole('heading', { name: 'Add Exercise' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Bench Press/i)).toBeInTheDocument();
  });

  it('disables save button when name is empty in add modal', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Exercise'));
    const saveBtn = screen.getByText('Add Exercise', { selector: 'button.btn-primary' });
    expect(saveBtn).toBeDisabled();
  });

  it('enables save button when name is filled', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Exercise'));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Bench Press/i), { target: { value: 'Pull Up' } });
    const saveBtn = screen.getByText('Add Exercise', { selector: 'button.btn-primary' });
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls onUpdate and closes modal on save', () => {
    const onUpdate = vi.fn();
    render(<Exercises exercises={sampleExercises} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+ Add Exercise'));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Bench Press/i), { target: { value: 'Pull Up' } });
    fireEvent.click(screen.getByText('Add Exercise', { selector: 'button.btn-primary' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByPlaceholderText(/e.g. Bench Press/i)).not.toBeInTheDocument();
  });

  it('opens delete confirmation modal', () => {
    render(<Exercises exercises={sampleExercises} onUpdate={() => {}} />);
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('Delete Exercise')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});
