import { useState } from 'react';
import { Plus, Search, Star, Pencil, Trash2, Dumbbell } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { saveExercise, deleteExercise } from '../api.js';

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Full Body', 'Cardio', 'Other',
];

const empty = () => ({ name: '', muscleGroup: 'Other', notes: '' });

export default function Exercises({ exercises, onUpdate }) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit' | 'pb'
  const [form, setForm]                 = useState(empty());
  const [search, setSearch]             = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [pbForm, setPbForm]             = useState(null);

  const filtered = exercises
    .filter(
      (e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.muscleGroup.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  function openAdd() { setForm(empty()); setModal('add'); }
  function openEdit(ex) { setForm({ ...ex }); setModal('edit'); }
  function openPB(ex) {
    setPbForm({
      ...ex,
      pbWeight: ex.personalBest?.weight || '',
      pbDate: ex.personalBest?.date || new Date().toISOString().slice(0, 10),
    });
    setModal('pb');
  }

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

  async function handleSavePB() {
    if (!pbForm || saving) return;
    setSaving(true);
    try {
      const exercise = { ...pbForm };
      delete exercise.pbWeight;
      delete exercise.pbDate;
      if (pbForm.pbWeight) {
        exercise.personalBest = { weight: pbForm.pbWeight, date: pbForm.pbDate };
      } else {
        delete exercise.personalBest;
      }
      const updated = await saveExercise(exercise);
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
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={18} /> Add Exercise
        </button>
      </div>

      <div className="form-group mb-0" style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Dumbbell size={48} /></div>
            <p>{search ? 'No exercises match your search.' : 'No exercises yet. Add one to get started!'}</p>
          </div>
        )}
        {filtered.map((ex) => (
          <div key={ex.id} className="exercise-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ex-name">{ex.name}</div>
              <div className="ex-meta">
                <span className="badge">{ex.muscleGroup}</span>
                {ex.personalBest && (
                  <span className="pb-badge" onClick={() => openPB(ex)} title="Click to edit PB">
                    <Star size={12} fill="currentColor" /> {ex.personalBest.weight} lbs
                  </span>
                )}
                {ex.notes && <span className="text-muted" style={{ fontSize: 13 }}>• {ex.notes}</span>}
              </div>
            </div>
            <div className="card-actions" style={{ display: 'flex', gap: 8 }}>
              <button className="btn-icon" title="Edit PB" onClick={() => openPB(ex)}>
                <Star size={16} fill={ex.personalBest ? 'currentColor' : 'none'} />
              </button>
              <button className="btn-icon" title="Edit" onClick={() => openEdit(ex)}>
                <Pencil size={16} />
              </button>
              <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(ex)}>
                <Trash2 size={16} color="var(--danger)" />
              </button>
            </div>
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

      {modal === 'pb' && pbForm && (
        <Modal
          title={`Personal Best — ${pbForm.name}`}
          onClose={() => !saving && setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePB} disabled={saving}>
                {saving ? 'Saving…' : 'Save PB'}
              </button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-group">
              <label>Weight (lbs)</label>
              <input
                type="number"
                min="0"
                step="2.5"
                placeholder="e.g. 225"
                value={pbForm.pbWeight}
                onChange={(e) => setPbForm({ ...pbForm, pbWeight: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Date Achieved</label>
              <input
                type="date"
                value={pbForm.pbDate}
                onChange={(e) => setPbForm({ ...pbForm, pbDate: e.target.value })}
              />
            </div>
          </div>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Leave weight empty to clear the personal best. PBs are also tracked automatically when you finish workouts.
          </p>
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
