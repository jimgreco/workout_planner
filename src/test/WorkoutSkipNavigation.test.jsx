import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkoutLog from '../pages/WorkoutLog.jsx';
import { saveLog } from '../api.js';
vi.mock('../api.js', () => ({ getLogs: vi.fn(() => undefined), getEquipment: vi.fn(() => []), getTemplates: vi.fn(() => []), getExercises: vi.fn(() => []), saveLog: vi.fn(async log => [log]), deleteLog: vi.fn(async () => []), saveExercise: vi.fn(async e => [e]) }));
const row = () => ({ reps: '', weight: '', rir: null, placeholderRir: '0', completion: 'unrecorded' });
const active = { id: 'skip-session', name: 'Synthetic skips', date: '2026-10-29', startTime: '2026-10-29T10:00:00Z', status: 'active', exerciseItems: [{ exerciseId: 'press', sets: [row(), row()] }, { exerciseId: 'row', sets: [row()] }] };
const props = { exercises: [{ id: 'press', name: 'Press', muscleGroup: 'Chest' }, { id: 'row', name: 'Row', muscleGroup: 'Back' }], logs: [active], templates: [], programs: [], settings: { defaultSets: 1, defaultReps: 8 }, onLogsChanged: () => {}, onExercisesChanged: () => {} };
const status = (set, ex = 'Press') => screen.getByLabelText(`Status for set ${set} of ${ex}`);
const position = (set, ex = 'Press') => screen.getByRole('row', { name: `Set ${set} of ${ex}`, exact: true });
const choose = async (set, value, ex = 'Press') => { fireEvent.change(status(set, ex), { target: { value } }); await act(async () => { vi.advanceTimersByTime(900); }); };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('advances skipped sets across exercises, stays at the end, and never starts rest or finishes', async () => {
  render(<WorkoutLog {...props} />);
  await choose(1, 'skipped');
  expect(position(2)).toHaveClass('active-row'); expect(position(2)).toHaveFocus();
  expect(saveLog.mock.lastCall[0].exerciseItems[0].sets[0]).toMatchObject({ completion: 'skipped', rir: null, restStartTime: null, restDuration: null });
  await choose(1, 'skipped'); // stale/repeated event on the old row
  expect(position(2)).toHaveClass('active-row');
  expect(status(2)).toHaveValue('unrecorded');
  await choose(2, 'skipped');
  expect(position(1, 'Row')).toHaveClass('active-row'); expect(position(1, 'Row')).toHaveFocus();
  await choose(1, 'skipped', 'Row');
  expect(position(1, 'Row')).toHaveClass('active-row');
  expect(saveLog.mock.lastCall[0].status).toBe('active');
  expect(saveLog.mock.lastCall[0].exerciseItems.flatMap(i => i.sets).every(s => s.rir === null && s.restStartTime === null && s.completion === 'skipped')).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await choose(1, 'unrecorded');
  expect(position(1, 'Row')).toHaveClass('active-row');
  await choose(1, 'skipped');
  expect(position(2)).toHaveClass('active-row');
});

it('preserves other running rests, blocks paused skips, and does not navigate history edits', async () => {
  const log = structuredClone(active);
  log.exerciseItems[0].sets[0] = { reps: '8', rir: '2', completion: 'recorded', restStartTime: Date.now() };
  const view = render(<WorkoutLog {...props} logs={[log]} />);
  await choose(2, 'skipped');
  expect(saveLog.mock.lastCall[0].exerciseItems[0].sets[0]).toEqual(log.exerciseItems[0].sets[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true }));
  await choose(1, 'skipped', 'Row');
  expect(status(1, 'Row')).toHaveValue('unrecorded');
  view.unmount();
  render(<WorkoutLog {...props} editingLog={{ ...active, status: 'finished' }} />);
  await choose(1, 'skipped');
  expect(status(1)).toHaveValue('skipped');
  expect(position(2)).not.toHaveClass('active-row');
  expect(position(2)).not.toHaveFocus();
});
