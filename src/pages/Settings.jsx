import { useState } from 'react';
import { saveSettings } from '../api.js';

export default function Settings({ settings, onUpdate }) {
  const [form, setForm]     = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveSettings(form);
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const dirty = form.defaultSets !== settings.defaultSets || form.defaultReps !== settings.defaultReps;

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="card">
        <h3>Workout Defaults</h3>
        <p className="text-muted" style={{ marginBottom: 14 }}>
          These values are used when adding a new exercise to a workout or template.
        </p>

        <div className="form-row">
          <div className="form-group">
            <label>Default Sets</label>
            <input
              type="number"
              min="1"
              max="20"
              value={form.defaultSets}
              onChange={(e) => setForm({ ...form, defaultSets: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="form-group">
            <label>Default Reps</label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.defaultReps}
              onChange={(e) => setForm({ ...form, defaultReps: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div className="flex gap-8 items-center" style={{ marginTop: 4 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}
