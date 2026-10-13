import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App.jsx';
import { exportData } from '../api.js';

vi.mock('../auth.js', async importOriginal => ({
  ...await importOriginal(),
  DEV_BYPASS: false,
  getStoredUser: () => ({ sub: 'export-user', name: 'Export Tester' }),
  getStoredCredential: () => 'synthetic-token',
}));
vi.mock('../api.js', async importOriginal => ({
  ...await importOriginal(),
  initData: vi.fn(async () => {}),
  getExercises: () => [{ id: 'bench', name: 'Bench', muscleGroup: 'Chest' }],
  getTemplates: () => [], getLogs: () => [], getPrograms: () => [], getGyms: () => [],
  exportData: vi.fn(),
}));

describe('account export feedback', () => {
  it('shows why an export failed without reporting a completed backup', async () => {
    localStorage.clear();
    localStorage.setItem('forge.onboarding.dismissed.v1', 'true');
    exportData.mockRejectedValueOnce(new Error('Sync pending changes and resolve conflicts before exporting. Your latest edits are not yet in the cloud backup.'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export Tester' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Export data' })[0]);
    expect(await screen.findByText(/Sync pending changes and resolve conflicts before exporting/)).toBeVisible();
    expect(screen.queryByText(/Export downloaded/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export Tester' }));
    for (const button of screen.getAllByRole('button', { name: 'Export data' })) expect(button).toBeEnabled();
    expect(screen.getAllByText('No exports from this browser yet')[0]).toBeVisible();
  });
});
