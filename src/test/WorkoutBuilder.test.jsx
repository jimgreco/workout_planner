import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkoutBuilder from '../components/WorkoutBuilder';

const exercises = [
  { id: 'ex1', name: 'Bench Press', muscleGroup: 'Chest', notes: '' },
  { id: 'ex2', name: 'Squat', muscleGroup: 'Quads', notes: '' },
  { id: 'ex3', name: 'Deadlift', muscleGroup: 'Back', notes: '' },
];

const oneItem = [
  { exerciseId: 'ex1', sets: [{ reps: '8', weight: '135' }] },
];

describe('WorkoutBuilder', () => {
  it('renders exercise name and muscle group badge', () => {
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={() => {}} />);
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Chest')).toBeInTheDocument();
  });

  it('renders set inputs with correct values', () => {
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={() => {}} />);
    const repsInput = screen.getByDisplayValue('8');
    const weightInput = screen.getByDisplayValue('135');
    expect(repsInput).toBeInTheDocument();
    expect(weightInput).toBeInTheDocument();
  });

  it('calls onChange when a set value is updated', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    const repsInput = screen.getByDisplayValue('8');
    fireEvent.change(repsInput, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledOnce();
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].sets[0].reps).toBe('10');
  });

  it('adds a new set when "+ Add Set" is clicked', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add Set'));
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].sets).toHaveLength(2);
  });

  it('new set inherits reps/weight from previous set', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ Add Set'));
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].sets[1].reps).toBe('8');
    expect(updated[0].sets[1].weight).toBe('135');
  });

  it('adds an exercise from the dropdown', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={[]} onChange={onChange} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ex2' } });
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].exerciseId).toBe('ex2');
    expect(updated[0].sets).toHaveLength(1);
  });

  it('does not add a duplicate exercise', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: /add exercise/i });
    fireEvent.change(select, { target: { value: 'ex1' } });
    // onChange should not be called since ex1 is already in items
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes an exercise when ✕ button is clicked', () => {
    const onChange = vi.fn();
    const items = [
      { exerciseId: 'ex1', sets: [{ reps: '8', weight: '135' }] },
      { exerciseId: 'ex2', sets: [{ reps: '5', weight: '225' }] },
    ];
    render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);
    // Each exercise block has ✕ for removal; first one removes ex1
    const removeButtons = screen.getAllByTitle('Remove exercise');
    fireEvent.click(removeButtons[0]);
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].exerciseId).toBe('ex2');
  });

  it('renders read-only mode without inputs or add buttons', () => {
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={() => {}} readOnly />);
    expect(screen.queryByText('+ Add Set')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Remove exercise')).not.toBeInTheDocument();
    // Inputs should be disabled
    const inputs = screen.getAllByRole('spinbutton');
    inputs.forEach((input) => expect(input).toBeDisabled());
  });

  it('shows empty message when no exercises configured', () => {
    render(<WorkoutBuilder exercises={[]} items={[]} onChange={() => {}} />);
    expect(screen.getByText(/No exercises configured yet/i)).toBeInTheDocument();
  });
});
