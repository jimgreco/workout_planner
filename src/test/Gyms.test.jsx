import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Gyms from '../pages/Gyms.jsx';
import { saveGym, deleteGym } from '../api.js';
import { gymBrief } from '../gyms.js';

vi.mock('../api.js', () => ({ saveGym: vi.fn(), deleteGym: vi.fn(), getEquipment: () => [{ id: 'eq-dumbbells', name: 'Dumbbells', category: 'Free weights', details: '' }], getGyms: () => [] }));
const gym = { id: 'home', name: 'Home', notes: 'Garage', equipment: [{ id: 'db', name: 'Dumbbells', category: 'Free weights', details: '5–50 lb per hand' }] };
beforeEach(() => vi.clearAllMocks());

describe('gym inventory', () => {
  it('creates a gym from the shared library with gym-specific details', async () => {
    const onUpdate = vi.fn(); saveGym.mockResolvedValue([gym]);
    render(<Gyms gyms={[]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('Create your first gym'));
    fireEvent.change(screen.getByLabelText('Gym name'), { target: { value: 'Home' } });
    fireEvent.click(screen.getByText('Choose equipment'));
    fireEvent.click(screen.getByLabelText('Dumbbells'));
    fireEvent.click(screen.getByText('Done'));
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: '5–50 lb per hand' } });
    fireEvent.click(screen.getByText('Save gym'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith([gym]));
    expect(saveGym.mock.calls[0][0]).toMatchObject({ name: 'Home', equipment: [{ name: 'Dumbbells', category: 'Free weights', details: '5–50 lb per hand' }] });
  });
  it('retains edits when a save fails and supports equipment removal', async () => {
    saveGym.mockRejectedValue(new Error('Connection failed (Request ID: save-1)'));
    render(<Gyms gyms={[gym]} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Gym name'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByText('Save gym'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Gym name')).toHaveValue('New name');
    fireEvent.click(screen.getByLabelText('Remove equipment 1'));
    expect(screen.queryByLabelText('Equipment name')).not.toBeInTheDocument();
  });
  it('blocks deletion of an assigned gym', () => {
    render(<Gyms gyms={[gym]} templates={[{ id: 'r', gymId: 'home' }]} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Delete Home'));
    expect(screen.getByText('Delete gym')).toBeDisabled();
    expect(deleteGym).not.toHaveBeenCalled();
  });
  it('brief includes only this gym and preserves routine equipment evidence', () => {
    const text = gymBrief(gym, { name: 'Push', exerciseItems: [{ exerciseId: 'bench', baselineId: 'setup-1', techniqueNote: 'Pause', sets: [] }] }, [{ id: 'bench', name: 'Bench press' }]);
    expect(text).toContain('5–50 lb per hand');
    expect(text).toContain('Routine to adapt: Push');
    expect(text).toContain('Bench press');
    expect(text).toContain('setup-1');
    expect(text).toContain('Do not assume unlisted');
    expect(gymBrief({ ...gym, equipment: [] })).toContain('No equipment recorded');
  });
});
