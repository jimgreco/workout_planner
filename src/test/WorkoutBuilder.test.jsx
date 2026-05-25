import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByText(/Add Set/i));
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].sets).toHaveLength(2);
  });

  it('new set inherits reps/weight from previous set', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Add Set/i));
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].sets[1].reps).toBe('8');
    expect(updated[0].sets[1].weight).toBe('135');
  });

  it('adds an exercise from the dropdown', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={[]} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    const select = selects[selects.length - 1]; // "Add Exercise" select
    fireEvent.change(select, { target: { value: 'ex2' } });
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].exerciseId).toBe('ex2');
    expect(updated[0].sets).toHaveLength(4); // default 4 sets
  });

  it('does not add a duplicate exercise', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    const select = selects[selects.length - 1]; // "Add Exercise" select
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
    const spinbuttons = screen.queryAllByRole('spinbutton');
    const textboxes = screen.queryAllByRole('textbox');
    [...spinbuttons, ...textboxes].forEach((input) => expect(input).toBeDisabled());
  });

  it('shows empty message when no exercises configured', () => {
    render(<WorkoutBuilder exercises={[]} items={[]} onChange={() => {}} />);
    expect(screen.getByText(/No exercises configured yet/i)).toBeInTheDocument();
  });

  describe('Weight Types', () => {
    it('defaults to "Weight" type', () => {
      const items = [{ exerciseId: 'ex1', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);
      
      // Header should say Weight
      expect(screen.getByRole('columnheader', { name: 'Weight' })).toBeInTheDocument();
      // Selector should have Weight selected
      expect(screen.getByLabelText(/weight type for bench press/i)).toHaveValue('weight');
    });

    it('shows "Weight (2x)" when type is double', () => {
      const items = [{ exerciseId: 'ex2', weightType: 'double', sets: [{ reps: '10', weight: '50' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);
      
      expect(screen.getByRole('columnheader', { name: 'Weight (2x)' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });

    it('hides weight input when type is none', () => {
      const items = [{ exerciseId: 'ex3', weightType: 'none', sets: [{ reps: '20', weight: '' }] }];
      const { container } = render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);
      
      expect(screen.queryByRole('columnheader', { name: 'Weight' })).not.toBeInTheDocument();
      // Weight input (type="number") should be gone. 
      expect(container.querySelector('input[type="number"]')).toBeNull();
      expect(screen.getByDisplayValue('20')).toBeInTheDocument(); // Reps input should still be there
    });

    it('calls onSetCompleted from the explicit done button in "none" type', () => {
      const onSetCompleted = vi.fn();
      const items = [{ exerciseId: 'ex3', weightType: 'none', sets: [{ reps: '20', weight: '' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} onSetCompleted={onSetCompleted} />);
      
      fireEvent.click(screen.getByRole('button', { name: /complete set 1 for deadlift/i }));
      
      expect(onSetCompleted).toHaveBeenCalledWith(0, 0);
    });

    it('does not complete a weighted set just by editing the weight', () => {
      const onSetCompleted = vi.fn();
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} onSetCompleted={onSetCompleted} />);

      fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '105' } });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onSetCompleted).not.toHaveBeenCalled();
    });

    it('updates the exercise rest target', () => {
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText(/rest target for bench press/i), { target: { value: '90' } });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0][0].restTargetSeconds).toBe(90);
    });

    it('calls onRestTargetReached when active rest passes its target', async () => {
      const onRestTargetReached = vi.fn();
      const items = [{
        exerciseId: 'ex1',
        weightType: 'weight',
        restTargetSeconds: 30,
        sets: [{ reps: '10', weight: '100', restStartTime: Date.now() - 31_000 }],
      }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} onRestTargetReached={onRestTargetReached} />);

      await waitFor(() => expect(onRestTargetReached).toHaveBeenCalledWith(0, 0));
    });

    it('changes weightType when selector is changed', () => {
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);
      
      fireEvent.change(screen.getByLabelText(/weight type for bench press/i), { target: { value: 'double' } });
      
      expect(onChange).toHaveBeenCalledOnce();
      const updated = onChange.mock.calls[0][0];
      expect(updated[0].weightType).toBe('double');
    });
  });
});
