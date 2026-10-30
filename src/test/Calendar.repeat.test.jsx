import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Calendar from '../pages/Calendar.jsx';
import { getLogs, saveLog } from '../api.js';
vi.mock('../api.js', () => ({ getLogs: vi.fn(), saveLog: vi.fn(), deleteLog: vi.fn() }));
const source = { id: 'old', name: 'Push session', date: '2026-10-25', status: 'finished', exerciseItems: [{ exerciseId: 'bench', sets: [{ reps: '8', weight: '45', completion: 'recorded' }] }, { exerciseId: 'missing', sets: [] }] };
const exercises = [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }];
function open(onPlanCreated = vi.fn()) {
  render(<Calendar logs={[source]} exercises={exercises} onUpdate={vi.fn()} onEditLog={vi.fn()} onPlanCreated={onPlanCreated} />);
  fireEvent.click(screen.getByText('Push session'));
  fireEvent.click(screen.getByRole('button', { name: 'Repeat workout' }));
}
beforeEach(() => { vi.clearAllMocks(); getLogs.mockReturnValue([source]); });
describe('repeat confirmation', () => {
  it('reports missing exercises and cancellation performs no write', () => {
    open(); expect(screen.getByText('1 missing exercise will be skipped.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(saveLog).not.toHaveBeenCalled();
  });
  it('rechecks the current active plan before saving', async () => {
    open(); getLogs.mockReturnValue([source, { id: 'active', status: 'planning' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan for today' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/current workout or plan/);
    expect(saveLog).not.toHaveBeenCalled();
  });
  it('ignores duplicate clicks and retries the same new ID after failure', async () => {
    let reject; saveLog.mockImplementationOnce(() => new Promise((_yes, no) => { reject = no; }));
    const created = vi.fn(); open(created);
    const button = screen.getByRole('button', { name: 'Create plan for today' });
    fireEvent.click(button); fireEvent.click(button);
    expect(saveLog).toHaveBeenCalledTimes(1);
    const first = saveLog.mock.calls[0][0]; expect(first.id).not.toBe(source.id);
    await act(async () => { reject(new Error('Network interrupted')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Network interrupted');
    saveLog.mockResolvedValue([source, first]);
    fireEvent.click(screen.getByRole('button', { name: 'Create plan for today' }));
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(saveLog.mock.calls[1][0].id).toBe(first.id);
    expect(saveLog.mock.calls[1][0].exerciseItems).toHaveLength(1);
  });
});
