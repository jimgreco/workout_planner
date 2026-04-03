import { useState } from 'react';
import WorkoutBuilder from '../components/WorkoutBuilder';
import Modal from '../components/Modal';
import { saveLog } from '../store';

/**
 * WorkoutLog page — log a workout session, optionally from a template.
 *
 * Props:
 *   exercises      — full exercises list
 *   templates      — full templates list
 *   onSaved(logs)  — called after a workout is saved
 *   initialTemplate — optional template object to pre-populate
 *   onClearTemplate — callback to clear the pre-populated template
 */
export default function WorkoutLog({ exercises, templates, onSaved, initialTemplate, onClearTemplate }) {
  const today = new Date().toISOString().slice(0, 10);

  const [name, setName] = useState(initialTemplate ? initialTemplate.name : '');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(
    initialTemplate ? JSON.parse(JSON.stringify(initialTemplate.exerciseItems || [])) : [],
  );
  const [savedModal, setSavedModal] = useState(false);

  function loadTemplate(templateId) {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    setName(t.name);
    setItems(JSON.parse(JSON.stringify(t.exerciseItems || [])));
  }

  function handleSave() {
    if (!name.trim()) return;
    const log = { name, date, notes, exerciseItems: items };
    const updated = saveLog(log);
    onSaved(updated);
    setSavedModal(true);
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
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>Reset</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || items.length === 0}
          >
            Save Workout
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
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {templates.length > 0 && (
        <div className="form-group">
          <label>Load from Template</label>
          <select value="" onChange={(e) => loadTemplate(e.target.value)}>
            <option value="" disabled>Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <hr className="divider" />
      <h2>Exercises</h2>

      <WorkoutBuilder
        exercises={exercises}
        items={items}
        onChange={setItems}
      />

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
          <p>
            <strong>{name}</strong> on {date} has been saved successfully.
          </p>
          <p className="text-muted" style={{ marginTop: 8 }}>
            {items.length} exercise{items.length !== 1 ? 's' : ''} ·{' '}
            {items.reduce((acc, i) => acc + i.sets.length, 0)} total sets
          </p>
        </Modal>
      )}
    </div>
  );
}
