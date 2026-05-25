import { useState } from 'react';
import { BarChart3, Plus, Search, Star, Pencil, Trash2, Dumbbell } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import { saveExercise, deleteExercise } from '../api.js';
import { formatVolume, getExerciseHistory, personalBestLabel, setLabel, summarizeExercise } from '../progress.js';

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes',
  'Calves', 'Full Body', 'Cardio', 'Other',
];

const empty = () => ({ name: '', muscleGroup: 'Other', notes: '' });

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ExerciseTrend({ history }) {
  const data = [...history].reverse().map((entry) => entry.volume || entry.setCount);
  if (data.length < 2) {
    return (
      <div className="exercise-trend-empty">
        <BarChart3 size={28} />
      </div>
    );
  }

  const width = 420;
  const height = 132;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data.map((value, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 18) - 9;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="exercise-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Exercise trend">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(' ').map((point) => {
        const [x, y] = point.split(',');
        return <circle key={point} cx={x} cy={y} r="4" fill="var(--accent)" />;
      })}
    </svg>
  );
}

function ExerciseDetail({ exercise, logs }) {
  const summary = summarizeExercise(exercise, logs);
  const history = getExerciseHistory(exercise.id, logs);
  const bestLabel = summary.best ? setLabel(summary.best.set, summary.best.item.weightType) : '—';

  return (
    <div className="exercise-detail">
      <div className="exercise-detail-summary">
        <div className="detail-stat">
          <span>Sessions</span>
          <strong>{summary.sessions}</strong>
        </div>
        <div className="detail-stat">
          <span>Total Volume</span>
          <strong>{formatVolume(summary.totalVolume)}</strong>
        </div>
        <div className="detail-stat">
          <span>Total Sets</span>
          <strong>{summary.totalSets}</strong>
        </div>
        <div className="detail-stat">
          <span>Best Set</span>
          <strong>{bestLabel}</strong>
        </div>
      </div>

      <section className="detail-section">
        <h3>Trend</h3>
        <ExerciseTrend history={history} />
      </section>

      <section className="detail-section">
        <h3>Sessions</h3>
        {history.length === 0 ? (
          <p className="text-muted">No finished workouts include this exercise yet.</p>
        ) : (
          <div className="exercise-session-list">
            {history.map((entry) => (
              <div className="exercise-session" key={entry.id}>
                <div className="exercise-session-header">
                  <div>
                    <div className="progress-list-title">{entry.logName}</div>
                    <div className="progress-list-meta">{formatDate(entry.date)}</div>
                  </div>
                  <div className="progress-list-value">{formatVolume(entry.volume)}</div>
                </div>
                <div className="history-sets">
                  {entry.sets.map((set, index) => (
                    <span className="history-set" key={`${entry.id}-${index}`}>
                      {setLabel(set, entry.item.weightType)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Exercises({ exercises, logs = [], onUpdate }) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit' | 'pb'
  const [form, setForm]                 = useState(empty());
  const [search, setSearch]             = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [pbForm, setPbForm]             = useState(null);
  const [detailExercise, setDetailExercise] = useState(null);

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
      pbReps: ex.personalBest?.reps || '',
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
      delete exercise.pbReps;
      delete exercise.pbDate;
      if (pbForm.pbWeight) {
        const reps = pbForm.pbReps?.trim();
        const repsValue = Number.parseFloat(reps);
        exercise.personalBest = {
          weight: pbForm.pbWeight,
          ...(Number.isFinite(repsValue) && repsValue > 0 ? { reps } : {}),
          date: pbForm.pbDate,
        };
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
        <h1 style={{ marginBottom: 0 }}>Exercise Library</h1>
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
                    <Star size={12} fill="currentColor" /> {personalBestLabel(ex.personalBest)}
                  </span>
                )}
                {ex.notes && <span className="text-muted" style={{ fontSize: 13 }}>• {ex.notes}</span>}
              </div>
            </div>
            <div className="card-actions" style={{ display: 'flex', gap: 8 }}>
              <button className="btn-icon" title="View progress" onClick={() => setDetailExercise(ex)}>
                <BarChart3 size={16} />
              </button>
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
              <label>Reps (optional)</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 5"
                value={pbForm.pbReps}
                onChange={(e) => setPbForm({ ...pbForm, pbReps: e.target.value })}
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

      {detailExercise && (
        <Modal
          title={detailExercise.name}
          onClose={() => setDetailExercise(null)}
          footer={
            <button className="btn btn-primary" onClick={() => setDetailExercise(null)}>Done</button>
          }
        >
          <ExerciseDetail exercise={detailExercise} logs={logs} />
        </Modal>
      )}
    </div>
  );
}
