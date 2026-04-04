import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import { saveTemplate, deleteTemplate, saveSettings } from '../api.js';

const emptyTemplate = () => ({ name: '', description: '', exerciseItems: [] });

export default function Templates({ templates, exercises, settings, onUpdate, onSettingsUpdate, onStartWorkout }) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit' | 'view' | 'settings'
  const [form, setForm]                 = useState(emptyTemplate());
  const [settingsForm, setSettingsForm] = useState({ ...settings });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  function openAdd()      { setForm(emptyTemplate()); setModal('add'); }
  function openEdit(t)    { setForm({ ...t }); setModal('edit'); }
  function openView(t)    { setForm({ ...t }); setModal('view'); }
  function openSettings() { setSettingsForm({ ...settings }); setModal('settings'); setSaved(false); }

  async function handleSave() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveTemplate(form);
      onUpdate(updated);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveSettings(settingsForm);
      onSettingsUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      const updated = await deleteTemplate(id);
      onUpdate(updated);
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  const settingsDirty = settingsForm.defaultSets !== settings.defaultSets || settingsForm.defaultReps !== settings.defaultReps;

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>Workout Templates</h1>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={openSettings}>⚙️ Settings</button>
          <button className="btn btn-primary" onClick={openAdd}>+ New Template</button>
        </div>
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
            <div className="flex gap-8 items-center card-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => openView(t)}>View</button>
              <button className="btn btn-primary btn-sm" onClick={() => onStartWorkout(t)}>Start</button>
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
          onClose={() => !saving && setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim() || saving}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Template' : 'Save Changes'}
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
            showWeight={false}
            defaultSets={settings.defaultSets}
            defaultReps={settings.defaultReps}
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
            showWeight={false}
          />
        </Modal>
      )}

      {modal === 'settings' && (
        <Modal
          title="Workout Defaults"
          onClose={() => !saving && setModal(null)}
          footer={
            <div className="flex gap-8 items-center justify-end" style={{ width: '100%' }}>
              {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved!</span>}
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={!settingsDirty || saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          }
        >
          <p className="text-muted" style={{ marginBottom: 20 }}>
            These values are used when adding a new exercise to a workout or template.
          </p>

          <div className="form-group">
            <label>Default Sets</label>
            <input
              type="number"
              min="1"
              max="20"
              value={settingsForm.defaultSets}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultSets: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="form-group">
            <label>Default Reps</label>
            <input
              type="number"
              min="1"
              max="100"
              value={settingsForm.defaultReps}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultReps: parseInt(e.target.value) || 1 })}
            />
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete Template"
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
          <p>Delete template <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
