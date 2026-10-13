import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Calendar from '../pages/Calendar.jsx';

describe('workout history', () => {
  it('searches names, exercises, notes and dates with all words, and clears without changing history', () => {
    const logs = [
      { id: 'push', name: 'Push session', date: '2026-10-12', status: 'finished', notes: 'Hotel vacation', exerciseItems: [{ exerciseId: 'bench', sets: [] }] },
      { id: 'legs', name: 'Leg session', date: '2026-10-11', status: 'finished', exerciseItems: [{ exerciseId: 'squat', sets: [] }] },
      { id: 'draft', name: 'Bench draft', date: '2026-10-12', status: 'planning', exerciseItems: [] },
    ];
    const original = structuredClone(logs);
    render(<Calendar logs={logs} exercises={[{ id: 'bench', name: 'Bench Press' }, { id: 'squat', name: 'Squat' }]} onUpdate={vi.fn()} onEditLog={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search workout history' });
    for (const query of ['  BENCH vacation ', 'Push', '2026-10-12']) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByText('Push session')).toBeVisible();
      expect(screen.queryByText('Leg session')).not.toBeInTheDocument();
      expect(screen.queryByText('Bench draft')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('1 matching workout');
    }
    fireEvent.change(search, { target: { value: 'missing' } });
    expect(screen.getByText('No workouts match your search.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Leg session')).toBeVisible();
    expect(screen.getByText('Push session')).toBeVisible();
    expect(logs).toEqual(original);
  });

  it('uses the same search in the calendar and selected day', () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    const logs = [
      { id: 'push', name: 'Push session', date, status: 'finished', exerciseItems: [{ exerciseId: 'bench', sets: [] }] },
      { id: 'legs', name: 'Leg session', date, status: 'finished', exerciseItems: [] },
    ];
    const { container } = render(<Calendar logs={logs} exercises={[{ id: 'bench', name: 'Bench Press' }]} onUpdate={vi.fn()} onEditLog={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bench' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(container.querySelector('.cal-has-log'));
    expect(screen.getByText('Push session')).toBeVisible();
    expect(screen.queryByText('Leg session')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.getByText('No matching workouts on this day.')).toBeVisible();
    expect(container.querySelector('.cal-has-log')).toBeNull();
  });

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
