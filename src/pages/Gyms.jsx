import { useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import GymBrief from '../components/GymBrief.jsx';
import { saveGym, deleteGym } from '../api.js';
import { EQUIPMENT_CATEGORIES, QUICK_EQUIPMENT } from '../gyms.js';

export default function Gyms({ gyms, templates = [], onUpdate }) {
  const [draft, setDraft] = useState(null);
  const [brief, setBrief] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  function edit(gym) { setError(''); setDraft(structuredClone(gym)); }
  function addEquipment(name = '', category = 'Other') {
    setDraft((value) => ({ ...value, equipment: [...value.equipment, { id: crypto.randomUUID(), name, category, details: '' }] }));
  }
  function changeEquipment(id, patch) {
    setDraft((value) => ({ ...value, equipment: value.equipment.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }
  async function save() {
    setBusy(true); setError('');
    try { onUpdate(await saveGym(draft)); setDraft(null); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { onUpdate(await deleteGym(deleting.id)); setDeleting(null); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const visible = gyms.filter((gym) => `${gym.name} ${gym.equipment.map((item) => item.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page gyms-page">
    <div className="page-header"><div><span className="section-kicker">Your training spaces</span><h1>Gyms</h1><p className="text-muted">Record what’s available. Build routines for the place you train.</p></div>
      <button className="btn btn-primary" onClick={() => edit({ name: '', notes: '', equipment: [] })}><Plus size={18} /> Add gym</button>
    </div>
    {gyms.length > 0 && <input type="text" className="gym-search" aria-label="Search gyms or equipment" placeholder="Search gyms or equipment…" value={search} onChange={(event) => setSearch(event.target.value)} />}
    {gyms.length === 0 ? <div className="gym-empty"><Building2 size={36} /><h2>Every gym is different</h2><p>Add your gym, home setup, or hotel fitness room. Record machines, free weights, and attachments so your next routine fits.</p><button className="btn btn-primary" onClick={() => edit({ name: '', notes: '', equipment: [] })}>Create your first gym</button></div> : <div className="gym-grid">
      {visible.map((gym) => <article className="gym-card" key={gym.id}>
        <Building2 size={24} /><h2>{gym.name}</h2>
        <p className="text-muted">{gym.equipment.length} equipment {gym.equipment.length === 1 ? 'entry' : 'entries'} · {templates.filter((routine) => routine.gymId === gym.id).length} {templates.filter((routine) => routine.gymId === gym.id).length === 1 ? 'routine' : 'routines'}</p>
        {gym.notes && <p className="gym-notes">{gym.notes}</p>}
        <ul className="gym-inventory">{gym.equipment.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{item.category}{item.details ? ` · ${item.details}` : ''}</span></li>)}</ul>
        {!gym.equipment.length && <p className="text-muted">No equipment recorded yet. Edit this gym to add it.</p>}
        <div className="gym-actions"><button className="btn btn-secondary" onClick={() => edit(gym)}><Pencil size={16} /> Edit</button><button className="btn btn-secondary" onClick={() => setBrief(gym)}><Sparkles size={16} /> Build with AI</button><button className="btn-icon" aria-label={`Delete ${gym.name}`} onClick={() => { setError(''); setDeleting(gym); }}><Trash2 size={18} /></button></div>
      </article>)}
    </div>}
    {gyms.length > 0 && !visible.length && <p className="text-muted">No gyms match your search.</p>}
    {draft && <Modal title={draft.id ? 'Edit gym' : 'New gym'} onClose={() => !busy && setDraft(null)} footer={<><button className="btn btn-secondary" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft.name.trim() || draft.equipment.some((item) => !item.name.trim())} onClick={save}>{busy ? 'Saving…' : 'Save gym'}</button></>}>
      <fieldset className="gym-editor" disabled={busy}>
        <label>Gym name<input type="text" autoFocus maxLength={120} placeholder="e.g. Downtown gym" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Gym notes<textarea maxLength={2000} placeholder="Access restrictions, space, or anything else to plan around" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div><h3>Equipment</h3><p className="text-muted">Add what you’ve confirmed is available. Include units, weight ranges, machine models, and attachments in the details.</p></div>
        <div className="gym-quick-add">{QUICK_EQUIPMENT.map(([name, category]) => <button key={name} className="btn btn-secondary btn-sm" disabled={draft.equipment.length >= 200 || draft.equipment.some((item) => item.name === name)} onClick={() => addEquipment(name, category)}>+ {name}</button>)}</div>
        {draft.equipment.map((item, index) => <div className="gym-equipment-editor" key={item.id}>
          <div className="gym-actions"><strong>Equipment {index + 1}</strong><button className="btn-icon" aria-label={`Remove equipment ${index + 1}`} onClick={() => setDraft({ ...draft, equipment: draft.equipment.filter((entry) => entry.id !== item.id) })}><Trash2 size={16} /></button></div>
          <label>Equipment name<input type="text" maxLength={120} value={item.name} onChange={(event) => changeEquipment(item.id, { name: event.target.value })} /></label>
          <label>Category<select value={item.category} onChange={(event) => changeEquipment(item.id, { category: event.target.value })}>{EQUIPMENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Details<input type="text" maxLength={500} placeholder="e.g. 5–100 lb, 5 lb increments; per hand" value={item.details} onChange={(event) => changeEquipment(item.id, { details: event.target.value })} /></label>
        </div>)}
        <button className="btn btn-secondary" disabled={draft.equipment.length >= 200} onClick={() => addEquipment()}>+ Custom equipment</button>
      </fieldset>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Modal>}
    {deleting && <Modal title={`Delete ${deleting.name}?`} onClose={() => !busy && setDeleting(null)} footer={<><button className="btn btn-secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button><button className="btn btn-danger" disabled={busy || templates.some((routine) => routine.gymId === deleting.id)} onClick={remove}>Delete gym</button></>}>
      <p>{templates.some((routine) => routine.gymId === deleting.id) ? 'Reassign or unassign routines using this gym before deleting it.' : 'This removes the gym and its equipment inventory.'}</p>{error && <p className="inline-error" role="alert">{error}</p>}
    </Modal>}
    {brief && <GymBrief gym={brief} onClose={() => setBrief(null)} />}
  </div>;
}
