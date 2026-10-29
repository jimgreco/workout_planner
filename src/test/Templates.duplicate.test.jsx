import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Templates from '../pages/Templates.jsx';
import { saveTemplate, saveLog, saveProgram } from '../api.js';
import { storeSession } from '../auth.js';
import source from '../../test-fixtures/duplicate-routine.json';
vi.mock('../api.js', () => ({ getEquipment: vi.fn(() => []), saveTemplate: vi.fn(), deleteTemplate: vi.fn(), saveSettings: vi.fn(), saveProgram: vi.fn(), deleteProgram: vi.fn(), saveLog: vi.fn(), saveExercise: vi.fn() }));
const exercises = [{ id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' }];
function open(onUpdate = vi.fn()) {
  const result = render(<Templates mode="routines" templates={[source]} exercises={exercises} gyms={[{ id: source.gymId, name: 'Original gym', equipment: [] }]} settings={{ defaultSets: 3, defaultReps: 8 }} onUpdate={onUpdate} onSettingsUpdate={vi.fn()} onStartWorkout={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate Push Day' }));
  return result;
}
function login(sub) { storeSession({ user: { sub }, token: 'synthetic', expiresAt: '2099-01-01T00:00:00Z' }); }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); login('A'); });
describe('duplicate routine editor', () => {
  it('opens an editable copy and cancellation preserves the original without any write', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Duplicate Routine' })).toBeVisible();
    expect(screen.getByDisplayValue('Push Day copy')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Gym' })).toHaveValue(source.gymId);
    fireEvent.change(screen.getByDisplayValue('Push Day copy'), { target: { value: 'Travel day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Push Day' })).toBeVisible();
    expect(saveTemplate).not.toHaveBeenCalled();
    expect(saveLog).not.toHaveBeenCalled(); expect(saveProgram).not.toHaveBeenCalled();
  });
  it('blocks repeated saves and retains draft identity/prescription after an interrupted save', async () => {
    let reject; saveTemplate.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
    const onUpdate = vi.fn(); open(onUpdate);
    const save = screen.getByRole('button', { name: 'Create Routine' });
    fireEvent.click(save); fireEvent.click(save);
    expect(saveTemplate).toHaveBeenCalledTimes(1);
    const first = saveTemplate.mock.calls[0][0];
    expect(first.id).not.toBe(source.id); expect(first.exerciseItems).toEqual(source.exerciseItems);
    expect(first.revision).toBeUndefined(); expect(first.updatedAt).toBeUndefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () => reject(new Error('Connection interrupted')));
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted');
    saveTemplate.mockResolvedValue([source, first]);
    fireEvent.click(screen.getByRole('button', { name: 'Create Routine' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(saveTemplate.mock.calls[1][0].id).toBe(first.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('rejects a draft from a changed account before saving', () => {
    open(); login('B');
    fireEvent.click(screen.getByRole('button', { name: 'Create Routine' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your account changed');
    expect(saveTemplate).not.toHaveBeenCalled();
  });
  it.each(['account change', 'unmount'])('does not apply a late response after %s', async boundary => {
    let resolve; saveTemplate.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    const onUpdate = vi.fn(); const view = open(onUpdate);
    fireEvent.click(screen.getByRole('button', { name: 'Create Routine' }));
    if (boundary === 'account change') login('B'); else view.unmount();
    await act(async () => resolve([source, saveTemplate.mock.calls[0][0]]));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
