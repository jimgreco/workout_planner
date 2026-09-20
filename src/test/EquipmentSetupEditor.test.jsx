import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EquipmentSetupEditor from '../components/EquipmentSetupEditor.jsx';

const profile = { id: 'home', gym: 'Home', machine: 'Dumbbells' };
describe('deleting equipment setups', () => {
  it('requires confirmation, allows keeping the setup, and does not validate edited fields before deleting', async () => {
    const onDelete = vi.fn(async () => {});
    render(<EquipmentSetupEditor profile={profile} onDelete={onDelete} onSave={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Equipment / model'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete setup', exact: true }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep setup' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete setup', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete setup' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });
  it('retains the editor and reports a failed deletion for retry', async () => {
    render(<EquipmentSetupEditor profile={profile} onDelete={async () => { throw new Error('Could not reach server'); }} onSave={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete setup', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach server');
    expect(screen.getByLabelText('Equipment / model')).toHaveValue('Dumbbells');
    expect(screen.getByRole('button', { name: 'Confirm delete setup' })).toBeEnabled();
  });
  it('does not offer deletion for an unsaved setup', () => {
    render(<EquipmentSetupEditor profile={{}} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Delete setup' })).not.toBeInTheDocument();
  });
});
