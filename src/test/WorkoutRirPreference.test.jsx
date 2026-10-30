import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog, deleteLog, getLogs } from '../api.js';
vi.mock('../api.js', () => ({
  getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []), getTemplates: vi.fn(() => []), getExercises: vi.fn(() => []),
  saveLog: vi.fn(async log => [log]), deleteLog: vi.fn(async () => []), saveExercise: vi.fn(async exercise => [exercise]),
}));
const exercises = [{ id: 'press', name: 'Press', muscleGroup: 'Chest' }, { id: 'row', name: 'Row', muscleGroup: 'Back' }];
const old = { id: 'old', date: '2026-10-05', status: 'finished', exerciseItems: [{ exerciseId: 'press', weightType: 'none', targetRIR: 4, sets: [{ reps: '8', rir: '0', completion: 'recorded' }] }] };
const template = { id: 'routine', name: 'Routine', exerciseItems: [{ exerciseId: 'press', weightType: 'none', targetRIR: 3, sets: [{ reps: '6-10' }] }] };
const props = { exercises, templates: [template], programs: [], logs: [old], settings: { defaultSets: 1, defaultReps: 8 }, onLogsChanged: () => {}, onExercisesChanged: () => {} };
const tick = async () => act(async () => { vi.advanceTimersByTime(900); });
const click = async name => act(async () => fireEvent.click(screen.getAllByRole('button', { name, exact: true })[0]));
const saved = () => saveLog.mock.lastCall[0];
const rir = () => screen.getByLabelText('Reps left for set 1 of Press');
const changeRir = async value => { fireEvent.change(rir(), { target: { value } }); await tick(); };
beforeEach(() => { vi.clearAllMocks(); getLogs.mockReturnValue(undefined); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('remembered RIR in workout entry', () => {
  it.each(['initial', 'dropdown', 'manual'])('prefills %s creation with zero while preserving target and unknown actual effort', async path => {
    render(<WorkoutLog {...props} initialTemplate={path === 'initial' ? template : undefined} />);
    if (path === 'dropdown') fireEvent.change(screen.getByRole('option', { name: 'Routine', exact: true }).closest('select'), { target: { value: template.id } });
    if (path === 'manual') { fireEvent.change(screen.getByPlaceholderText('e.g. Monday Push Day'), { target: { value: 'Synthetic RIR session' } }); fireEvent.change(screen.getByPlaceholderText('Search exercises to add…'), { target: { value: 'Press (Chest)' } }); }
    await tick();
    expect(saved().exerciseItems[0].sets[0]).toMatchObject({ rir: null, placeholderRir: '0', completion: 'unrecorded' });
    if (path !== 'manual') expect(saved().exerciseItems[0].targetRIR).toBe(3);
    await click('Start Workout');
    expect(rir()).toHaveValue('0');
    fireEvent.change(screen.getByLabelText('Status for set 1 of Press'), { target: { value: 'recorded' } });
    await tick();
    expect(saved().exerciseItems[0].sets[0]).toMatchObject({ rir: '0', placeholderRir: null });
    expect(old.exerciseItems[0].sets[0].rir).toBe('0');
  });
  it('keeps edits and Not sure across resume and ignores refreshed defaults', async () => {
    const view = render(<WorkoutLog {...props} initialTemplate={template} />);
    await tick(); await click('Start Workout'); await changeRir('5');
    expect(saved().exerciseItems[0].sets[0].rir).toBe('5');
    await changeRir('');
    const current = JSON.parse(JSON.stringify(saved()));
    view.unmount();
    render(<WorkoutLog {...props} logs={[old, current]} />);
    expect(rir()).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Status for set 1 of Press'), { target: { value: 'recorded' } });
    await tick();
    expect(saved().exerciseItems[0].sets[0].rir).toBeNull();
  });
  it('discards tentative values and does not prefill historical edits', async () => {
    const view = render(<WorkoutLog {...props} initialTemplate={template} />);
    await tick(); await click('Start Workout'); await changeRir('5');
    const id = saved().id;
    await click('Discard'); await click('Discard Workout');
    expect(deleteLog).toHaveBeenCalledWith(id);
    fireEvent.change(screen.getByPlaceholderText('e.g. Monday Push Day'), { target: { value: 'New RIR session' } });
    fireEvent.change(screen.getByPlaceholderText('Search exercises to add…'), { target: { value: 'Press (Chest)' } });
    await tick(); await click('Start Workout'); expect(rir()).toHaveValue('0');
    view.unmount();
    const historical = { ...old, exerciseItems: [{ ...old.exerciseItems[0], sets: [{ reps: '', rir: null, placeholderRir: '4', completion: 'unrecorded' }] }] };
    render(<WorkoutLog {...props} editingLog={historical} />);
    expect(rir()).toHaveValue('');
  });
});
