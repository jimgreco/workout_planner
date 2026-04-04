import { useState, useEffect, useRef, useCallback } from 'react';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import Modal from '../components/Modal.jsx';
import { saveLog, deleteLog, saveExercise } from '../api.js';

/**
 * Find the most recent finished log containing a given exercise and return
 * its sets (with reps + weights) so we can pre-populate the new entry.
 */
function getLastSetsForExercise(exerciseId, logs) {
  const finished = logs
    .filter((l) => l.status === 'finished')
    .sort((a, b) => (b.date > a.date ? 1 : -1));
  for (const log of finished) {
    const item = (log.exerciseItems || []).find((i) => i.exerciseId === exerciseId);
    if (item) return item.sets.map((s) => ({ ...s }));
  }
  return null;
}

function formatDuration(startTime, endTime) {
  if (!startTime) return '';
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function WorkoutLog({
  exercises,
  templates,
  logs,
  settings,
  onLogsChanged,
  onExercisesChanged,
  initialTemplate,
  onClearTemplate,
  editingLog,
  onClearEditing,
}) {
  const today = new Date().toISOString().slice(0, 10);

  // ── State ────────────────────────────────────────────────────────────────────
  const [workoutId, setWorkoutId]   = useState(null);
  const [name, setName]             = useState('');
  const [date, setDate]             = useState(today);
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState([]);
  const [startTime, setStartTime]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishModal, setFinishModal]       = useState(null); // null | { pbExercises }
  const [elapsed, setElapsed]       = useState('');
  const isEditing = useRef(false);

  const saveTimer = useRef(null);
  const isActive = !!workoutId;

  // ── Resume active workout or load editing log ────────────────────────────
  useEffect(() => {
    if (editingLog) {
      isEditing.current = true;
      setWorkoutId(editingLog.id);
      setName(editingLog.name || '');
      setDate(editingLog.date || today);
      setNotes(editingLog.notes || '');
      setItems(JSON.parse(JSON.stringify(editingLog.exerciseItems || [])));
      setStartTime(editingLog.startTime || null);
      return;
    }
    // Check for an in-progress workout
    const active = logs.find((l) => l.status === 'active');
    if (active) {
      setWorkoutId(active.id);
      setName(active.name || '');
      setDate(active.date || today);
      setNotes(active.notes || '');
      setItems(JSON.parse(JSON.stringify(active.exerciseItems || [])));
      setStartTime(active.startTime || null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load initial template ────────────────────────────────────────────────
  useEffect(() => {
    if (!initialTemplate || isActive) return;
    const templateItems = (initialTemplate.exerciseItems || []).map((item) => {
      const lastSets = getLastSetsForExercise(item.exerciseId, logs);
      if (lastSets) return { exerciseId: item.exerciseId, sets: lastSets };
      // Use template sets but fill defaults
      return {
        exerciseId: item.exerciseId,
        sets: item.sets.map((s) => ({ reps: s.reps || String(settings.defaultReps), weight: '' })),
      };
    });
    setName(initialTemplate.name);
    setItems(templateItems);
    startWorkout(initialTemplate.name, templateItems);
    if (onClearTemplate) onClearTemplate();
  }, [initialTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!startTime || isEditing.current) return;
    const tick = () => setElapsed(formatDuration(startTime));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [startTime]);

  // ── Auto-save on changes (debounced) ─────────────────────────────────────
  const autoSave = useCallback(async (id, data) => {
    try {
      const updated = await saveLog({
        id,
        name: data.name,
        date: data.date,
        notes: data.notes,
        exerciseItems: data.items,
        startTime: data.startTime,
        status: data.status || 'active',
      });
      onLogsChanged(updated);
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }, [onLogsChanged]);

  function scheduleAutoSave(id, data) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(id, data), 800);
  }

  // ── Start a new workout ──────────────────────────────────────────────────
  function startWorkout(workoutName, workoutItems) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setWorkoutId(id);
    setStartTime(now);
    autoSave(id, {
      name: workoutName || name,
      date,
      notes,
      items: workoutItems || items,
      startTime: now,
      status: 'active',
    });
  }

  // ── Handle exercise changes from WorkoutBuilder ──────────────────────────
  function handleItemsChange(newItems) {
    // If new exercise was added, pre-populate weights from last workout
    if (newItems.length > items.length) {
      const addedItem = newItems[newItems.length - 1];
      const lastSets = getLastSetsForExercise(addedItem.exerciseId, logs);
      if (lastSets) {
        newItems = newItems.map((item, i) => {
          if (i !== newItems.length - 1) return item;
          // Merge: use last workout's weights, keep the new set count structure
          const merged = item.sets.map((s, si) => {
            if (si < lastSets.length) {
              return { reps: s.reps, weight: lastSets[si].weight };
            }
            return s;
          });
          return { ...item, sets: merged };
        });
      }
    }

    setItems(newItems);

    if (!workoutId && newItems.length > 0) {
      // First exercise added — start the workout
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      setWorkoutId(id);
      setStartTime(now);
      autoSave(id, { name, date, notes, items: newItems, startTime: now, status: 'active' });
    } else if (workoutId) {
      scheduleAutoSave(workoutId, { name, date, notes, items: newItems, startTime, status: isEditing.current ? 'finished' : 'active' });
    }
  }

  function handleFieldChange(field, value) {
    if (field === 'name') setName(value);
    else if (field === 'date') setDate(value);
    else if (field === 'notes') setNotes(value);

    if (workoutId) {
      const data = { name, date, notes, items, startTime, status: isEditing.current ? 'finished' : 'active' };
      data[field] = value;
      scheduleAutoSave(workoutId, data);
    }
  }

  // ── Load template into active workout ────────────────────────────────────
  function loadTemplate(templateId) {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    const templateItems = (t.exerciseItems || []).map((item) => {
      const lastSets = getLastSetsForExercise(item.exerciseId, logs);
      if (lastSets) return { exerciseId: item.exerciseId, sets: lastSets };
      return {
        exerciseId: item.exerciseId,
        sets: item.sets.map((s) => ({ reps: s.reps || String(settings.defaultReps), weight: '' })),
      };
    });
    setName(t.name);
    setItems(templateItems);
    if (!workoutId) {
      startWorkout(t.name, templateItems);
    } else {
      scheduleAutoSave(workoutId, { name: t.name, date, notes, items: templateItems, startTime, status: 'active' });
    }
  }

  // ── Finish workout ───────────────────────────────────────────────────────
  async function handleFinish() {
    if (!workoutId || saving) return;
    clearTimeout(saveTimer.current);
    setSaving(true);

    try {
      const endTime = isEditing.current ? (editingLog?.endTime || new Date().toISOString()) : new Date().toISOString();

      // Check for personal bests
      const pbExerciseIds = [];
      for (const item of items) {
        const maxWeight = Math.max(...item.sets.map((s) => parseFloat(s.weight) || 0));
        if (maxWeight <= 0) continue;
        const ex = exercises.find((e) => e.id === item.exerciseId);
        if (!ex) continue;
        const currentPB = parseFloat(ex.personalBest?.weight) || 0;
        if (maxWeight > currentPB) {
          pbExerciseIds.push(item.exerciseId);
          // Update the exercise's PB
          const updated = await saveExercise({
            ...ex,
            personalBest: { weight: String(maxWeight), date },
          });
          onExercisesChanged(updated);
        }
      }

      const logData = {
        id: workoutId,
        name,
        date,
        notes,
        exerciseItems: items,
        startTime,
        endTime,
        status: 'finished',
        hasPB: pbExerciseIds.length > 0,
        pbExerciseIds,
      };

      const updated = await saveLog(logData);
      onLogsChanged(updated);

      if (isEditing.current) {
        // Done editing — just reset
        resetWorkout();
        if (onClearEditing) onClearEditing();
      } else {
        setFinishModal({
          pbExercises: pbExerciseIds.map((id) => exercises.find((e) => e.id === id)?.name).filter(Boolean),
          duration: formatDuration(startTime, endTime),
          exerciseCount: items.length,
          setCount: items.reduce((acc, i) => acc + i.sets.length, 0),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Discard workout ──────────────────────────────────────────────────────
  async function handleDiscard() {
    if (!workoutId) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    try {
      if (isEditing.current) {
        if (onClearEditing) onClearEditing();
      } else {
        const updated = await deleteLog(workoutId);
        onLogsChanged(updated);
      }
    } finally {
      setSaving(false);
      resetWorkout();
      setConfirmDiscard(false);
    }
  }

  function resetWorkout() {
    setWorkoutId(null);
    setName('');
    setDate(today);
    setNotes('');
    setItems([]);
    setStartTime(null);
    setElapsed('');
    isEditing.current = false;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="action-row">
        <div>
          <h1 style={{ marginBottom: 0 }}>
            {isEditing.current ? 'Edit Workout' : 'Log Workout'}
          </h1>
          {isActive && startTime && !isEditing.current && (
            <p className="text-muted" style={{ marginTop: 4 }}>In progress · {elapsed}</p>
          )}
        </div>
        <div className="flex gap-8 action-buttons">
          {isActive && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDiscard(true)}
              disabled={saving}
            >
              {isEditing.current ? 'Cancel Edit' : 'Discard'}
            </button>
          )}
          {isActive && items.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleFinish}
              disabled={!name.trim() || saving}
            >
              {saving ? 'Saving…' : isEditing.current ? 'Save Changes' : 'Finish Workout'}
            </button>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 2 }}>
          <label>Workout Name</label>
          <input
            type="text"
            placeholder="e.g. Monday Push Day"
            value={name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => handleFieldChange('date', e.target.value)} />
        </div>
      </div>

      {!isActive && templates.length > 0 && (
        <div className="form-group">
          <label>Start from Template</label>
          <select value="" onChange={(e) => loadTemplate(e.target.value)}>
            <option value="" disabled>Select a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {isActive && templates.length > 0 && (
        <div className="form-group">
          <label>Load Template</label>
          <select value="" onChange={(e) => loadTemplate(e.target.value)}>
            <option value="" disabled>Add exercises from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <hr className="divider" />
      <h2>Exercises</h2>
      <WorkoutBuilder
        exercises={exercises}
        items={items}
        onChange={handleItemsChange}
        defaultSets={settings.defaultSets}
        defaultReps={settings.defaultReps}
      />

      <hr className="divider" />
      <div className="form-group">
        <label>Session Notes (optional)</label>
        <textarea
          rows={3}
          placeholder="How did it go? Any PRs, fatigue notes…"
          value={notes}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
        />
      </div>

      {/* Confirm discard modal */}
      {confirmDiscard && (
        <Modal
          title={isEditing.current ? 'Cancel Editing?' : 'Discard Workout?'}
          onClose={() => setConfirmDiscard(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDiscard(false)}>
                Keep {isEditing.current ? 'Editing' : 'Going'}
              </button>
              <button className="btn btn-danger" onClick={handleDiscard} disabled={saving}>
                {saving ? 'Discarding…' : isEditing.current ? 'Cancel Edit' : 'Discard Workout'}
              </button>
            </>
          }
        >
          <p>
            {isEditing.current
              ? 'Discard your changes and go back?'
              : 'This will delete the in-progress workout. This cannot be undone.'
            }
          </p>
        </Modal>
      )}

      {/* Finish modal */}
      {finishModal && (
        <Modal
          title="Workout Complete!"
          onClose={() => { setFinishModal(null); resetWorkout(); }}
          footer={
            <button className="btn btn-primary" onClick={() => { setFinishModal(null); resetWorkout(); }}>
              Done
            </button>
          }
        >
          <p><strong>{name}</strong> — {finishModal.duration}</p>
          <p className="text-muted" style={{ marginTop: 4 }}>
            {finishModal.exerciseCount} exercise{finishModal.exerciseCount !== 1 ? 's' : ''} · {finishModal.setCount} total sets
          </p>
          {finishModal.pbExercises.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: 'var(--accent-light)' }}>New Personal Bests!</strong>
              <ul style={{ margin: '6px 0 0 16px', fontSize: 13 }}>
                {finishModal.pbExercises.map((name) => <li key={name}>{name}</li>)}
              </ul>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
