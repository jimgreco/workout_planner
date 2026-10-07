import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog, deleteLog, saveExercise, getLogs } from '../api.js';
vi.mock('../api.js', () => ({
  getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []), getTemplates: vi.fn(() => []), getExercises: vi.fn(() => []),
  saveLog: vi.fn(async log => [log]), deleteLog: vi.fn(async () => []), saveExercise: vi.fn(async exercise => [exercise]),
}));
const home = { id: 'home', gym: 'Home', machine: 'Dumbbells', seat: '1' };
const gym = { id: 'gym', gym: 'Gym', machine: 'Cable' };
const rowSetup = { id: 'row-machine', machine: 'Row machine' };
const exercises = [
  { id: 'press', name: 'Press', muscleGroup: 'Chest', equipmentSetups: [home, gym] },
  { id: 'row', name: 'Row', muscleGroup: 'Back', equipmentSetups: [rowSetup] },
];
const old = { id: 'old', date: '2026-10-05', status: 'finished', exerciseItems: [{ exerciseId: 'press', weightType: 'weight', baselineId: home.id, setupProfile: home, targetRIR: 2, sets: [{ reps: '8', weight: '40', rir: '0' }] }] };
const rowLog = { ...old, id: 'row-log', exerciseItems: [{ ...old.exerciseItems[0], exerciseId: 'row', baselineId: rowSetup.id, setupProfile: rowSetup }] };
const template = { id: 'routine', name: 'Routine', exerciseItems: [{ exerciseId: 'press', setupProfile: gym, baselineId: gym.id, targetRIR: 3, sets: [{ reps: '6-10' }] }] };
const props = { exercises, templates: [template], programs: [], logs: [old, rowLog], settings: { defaultSets: 1, defaultReps: 8 }, onLogsChanged: () => {}, onExercisesChanged: () => {} };
const tick = async () => act(async () => { vi.advanceTimersByTime(900); });
const click = async name => act(async () => fireEvent.click(screen.getAllByRole('button', { name, exact: true })[0]));
const add = async () => { fireEvent.change(screen.getByPlaceholderText('e.g. Monday Push Day'), { target: { value: 'Synthetic session' } }); fireEvent.change(screen.getByPlaceholderText('Search exercises to add…'), { target: { value: 'Press (Chest)' } }); await tick(); };
const choose = async value => { fireEvent.change(screen.getByLabelText('Equipment setup'), { target: { value } }); await tick(); };
const saved = () => saveLog.mock.lastCall[0];
beforeEach(() => { vi.clearAllMocks(); getLogs.mockReturnValue(undefined); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('workout equipment defaults in the start/log UI', () => {
  it('defaults manual add, stays editable, survives navigation/late refresh, and saves explicit unspecified', async () => {
    const view = render(<WorkoutLog {...props} />);
    await add();
    expect(saved().exerciseItems[0].setupProfile).toEqual(home);
    expect(saved().exerciseItems[0].setupSelectionMade).toBeUndefined();
    await click('Start Workout');
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(home.id);
    await choose(gym.id);
    const current = structuredClone(saved());
    expect(current.exerciseItems[0].setupSelectionMade).toBe(true);
    view.rerender(<WorkoutLog {...props} logs={[{ ...old, date: '2099-01-01' }, current]} />);
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(gym.id);
    view.unmount();
    const resumed = render(<WorkoutLog {...props} logs={[old, current]} />);
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(gym.id);
    await choose('');
    const cleared = structuredClone(saved());
    resumed.unmount();
    render(<WorkoutLog {...props} logs={[old, cleared]} />);
    expect(screen.getByLabelText('Equipment setup')).toHaveValue('');
    await click('Finish Workout');
    expect(saved()).toMatchObject({ status: 'finished', exerciseItems: [{ setupSelectionMade: true }] });
    expect(saved().exerciseItems[0].setupProfile).toBeUndefined();
    expect(old.exerciseItems[0].setupProfile).toEqual(home);
  });
  it.each(['initial', 'dropdown'])('honors prescribed setup/RIR on %s routine launch and ignores later defaults', async path => {
    render(<WorkoutLog {...props} initialTemplate={path === 'initial' ? template : undefined} />);
    if (path === 'dropdown') {
      const option = screen.getByRole('option', { name: 'Routine', exact: true });
      fireEvent.change(option.closest('select'), { target: { value: template.id } });
    }
    await tick();
    expect(saved().exerciseItems[0]).toMatchObject({ setupProfile: gym, targetRIR: 3, baselineId: gym.id });
    expect(saved().prescription.exerciseItems[0].setupProfile).toEqual(gym);
    await click('Start Workout');
    await choose(home.id);
    await click('Pause');
    await click('Resume');
    expect(saved().exerciseItems[0]).toMatchObject({ setupProfile: home, targetRIR: 3, setupSelectionMade: true });
    expect(saved().prescription.exerciseItems[0].setupProfile).toEqual(gym);
  });
  it('cancelled setup editor and discarded session do not promote a tentative choice', async () => {
    render(<WorkoutLog {...props} />);
    await add(); await click('Start Workout');
    await click('Save a new setup');
    await click('Cancel');
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(home.id);
    expect(saveExercise).not.toHaveBeenCalled();
    await choose(gym.id);
    const id = saved().id;
    await click('Discard'); await click('Discard Workout');
    expect(deleteLog).toHaveBeenCalledWith(id);
    await add(); await click('Start Workout');
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(home.id);
  });
  it('does not default a deleted setup and preserves historical snapshots when opened', async () => {
    const deleted = { ...exercises[0], equipmentSetups: [gym], deletedEquipmentSetupIds: [home.id] };
    const view = render(<WorkoutLog {...props} exercises={[deleted]} />);
    await add(); await click('Start Workout');
    expect(screen.getByLabelText('Equipment setup')).toHaveValue('');
    expect(saved().exerciseItems[0].setupProfile).toBeUndefined();
    view.unmount();
    render(<WorkoutLog {...props} exercises={[deleted]} editingLog={old} />);
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(home.id);
    expect(screen.getByRole('option', { name: /Home.*deleted/ })).toBeDisabled();
    expect(old.exerciseItems[0].setupProfile).toEqual(home);
  });
  it('substitution uses the new exercise identity without carrying the old equipment', async () => {
    render(<WorkoutLog {...props} />);
    await add(); await click('Start Workout');
    await choose(gym.id);
    fireEvent.change(screen.getByLabelText('Substitute Press'), { target: { value: 'row' } });
    await tick();
    expect(screen.getByLabelText('Equipment setup')).toHaveValue(rowSetup.id);
    expect(saved().exerciseItems[0]).toMatchObject({ exerciseId: 'row', baselineId: rowSetup.id, setupProfile: rowSetup });
    expect(saved().exerciseItems[0].setupSelectionMade).toBeUndefined();
  });
});

it('journals an explicit setup immediately and resumes that intent while the response is held', async () => {
  const view = render(<WorkoutLog {...props} />);
  await add(); await click('Start Workout');
  const stale = structuredClone(saved());
  let finish;
  saveLog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.change(screen.getByLabelText('Equipment setup'), { target: { value: gym.id } });
  // No debounce/timer advancement: persistence is invoked in this event.
  const pending = structuredClone(saved());
  expect(pending.exerciseItems[0]).toMatchObject({ setupProfile: gym, setupSelectionMade: true });
  view.unmount();
  getLogs.mockReturnValue([old, pending]);
  render(<WorkoutLog {...props} logs={[old, stale]} />);
  expect(screen.getByLabelText('Equipment setup')).toHaveValue(gym.id);
  await act(async () => { finish([old, pending]); });
  expect(screen.getByLabelText('Equipment setup')).toHaveValue(gym.id);
});
