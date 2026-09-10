import { useState } from 'react';
import Modal from './Modal.jsx';
import { gymBrief } from '../gyms.js';

export default function GymBrief({ gym, routine, exercises, onClose }) {
  const [status, setStatus] = useState('');
  const text = gymBrief(gym, routine, exercises);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('Copied. Paste this into your AI conversation.'); }
    catch { setStatus('Select and copy the text below. Clipboard access is unavailable.'); }
  }
  return <Modal title="Build with AI" onClose={onClose} footer={<button className="btn btn-primary" onClick={copy}>Copy brief</button>}>
    <p className="text-muted">Review this equipment brief, then paste it into ChatGPT or another AI conversation.</p>
    <textarea className="gym-brief" aria-label="AI workout brief" value={text} readOnly onFocus={(event) => event.target.select()} />
    {status && <p role="status">{status}</p>}
  </Modal>;
}
