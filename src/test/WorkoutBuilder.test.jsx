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
    expect(screen.getAllByText('Bench Press')[0]).toBeInTheDocument();
    expect(screen.getByText('Chest')).toBeInTheDocument();
  });

  it('calls reset PB action from a workout exercise card', () => {
    const onResetPersonalBest = vi.fn();
    const exercisesWithPB = [
      { ...exercises[0], personalBest: { weight: '225', reps: '5' } },
      ...exercises.slice(1),
    ];
    render(
      <WorkoutBuilder
        exercises={exercisesWithPB}
        items={oneItem}
        onChange={() => {}}
        onResetPersonalBest={onResetPersonalBest}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reset pb/i }));

    expect(onResetPersonalBest).toHaveBeenCalledWith(exercisesWithPB[0]);
  });

  it('hides reset PB action while planning', () => {
    const exercisesWithPB = [
      { ...exercises[0], personalBest: { weight: '225', reps: '5' } },
      ...exercises.slice(1),
    ];
    render(
      <WorkoutBuilder
        exercises={exercisesWithPB}
        items={oneItem}
        onChange={() => {}}
        onResetPersonalBest={() => {}}
        planningMode
      />,
    );

    expect(screen.queryByRole('button', { name: /reset pb/i })).not.toBeInTheDocument();
  });

  it('renders set inputs with correct values', () => {
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={() => {}} />);
    const repsInput = screen.getByDisplayValue('8');
    const weightInput = screen.getByDisplayValue('135');
    expect(repsInput).toBeInTheDocument();
    expect(weightInput).toBeInTheDocument();
  });

  it('labels the set value as seconds for time based exercises', () => {
    render(
      <WorkoutBuilder
        exercises={[{ ...exercises[0], usesTime: true }, ...exercises.slice(1)]}
        items={oneItem}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Secs' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Reps' })).not.toBeInTheDocument();
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

  it('updates exercise notes while logging', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/exercise notes/i), { target: { value: 'Use a close grip today' } });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].description).toBe('Use a close grip today');
  });

  it('substitutes an exercise while preserving sets', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/substitute bench press/i), { target: { value: 'ex2' } });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      exerciseId: 'ex2',
      sets: oneItem[0].sets,
    });
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

  it('adds an exercise from the searchable exercise field', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={[]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/search exercises to add/i), { target: { value: 'Squat (Quads)' } });
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].exerciseId).toBe('ex2');
    expect(updated[0].sets).toHaveLength(4); // default 4 sets
  });

  it('does not add a duplicate exercise', () => {
    const onChange = vi.fn();
    render(<WorkoutBuilder exercises={exercises} items={oneItem} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/search exercises to add/i), { target: { value: 'Bench Press (Chest)' } });
    // onChange should not be called since ex1 is already in items
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls edit exercise from a planning routine card', () => {
    const onEditExercise = vi.fn();
    render(
      <WorkoutBuilder
        exercises={exercises}
        items={oneItem}
        onChange={() => {}}
        planningMode
        onEditExercise={onEditExercise}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /edit exercise/i }));
    expect(onEditExercise).toHaveBeenCalledWith(exercises[0]);
  });

  it('updates every planned set from the same-target control', () => {
    const onChange = vi.fn();
    const items = [{ exerciseId: 'ex1', sets: [{ placeholderReps: '8', weight: '' }, { placeholderReps: '8', weight: '' }] }];
    render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} planningMode />);

    fireEvent.change(screen.getByLabelText(/reps for all sets/i), { target: { value: '10' } });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0][0].sets.map((set) => set.placeholderReps)).toEqual(['10', '10']);
  });

  it('stores a planned rep range for every set', () => {
    const onChange = vi.fn();
    const items = [{ exerciseId: 'ex1', sets: [{ placeholderReps: '8', weight: '' }, { placeholderReps: '8', weight: '' }] }];
    const { rerender } = render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} planningMode />);

    fireEvent.click(screen.getByLabelText(/use reps range/i));
    const rangedItems = onChange.mock.calls[0][0];
    rerender(<WorkoutBuilder exercises={exercises} items={rangedItems} onChange={onChange} planningMode />);
    fireEvent.change(screen.getByLabelText(/max reps/i), { target: { value: '12' } });

    const updated = onChange.mock.calls.at(-1)[0];
    expect(updated[0].sets.map((set) => set.placeholderReps)).toEqual(['8-12', '8-12']);
  });

  it('uses saved reps when enabling a range for existing routines', () => {
    const onChange = vi.fn();
    const items = [{ exerciseId: 'ex1', sets: [{ reps: '8', weight: '' }, { reps: '8', weight: '' }] }];
    const { rerender } = render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} planningMode />);

    fireEvent.click(screen.getByLabelText(/use reps range/i));
    const rangedItems = onChange.mock.calls[0][0];
    expect(rangedItems[0].sets.map((set) => set.placeholderReps)).toEqual(['8-8', '8-8']);

    rerender(<WorkoutBuilder exercises={exercises} items={rangedItems} onChange={onChange} planningMode />);
    expect(screen.getByLabelText(/min reps/i)).toHaveValue('8');
    expect(screen.getByLabelText(/max reps/i)).toHaveValue('8');
  });

  it('keeps range fields visible when clearing max reps', () => {
    const onChange = vi.fn();
    const items = [{ exerciseId: 'ex1', sets: [{ placeholderReps: '8-12', weight: '' }, { placeholderReps: '8-12', weight: '' }] }];
    const { rerender } = render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} planningMode />);

    fireEvent.change(screen.getByLabelText(/max reps/i), { target: { value: '' } });
    const updatedItems = onChange.mock.calls[0][0];
    expect(updatedItems[0].sets.map((set) => set.placeholderReps)).toEqual(['8-', '8-']);

    rerender(<WorkoutBuilder exercises={exercises} items={updatedItems} onChange={onChange} planningMode />);
    expect(screen.getByLabelText(/min reps/i)).toHaveValue('8');
    expect(screen.getByLabelText(/max reps/i)).toHaveValue('');
  });

  it('uses one routine target for unilateral exercises while planning', () => {
    const onChange = vi.fn();
    const unilateralExercises = [{ ...exercises[0], isUnilateral: true }];
    const items = [{
      exerciseId: 'ex1',
      sets: [{ reps: '6', placeholderRepsLeft: '8', placeholderRepsRight: '8', repsLeft: '7', repsRight: '7', weight: '' }],
    }];
    render(<WorkoutBuilder exercises={unilateralExercises} items={items} onChange={onChange} planningMode />);

    expect(screen.queryByLabelText(/left reps/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/right reps/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/reps for all sets/i)).toHaveValue('8');

    fireEvent.change(screen.getByLabelText(/reps for all sets/i), { target: { value: '10' } });
    expect(onChange.mock.calls[0][0][0].sets[0]).toEqual({
      placeholderReps: '10',
      weight: '',
    });
  });

  it('uses one per-set routine target for unilateral exercises while planning', () => {
    const onChange = vi.fn();
    const unilateralExercises = [{ ...exercises[0], isUnilateral: true }];
    const items = [{
      exerciseId: 'ex1',
      useIndividualReps: true,
      sets: [{ reps: '6', placeholderRepsLeft: '8', placeholderRepsRight: '8', repsLeft: '7', repsRight: '7', weight: '' }],
    }];
    render(<WorkoutBuilder exercises={unilateralExercises} items={items} onChange={onChange} planningMode />);

    expect(screen.queryByLabelText(/left reps/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/right reps/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('8'), { target: { value: '10' } });

    expect(onChange.mock.calls[0][0][0].sets[0]).toEqual({
      placeholderReps: '10',
      weight: '',
    });
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

    it('shows "Bar + 2x" when type is bar_double', () => {
      const items = [{ exerciseId: 'ex2', weightType: 'bar_double', sets: [{ reps: '10', weight: '45' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);

      expect(screen.getByRole('columnheader', { name: 'Bar + 2x' })).toBeInTheDocument();
      expect(screen.getByLabelText(/weight type for squat/i)).toHaveValue('bar_double');
      expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    });

    it('does not show a barbell plate breakdown for standard weighted sets', () => {
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '135' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);

      expect(screen.queryByLabelText(/plate calculator for set 1 of bench press/i)).not.toBeInTheDocument();
    });

    it('hides weight input when type is none', () => {
      const items = [{ exerciseId: 'ex3', weightType: 'none', sets: [{ reps: '20', weight: '' }] }];
      const { container } = render(<WorkoutBuilder exercises={exercises} items={items} onChange={() => {}} />);
      
      expect(screen.queryByRole('columnheader', { name: 'Weight' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/weight for set 1 of deadlift/i)).not.toBeInTheDocument();
      expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2); // Effort fields still render
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

    it('assigns an exercise to a superset group', () => {
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText(/superset group for bench press/i), { target: { value: 'A' } });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0][0].supersetGroup).toBe('A');
    });

    it('tracks type, RPE, and RIR for a set while logging', () => {
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText(/set type for set 1 of bench press/i), { target: { value: 'warmup' } });
      fireEvent.change(screen.getByLabelText(/rpe for set 1 of bench press/i), { target: { value: '8.5' } });
      fireEvent.change(screen.getByLabelText(/rir for set 1 of bench press/i), { target: { value: '2' } });

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange.mock.calls[0][0][0].sets[0].setType).toBe('warmup');
      expect(onChange.mock.calls[1][0][0].sets[0].rpe).toBe('8.5');
      expect(onChange.mock.calls[2][0][0].sets[0].rir).toBe('2');
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

    it('shows controls for an active rest interval', () => {
      const onRestExtended = vi.fn();
      const onEndRest = vi.fn();
      const items = [{
        exerciseId: 'ex1',
        weightType: 'weight',
        restTargetSeconds: 90,
        sets: [{ reps: '10', weight: '100', restStartTime: Date.now() - 20_000 }],
      }];
      render(
        <WorkoutBuilder
          exercises={exercises}
          items={items}
          onChange={() => {}}
          onRestExtended={onRestExtended}
          onEndRest={onEndRest}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /add 30 seconds to rest for set 1 of bench press/i }));
      fireEvent.click(screen.getByRole('button', { name: /end rest for set 1 of bench press/i }));

      expect(onRestExtended).toHaveBeenCalledWith(0, 0, 30);
      expect(onEndRest).toHaveBeenCalledWith(0, 0);
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

    it('persists bar_double when selector is changed', () => {
      const onChange = vi.fn();
      const items = [{ exerciseId: 'ex1', weightType: 'weight', sets: [{ reps: '10', weight: '100' }] }];
      render(<WorkoutBuilder exercises={exercises} items={items} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText(/weight type for bench press/i), { target: { value: 'bar_double' } });

      expect(onChange).toHaveBeenCalledOnce();
      const updated = onChange.mock.calls[0][0];
      expect(updated[0].weightType).toBe('bar_double');
    });
  });
});
