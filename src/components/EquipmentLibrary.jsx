import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { saveEquipment, deleteEquipment } from '../api.js';
import { EQUIPMENT_CATEGORIES } from '../gyms.js';
import Modal from './Modal.jsx';

export default function EquipmentLibrary({ equipment, onUpdate, selectedIDs = [], onSelect }) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { onUpdate(await saveEquipment(draft)); setDraft(null); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { onUpdate(await deleteEquipment(deleting.id)); setDeleting(null); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const visible = equipment.filter((entry) => `${entry.name} ${entry.details}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="equipment-library">
    <p className="text-muted">One library for all your gyms and exercises. Add or edit any entry.</p>
    <div className="equipment-library-search"><input aria-label="Search equipment library" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment…" /><button className="btn btn-secondary" onClick={() => { setError(''); setDraft({ name: search, category: 'Other', details: '' }); }}><Plus size={16} /> Add equipment</button></div>
    <div className="equipment-library-list">
      {EQUIPMENT_CATEGORIES.map((category) => {
        const entries = visible.filter((entry) => entry.category === category);
        return entries.length > 0 && <section key={category}><h3>{category}</h3>{entries.map((entry) => <div className="equipment-library-row" key={entry.id}>
          {onSelect ? <label className="checkbox-row"><input type="checkbox" checked={selectedIDs.includes(entry.id)} onChange={() => onSelect(entry)} /><span>{entry.name}{entry.details && <small>{entry.details}</small>}</span></label> : <button className="equipment-library-name" onClick={() => { setError(''); setDraft({ ...entry }); }}>{entry.name}{entry.details && <small>{entry.details}</small>}</button>}
          <button className="btn-icon" aria-label={`Edit ${entry.name}`} onClick={() => { setError(''); setDraft({ ...entry }); }}><Pencil size={16} /></button>
          <button className="btn-icon" aria-label={`Delete ${entry.name}`} onClick={() => { setError(''); setDeleting(entry); }}><Trash2 size={16} /></button>
        </div>)}</section>;
      })}
      {!visible.length && <p className="text-muted">No equipment matches your search. Add an entry to your library.</p>}
    </div>
    {draft && <Modal title={draft.id ? 'Edit equipment' : 'New equipment'} onClose={() => !busy && setDraft(null)} footer={<><button className="btn btn-secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save equipment'}</button></>}>
      <fieldset className="gym-editor" disabled={busy}>
        <label>Equipment name<input autoFocus maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{EQUIPMENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Description<textarea maxLength={500} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} /></label>
        <p className="text-muted">Record gym-specific models and weight ranges in each gym’s inventory.</p>
      </fieldset>{error && <p role="alert" className="inline-error">{error}</p>}
    </Modal>}
    {deleting && <Modal title={`Delete ${deleting.name}?`} onClose={() => !busy && setDeleting(null)} footer={<><button className="btn btn-secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={remove}>Delete equipment</button></>}><p>Equipment used by a gym or exercise must be unassigned first.</p>{error && <p role="alert" className="inline-error">{error}</p>}</Modal>}
  </div>;
}
