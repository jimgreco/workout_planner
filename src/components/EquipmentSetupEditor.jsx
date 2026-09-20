import { useState } from 'react';
import { cleanSetup, setupDraft, setupFields } from '../equipmentSetups.js';

export default function EquipmentSetupEditor({ profile, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => setupDraft(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const valid = Boolean(draft.machine.trim()) && Object.keys(setupFields).every(key => draft[key].length <= 120);
  async function save() {
    setSaving(true);
    setError('');
    try { await onSave(cleanSetup(draft)); }
    catch (error) { setError(error.message || 'Could not save setup. Try again.'); }
    finally { setSaving(false); }
  }
  return <fieldset className="equipment-setup-editor" disabled={saving}>
    <legend>{profile?.id ? 'Edit equipment setup' : 'New equipment setup'}</legend>
    {Object.entries(setupFields).map(([key, label]) => <label key={key}>{label}
      <input type="text" maxLength={120} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
    </label>)}
    <small>Use a new setup when changing equipment or load conventions to keep comparisons separate. Past workouts keep their recorded settings.</small>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn btn-primary" disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : 'Save setup'}</button>
    <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
  </fieldset>;
}
