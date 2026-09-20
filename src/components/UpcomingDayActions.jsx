import { useState } from 'react';
import Modal from './Modal.jsx';
import { canEditUpcoming, editUpcomingProgram } from '../programs.js';
import { saveProgram } from '../api.js';

export default function UpcomingDayActions({ program, day, previous, next, templates, logs, onUpdate }) {
  const [dialog, setDialog] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const enabled = type => !saving && canEditUpcoming(program, day.dayKey, type, logs);
  async function apply(type, date = day.dayKey) {
    setSaving(true);
    setError('');
    try {
      const edited = editUpcomingProgram(program, date, type, templateId, logs);
      onUpdate(await saveProgram(edited));
      setDialog(null);
    } catch (error) { setError(error.message || 'Could not update upcoming days. Try again.'); }
    finally { setSaving(false); }
  }
  return <div className="upcoming-edit-actions">
    <button className="btn btn-secondary btn-sm" disabled={!enabled('insert')} onClick={() => { setTemplateId(''); setDialog('insert'); }}>Insert day</button>
    <button className="btn btn-secondary btn-sm" aria-label={'Move ' + day.dayKey + ' up'} disabled={saving || !previous || !canEditUpcoming(program, previous.dayKey, 'swap', logs)} onClick={() => apply('swap', previous.dayKey)}>↑ Up</button>
    <button className="btn btn-secondary btn-sm" aria-label={'Move ' + day.dayKey + ' down'} disabled={!next || !enabled('swap')} onClick={() => apply('swap')}>↓ Down</button>
    <button className="btn btn-danger btn-sm" disabled={!enabled('delete')} onClick={() => setDialog('delete')}>Delete day</button>
    {error && !dialog && <p role="alert">{error}</p>}
    {dialog && <Modal title={dialog === 'insert' ? 'Insert before ' + day.dayKey : 'Delete day ' + day.dayKey + '?'} onClose={() => !saving && setDialog(null)}
      footer={<><button className="btn btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className={dialog === 'delete' ? 'btn btn-danger' : 'btn btn-primary'} disabled={saving} onClick={() => apply(dialog)}>{saving ? 'Saving…' : dialog === 'delete' ? 'Delete day' : 'Insert day'}</button></>}>
      {error && <p role="alert">{error}</p>}
      {dialog === 'insert' ? <label>Day type<select value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">Rest day</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label> : <p>Remove {day.template?.name || 'Rest'} from this occurrence?</p>}
      <p>{dialog === 'insert' ? 'Later days move back one day.' : 'Later days move forward one day.'} The repeating cycle and workout history stay unchanged.</p>
    </Modal>}
  </div>;
}
