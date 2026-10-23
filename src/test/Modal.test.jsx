import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Modal from '../components/Modal.jsx';

afterEach(cleanup);
it('isolates background controls, cycles keyboard focus and restores the trigger', () => {
  const trigger = document.createElement('button'); trigger.textContent = 'Finish trigger';
  document.body.append(trigger); trigger.focus();
  const close = vi.fn();
  const view = render(<Modal title="Review" onClose={close} footer={<><button data-modal-autofocus>Keep working out</button><button>Finish without recording</button></>}><p>Review entries</p></Modal>);
  expect(trigger.inert).toBe(true);
  expect(screen.getByRole('button', { name: 'Keep working out' })).toHaveFocus();
  const first = screen.getByRole('button', { name: 'Close dialog' });
  const last = screen.getByRole('button', { name: 'Finish without recording' });
  last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  view.unmount(); expect(trigger.inert).not.toBe(true); expect(trigger).toHaveFocus(); trigger.remove();
});
