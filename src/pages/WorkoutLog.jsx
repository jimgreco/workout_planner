import { useState } from 'react';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import Modal from '../components/Modal.jsx';
import { saveLog } from '../api.js';

export default function WorkoutLog({ exercises, templates, onSaved, initialTemplate, onClearTemplate }) {
  const today = new Date().toISOString().slice(0, 10);

  const [name, setName]   = useState(initialTemplate ? initialTemplate.name : '');
  const [date, setDate]   = useState(today);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(
    initialTemplate ? JSON.parse(JSON.stringify(initialTemplate.exerciseItems || [])) : [],
  );
  const [saving, setSaving]     = useState(false);
  const [savedModal, setSavedModal] = useState(false);

  function loadTemplate(templateId) {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    setName(t.name);
    setItems(JSON.parse(JSON.stringify(t.exerciseItems || [])));
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveLog({ name, date, notes, exerciseItems: items });
      onSaved(updated);
      setSavedModal(true);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setName('');
    setDate(today);
    setNotes('');
    setItems([]);
    if (onClearTemplate) onClearTemplate();
  }

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>Log Workout</h1>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={handleReset} disabled={saving}>Reset</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || items.length === 0 || saving}
          >
            {saving ? 'Saving…' : 'Save Workout'}
          </button>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 2 }}>
          <label>Workout Name *</label>
          <input
            type="text"
            placeholder="e.g. Monday Push Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {templates.length > 0 && (
        <div className="form-group">
          <label>Load from Template</label>
          <select value="" onChange={(e) => loadTemplate(e.target.value)}>
            <option value="" disabled>Select a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <hr className="divider" />
      <h2>Exercises</h2>
      <WorkoutBuilder exercises={exercises} items={items} onChange={setItems} />

      <hr className="divider" />
      <div className="form-group">
        <label>Session Notes (optional)</label>
        <textarea
          rows={3}
          placeholder="How did it go? Any PRs, fatigue notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {savedModal && (
        <Modal
          title="Workout Saved!"
          onClose={() => { setSavedModal(false); handleReset(); }}
          footer={
            <button className="btn btn-primary" onClick={() => { setSavedModal(false); handleReset(); }}>
              Log Another
            </button>
          }
        >
          <p><strong>{name}</strong> on {date} has been saved.</p>
          <p className="text-muted" style={{ marginTop: 8 }}>
            {items.length} exercise{items.length !== 1 ? 's' : ''} ·{' '}
            {items.reduce((acc, i) => acc + i.sets.length, 0)} total sets
          </p>
        </Modal>
      )}
    </div>
  );
}
