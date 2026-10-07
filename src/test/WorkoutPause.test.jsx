import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog, deleteLog } from '../api.js';
vi.mock('../api.js', () => ({
  getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []), getTemplates: vi.fn(() => []), getExercises: vi.fn(() => []),
  saveLog: vi.fn(async log => [log]), deleteLog: vi.fn(async () => []), saveExercise: vi.fn(async exercise => [exercise]),
}));
const start = Date.parse('2026-10-05T10:00:00Z');
const activeLog = {
  id: 'pause-ui', name: 'Pause test', date: '2026-10-05', startTime: new Date(start).toISOString(), status: 'active',
  exerciseItems: [{ exerciseId: 'bench', weightType: 'weight', baselineId: 'original', restTargetSeconds: 90, sets: [
    { reps: '8', weight: '100', restStartTime: start + 50000, completion: 'recorded', rir: '0' },
    { reps: '8', weight: '100', rir: null },
  ] }],
};
const props = { exercises: [{ id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' }], templates: [], programs: [], settings: { defaultSets: 3, defaultReps: 8 }, onLogsChanged: () => {}, onExercisesChanged: () => {} };
const tick = async ms => { await act(async () => { vi.advanceTimersByTime(ms); }); };
const click = async name => { await act(async () => fireEvent.click(screen.getByRole('button', { name, exact: true }))); };
const lastSaved = () => saveLog.mock.calls.at(-1)[0];
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(start + 60000); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Pause/Resume workout control', () => {
  it('toggles one control, freezes rest/elapsed, restores, and finishes while paused', async () => {
    const view = render(<WorkoutLog {...props} logs={[activeLog]} />);
    await tick(0);
    await click('Pause');
    expect(screen.queryByRole('button', { name: 'Pause', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
    expect(screen.getByText('Paused · 1m')).toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete set 2 for Bench Press' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'End rest for set 1 of Bench Press' })).toBeDisabled();
    expect(lastSaved().exerciseItems).toEqual(activeLog.exerciseItems);
    await tick(120000);
    expect(screen.getByText('Paused · 1m')).toBeInTheDocument();
    expect(screen.getByText('01:20')).toBeInTheDocument();
    expect(screen.queryByText(/rest target reached/)).not.toBeInTheDocument();
    const persisted = JSON.parse(JSON.stringify(lastSaved()));
    view.unmount();
    render(<WorkoutLog {...props} logs={[persisted]} />);
    await click('Resume');
    await tick(0);
    expect(lastSaved().pausedAt).toBeNull();
    expect(lastSaved().pausedDurationMs).toBe(120000);
    expect(screen.getByText('01:20')).toBeInTheDocument();
    await tick(10000);
    await click('Pause');
    await tick(300000);
    await click('Resume');
    expect(lastSaved().pausedDurationMs).toBe(420000);
    await click('Pause');
    await tick(30000);
    await click('Finish Workout');
    const finished = lastSaved();
    expect(finished.status).toBe('finished');
    expect(finished.pausedAt).toBeNull();
    expect(finished.pausedDurationMs).toBe(450000);
    expect(finished.exerciseItems[0].sets[0]).toMatchObject({ reps: '8', weight: '100', rir: '0', restDuration: 20, restStartTime: null });
    expect(finished.startTime).toBe(activeLog.startTime);
    expect(finished.exerciseItems[0].baselineId).toBe('original');
    await tick(1000);
    expect(lastSaved().status).toBe('finished');
  });

  it('discards a paused session and clears the timer state for the next workout', async () => {
    render(<WorkoutLog {...props} logs={[{ ...activeLog, pausedAt: start + 60000, pausedDurationMs: 20000 }]} />);
    await click('Discard');
    await click('Discard Workout');
    expect(deleteLog).toHaveBeenCalledWith('pause-ui');
    expect(screen.queryByRole('button', { name: 'Resume', exact: true })).not.toBeInTheDocument();
    await tick(1000);
    expect(saveLog).not.toHaveBeenCalled();
  });

  it('hides pause on planning and saved workouts and retains saved active duration on edit', async () => {
    const view = render(<WorkoutLog {...props} logs={[{ ...activeLog, startTime: null, status: 'planning' }]} />);
    expect(screen.queryByRole('button', { name: 'Pause', exact: true })).not.toBeInTheDocument();
    view.unmount();
    const finished = { ...activeLog, status: 'finished', endTime: new Date(start + 600000).toISOString(), pausedDurationMs: 180000 };
    render(<WorkoutLog {...props} logs={[finished]} editingLog={finished} />);
    expect(screen.queryByRole('button', { name: 'Pause', exact: true })).not.toBeInTheDocument();
    await click('Save Changes');
    expect(lastSaved()).toMatchObject({ endTime: finished.endTime, pausedDurationMs: 180000, status: 'finished' });
  });
});
