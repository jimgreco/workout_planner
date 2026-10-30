import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog, saveExercise } from '../api.js';

const session = vi.hoisted(() => ({ epoch: 'account-a' }));
vi.mock('../auth.js', () => ({ getSessionEpoch: () => session.epoch }));
vi.mock('../api.js', () => ({
  getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []), getTemplates: vi.fn(() => []),
  getExercises: vi.fn(() => []), saveLog: vi.fn(), deleteLog: vi.fn(), saveExercise: vi.fn(),
}));
const exercises = [{ id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' }];
const settings = { defaultSets: 3, defaultReps: 10, defaultRestTargetSeconds: 0 };
const fixture = () => ({ id: 'finish-review', name: 'Review day', date: new Date().toISOString().slice(0, 10),
  status: 'active', startTime: new Date(Date.now() - 60000).toISOString(), exerciseItems: [
    { exerciseId: 'bench', weightType: 'none', targetRIR: 2, baselineId: 'baseline',
      setupProfile: { id: 'equipment', name: 'My bench' }, sets: [
        { reps: '8', completion: 'recorded', rir: '0' },
        { reps: '8', completion: 'unrecorded' },
        { reps: '', completion: 'skipped' },
        { reps: '', setType: 'warmup' },
      ] },
  ] });
function mount(log = fixture(), extra = {}) {
  return render(<WorkoutLog exercises={exercises} templates={[]} logs={[log]} settings={settings}
    onLogsChanged={() => {}} onExercisesChanged={() => {}} {...extra} />);
}
function openReview() { fireEvent.click(screen.getByRole('button', { name: 'Finish Workout' })); }
function confirmReview() { fireEvent.click(screen.getByRole('button', { name: 'Finish without recording' })); }

beforeEach(() => {
  vi.resetAllMocks(); session.epoch = 'account-a';
  saveLog.mockImplementation(async log => [log]);
  saveExercise.mockImplementation(async exercise => [exercise]);
});
afterEach(cleanup);

describe('workout finish review', () => {
  it('names the saved equipment on a new personal best, despite a renamed library entry', async () => {
    const log = fixture();
    log.exerciseItems[0].weightType = 'weight';
    log.exerciseItems[0].sets = [{ reps: '8', weight: '140', completion: 'recorded', rir: '0' }];
    log.exerciseItems[0].setupProfile = { id: 'equipment', gym: 'Home', machine: 'Original press' };
    mount(log, { exercises: [{ ...exercises[0], equipmentSetups: [{ id: 'equipment', machine: 'Renamed press' }] }] });
    openReview();
    const dialog = await screen.findByRole('dialog', { name: 'Workout Complete!' });
    expect(within(dialog).getByText(/Bench Press - 140 lbs x 8 reps/)).toHaveTextContent('Home · Original press');
    expect(within(dialog).queryByText(/Renamed press/)).not.toBeInTheDocument();
    expect(saveLog.mock.lastCall[0].exerciseItems).toEqual(log.exerciseItems);
  });
  it('cancel, edit, and reopen never finish or alter skipped/warmup evidence', async () => {
    mount(); openReview();
    const dialog = screen.getByRole('dialog', { name: 'Review unfinished sets' });
    expect(within(dialog).getByText('Set 2')).toBeVisible();
    expect(saveLog).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep working out' }));
    fireEvent.change(screen.getByLabelText('Status for set 2 of Bench Press'), { target: { value: 'skipped' } });
    openReview();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Workout Complete!' })).toBeVisible());
    const finished = saveLog.mock.calls.find(([log]) => log.status === 'finished')[0];
    expect(finished.exerciseItems[0].sets[1].completion).toBe('skipped');
    expect(finished.exerciseItems[0].sets[3].setType).toBe('warmup');
  });

  it('reopening and reloading require confirmation again without prematurely saving', async () => {
    const log = fixture(); const view = mount(log);
    openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    openReview();
    expect(screen.getByRole('dialog', { name: 'Review unfinished sets' })).toBeVisible();
    expect(saveLog).not.toHaveBeenCalled();
    view.unmount(); mount(JSON.parse(JSON.stringify(log))); openReview();
    expect(screen.getByText('Set 2')).toBeVisible();
    expect(saveLog).not.toHaveBeenCalled();
  });

  it('allows one pending finish and keeps unrecorded data, setup and targets intact', async () => {
    const log = fixture(); let resolve;
    saveLog.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount(log); openReview(); confirmReview();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Review unfinished sets' })).getByRole('button', { name: 'Saving…' }));
    expect(saveLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Keep working out' })).toBeDisabled();
    const finished = saveLog.mock.calls[0][0];
    expect(finished.status).toBe('finished');
    expect(finished.exerciseItems).toEqual(log.exerciseItems);
    await act(async () => resolve([finished]));
    expect(screen.getByRole('dialog', { name: 'Workout Complete!' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Review unfinished sets' })).toBeNull();
  });

  it('retains the review on error and retries only after another explicit confirmation', async () => {
    saveLog.mockRejectedValueOnce(new Error('Connection interrupted'));
    mount(); openReview(); confirmReview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByRole('dialog', { name: 'Review unfinished sets' })).toBeVisible();
    expect(saveLog).toHaveBeenCalledTimes(1);
    confirmReview();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Workout Complete!' })).toBeVisible());
    expect(saveLog).toHaveBeenCalledTimes(2);
    expect(saveLog.mock.calls[1][0].exerciseItems).toEqual(saveLog.mock.calls[0][0].exerciseItems);
  });

  it('invalidates an open confirmation after account change', () => {
    mount(); openReview(); session.epoch = 'account-b'; confirmReview();
    expect(saveLog).not.toHaveBeenCalled();
    expect(saveExercise).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('account or workout changed');
  });

  it('invalidates the confirmation when a different workout is opened', () => {
    const view = mount(); openReview();
    const other = { ...fixture(), id: 'other-workout', status: 'finished' };
    view.rerender(<WorkoutLog exercises={exercises} templates={[]} logs={[other]} settings={settings}
      editingLog={other} onLogsChanged={() => {}} onExercisesChanged={() => {}} />);
    confirmReview();
    expect(saveLog).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('account or workout changed');
  });

  it('does not write a workout to a different account after an interrupted PB save', async () => {
    const log = fixture(); log.exerciseItems[0].baselineId = undefined; log.exerciseItems[0].setupProfile = undefined;
    log.exerciseItems[0].weightType = 'weight'; log.exerciseItems[0].sets[0].weight = '100';
    let resolve; saveExercise.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount(log); openReview(); confirmReview();
    await waitFor(() => expect(saveExercise).toHaveBeenCalledTimes(1));
    session.epoch = 'account-b';
    await act(async () => resolve(exercises));
    expect(saveLog).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('account changed');
  });

  it('finishes paused workouts only after review and settles timing without completing prefills', async () => {
    const log = fixture(); log.pausedAt = Date.now() - 10000; log.pausedDurationMs = 2000;
    mount(log); openReview(); confirmReview();
    await waitFor(() => expect(saveLog).toHaveBeenCalled());
    const finished = saveLog.mock.calls[0][0];
    expect(finished.pausedAt).toBeNull();
    expect(finished.pausedDurationMs).toBeGreaterThanOrEqual(12000);
    expect(finished.exerciseItems[0].sets[1].completion).toBe('unrecorded');
  });

  it('keeps saved-history editing free of the active-workout confirmation', async () => {
    const log = { ...fixture(), status: 'finished', endTime: new Date().toISOString() };
    mount(log, { editingLog: log, onClearEditing: () => {} });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(saveLog).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Review unfinished sets' })).toBeNull();
    expect(saveLog.mock.calls[0][0].exerciseItems).toEqual(log.exerciseItems);
  });
});
