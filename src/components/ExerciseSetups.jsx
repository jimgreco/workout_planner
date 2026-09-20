import { useState } from 'react';
import { exerciseSetups, setupLabel } from '../equipmentSetups.js';
import { saveExercise } from '../api.js';
import EquipmentSetupEditor from './EquipmentSetupEditor.jsx';

export default function ExerciseSetups({ exercise, logs, templates, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const profiles = exerciseSetups(exercise, logs, templates);
  async function save(profile) {
    const equipmentSetups = [...profiles.filter(entry => entry.id !== profile.id), profile];
    const updated = await saveExercise({ ...exercise, equipmentSetups });
    onUpdate(updated);
    setEditing(null);
  }
  return <section className="exercise-setups" aria-label={`Equipment setups for ${exercise.name}`}>
    <strong>Equipment setups</strong>
    {profiles.length === 0 && <small>No saved setups yet.</small>}
    {profiles.map(profile => <div className="exercise-setup-row" key={profile.id}>
      <div><span>{setupLabel(profile)}</span><small>{[profile.seat && `Seat: ${profile.seat}`, profile.grip, profile.loadConvention].filter(Boolean).join(' · ')}</small></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(profile)} aria-label={`Edit setup ${setupLabel(profile)}`}>Edit</button>
    </div>)}
    {!editing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({})}>Add setup</button>}
    {editing && <EquipmentSetupEditor key={editing.id || 'new'} profile={editing} onSave={save} onCancel={() => setEditing(null)} />}
  </section>;
}
