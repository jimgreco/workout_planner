import { useState } from 'react';
import Modal from '../components/Modal';
import WorkoutBuilder from '../components/WorkoutBuilder';
import { saveTemplate, deleteTemplate } from '../store';

const emptyTemplate = () => ({ name: '', description: '', exerciseItems: [] });

export default function Templates({ userId, templates, exercises, onUpdate, onStartWorkout }) {
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'view'
  const [form, setForm] = useState(emptyTemplate());
  const [confirmDelete, setConfirmDelete] = useState(null);

  function openAdd() {
    setForm(emptyTemplate());
    setModal('add');
  }

  function openEdit(t) {
    setForm({ ...t });
    setModal('edit');
  }

  function openView(t) {
    setForm({ ...t });
    setModal('view');
  }

  function handleSave() {
    if (!form.name.trim()) return;
    const updated = saveTemplate(userId, form);
    onUpdate(updated);
    setModal(null);
  }

  function handleDelete(id) {
    const updated = deleteTemplate(userId, id);
    onUpdate(updated);
    setConfirmDelete(null);
  }

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>Workout Templates</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ New Template</button>
      </div>

      {templates.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No templates yet. Create one to save your favourite workouts!</p>
        </div>
      )}

      {templates.map((t) => (
        <div key={t.id} className="card">
          <div className="card-header">
            <div>
              <h3>{t.name}</h3>
              {t.description && <p className="text-muted">{t.description}</p>}
            </div>
            <div className="flex gap-8 items-center">
              <button className="btn btn-secondary btn-sm" onClick={() => openView(t)}>View</button>
              <button className="btn btn-primary btn-sm" onClick={() => onStartWorkout(t)}>Start Workout</button>
              <button className="btn-icon" title="Edit" onClick={() => openEdit(t)}>✏️</button>
              <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(t)}>🗑️</button>
            </div>
          </div>
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            {(t.exerciseItems || []).map((item) => {
              const ex = exercises.find((e) => e.id === item.exerciseId);
              if (!ex) return null;
              return (
                <span key={item.exerciseId} className="badge">
                  {ex.name} ({item.sets.length} {item.sets.length === 1 ? 'set' : 'sets'})
                </span>
              );
            })}
            {(!t.exerciseItems || t.exerciseItems.length === 0) && (
              <span className="text-muted">No exercises added</span>
            )}
          </div>
        </div>
      ))}

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'New Template' : 'Edit Template'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!form.name.trim()}
              >
                {modal === 'add' ? 'Create Template' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Template Name *</label>
            <input
              type="text"
              placeholder="e.g. Push Day, Leg Day…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              placeholder="Brief description…"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <hr className="divider" />
          <h3>Exercises</h3>
          <WorkoutBuilder
            exercises={exercises}
            items={form.exerciseItems || []}
            onChange={(items) => setForm({ ...form, exerciseItems: items })}
          />
        </Modal>
      )}

      {modal === 'view' && (
        <Modal
          title={form.name}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setModal(null); onStartWorkout(form); }}>
                Start Workout
              </button>
            </>
          }
        >
          {form.description && <p className="text-muted" style={{ marginBottom: 14 }}>{form.description}</p>}
          <WorkoutBuilder
            exercises={exercises}
            items={form.exerciseItems || []}
            onChange={() => {}}
            readOnly
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete Template"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete.id)}>Delete</button>
            </>
          }
        >
          <p>Delete template <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
