import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { saveExercise, deleteExercise } from '../api.js';

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Full Body', 'Cardio', 'Other',
];

const empty = () => ({ name: '', muscleGroup: 'Other', notes: '' });

export default function Exercises({ exercises, onUpdate }) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit'
  const [form, setForm]                 = useState(empty());
  const [search, setSearch]             = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]             = useState(false);

  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.muscleGroup.toLowerCase().includes(search.toLowerCase()),
  );

  function openAdd() { setForm(empty()); setModal('add'); }
  function openEdit(ex) { setForm({ ...ex }); setModal('edit'); }

  async function handleSave() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveExercise(form);
      onUpdate(updated);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      const updated = await deleteExercise(id);
      onUpdate(updated);
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>Exercises</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Exercise</button>
      </div>

      <div className="form-group mb-0">
        <input
          type="text"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🏋️</div>
            <p>{search ? 'No exercises match your search.' : 'No exercises yet. Add one to get started!'}</p>
          </div>
        )}
        {filtered.map((ex) => (
          <div key={ex.id} className="exercise-item">
            <div style={{ flex: 1 }}>
              <div className="ex-name">{ex.name}</div>
              {ex.notes && <div className="ex-group text-muted" style={{ marginTop: 2 }}>{ex.notes}</div>}
            </div>
            <span className="badge">{ex.muscleGroup}</span>
            <button className="btn-icon" title="Edit" onClick={() => openEdit(ex)}>✏️</button>
            <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(ex)}>🗑️</button>
          </div>
        ))}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'Add Exercise' : 'Edit Exercise'}
          onClose={() => !saving && setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim() || saving}>
                {saving ? 'Saving…' : modal === 'add' ? 'Add Exercise' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Exercise Name *</label>
            <input
              type="text"
              placeholder="e.g. Bench Press"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Muscle Group</label>
            <select value={form.muscleGroup} onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}>
              {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Any notes about this exercise…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete Exercise"
          onClose={() => !saving && setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete.id)} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
