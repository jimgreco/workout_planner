import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Calendar from '../pages/Calendar.jsx';

describe('workout history', () => {
  it('shows skipped and unrecorded statuses alongside retained set inputs', () => {
    const log = {
      id: 'history', name: 'History status check', date: '2026-10-12', status: 'finished',
      exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', sets: [
        { reps: '8', weight: '100', completion: 'recorded' },
        { reps: '8', weight: '100', completion: 'skipped' },
        { reps: '8', weight: '100', completion: 'unrecorded' },
      ] }],
    };
    const edit = vi.fn();
    render(<Calendar logs={[log]} exercises={[{ id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' }]} onUpdate={vi.fn()} onEditLog={edit} />);
    fireEvent.click(screen.getByText('History status check'));
    expect(screen.getByText('8 x 100 lb')).toBeInTheDocument();
    expect(screen.getByText('Skipped · 8 x 100 lb')).toBeInTheDocument();
    expect(screen.getByText('Not recorded · 8 x 100 lb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).toHaveBeenCalledWith(log);
  });
});
