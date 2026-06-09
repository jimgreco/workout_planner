import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, X, Clock, Trophy, Clipboard, Trash2 } from 'lucide-react';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import Modal from '../components/Modal.jsx';
import { saveLog, deleteLog, saveExercise } from '../api.js';
import {
  bestPersonalBestSet,
  isPersonalBestImprovement,
  personalBestLabel,
  personalBestPayload,
} from '../progress.js';

/**
 * Find the most recent finished log containing a given exercise and return
 * its entry so we can pre-populate the new entry.
 */
function getLastItemForExercise(exerciseId, logs) {
  const finished = logs
    .filter((l) => l.status === 'finished')
    .sort((a, b) => (b.date > a.date ? 1 : -1));
  for (const log of finished) {
    const item = (log.exerciseItems || []).find((i) => i.exerciseId === exerciseId);
    if (item) return JSON.parse(JSON.stringify(item));
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
    const [activeExerciseIdx, setActiveExerciseIdx] = useState(0);
  const [activeSetIdx, setActiveSetIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishModal, setFinishModal]       = useState(null); // null | { pbExercises }
  const [restAlert, setRestAlert] = useState(null);
  const [elapsed, setElapsed]       = useState('');
  const isEditing = useRef(false);

  const saveTimer = useRef(null);
  const restAlertTimer = useRef(null);
  const latestItemsRef = useRef(items);
  const isActive = !!workoutId;
  const isPlanningMode = !!workoutId && !startTime && !isEditing.current;

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

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
    const active = logs.find((l) => l.status === 'active' || l.status === 'planning');
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
      const lastItem = getLastItemForExercise(item.exerciseId, logs);
      return {
        exerciseId: item.exerciseId,
        weightType: item.weightType || (lastItem?.weightType) || 'weight',
        restTargetSeconds: item.restTargetSeconds,
        supersetGroup: item.supersetGroup,
        sets: item.sets.map((s, si) => {
          const targetReps = s.reps || s.placeholderReps || String(settings.defaultReps);
          if (lastItem && lastItem.sets && si < lastItem.sets.length) {
            return { reps: '', weight: '', placeholderReps: `${lastItem.sets[si].reps} (${targetReps})`, placeholderWeight: lastItem.sets[si].weight };
          }
          return { reps: '', weight: '', placeholderReps: targetReps, placeholderWeight: '' };
        }),
      };
    });
    setName(initialTemplate.name);
    setItems(templateItems);
    enterPlanningMode(initialTemplate.name, templateItems);
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

  useEffect(() => () => clearTimeout(restAlertTimer.current), []);

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

  // ── Enter planning mode (exercises added but workout not yet started) ────
  function enterPlanningMode(workoutName, workoutItems) {
    const id = crypto.randomUUID();
    setWorkoutId(id);
    autoSave(id, {
      name: workoutName || name,
      date,
      notes,
      items: workoutItems || items,
      startTime: null,
      status: 'planning',
    });
  }

  // ── Start the workout (planning → active) ────────────────────────────────
  function handleStartWorkout() {
    if (!workoutId) return;
    const now = new Date().toISOString();
    setStartTime(now);
    autoSave(workoutId, { name, date, notes, items, startTime: now, status: 'active' });
  }

  // ── Handle exercise changes from WorkoutBuilder ──────────────────────────
  function handleItemsChange(newItems) {
    // If new exercise was added, pre-populate weights from last workout
    if (newItems.length > items.length) {
      const addedItem = newItems[newItems.length - 1];
      const lastItem = getLastItemForExercise(addedItem.exerciseId, logs);
      
      newItems = newItems.map((item, i) => {
        if (i !== newItems.length - 1) return item;
        
        const merged = item.sets.map((s, si) => {
          const targetReps = s.reps || s.placeholderReps || String(settings.defaultReps);
          if (lastItem && lastItem.sets && si < lastItem.sets.length) {
            return { reps: '', weight: '', placeholderReps: `${lastItem.sets[si].reps} (${targetReps})`, placeholderWeight: lastItem.sets[si].weight };
          }
          return { reps: '', weight: '', placeholderReps: targetReps, placeholderWeight: '' };
        });
        return { ...item, sets: merged, weightType: item.weightType || lastItem?.weightType || 'weight' };
      });
    }

    latestItemsRef.current = newItems;
    setItems(newItems);

    if (!workoutId && newItems.length > 0) {
      // First exercise added — enter planning mode
      const id = crypto.randomUUID();
      setWorkoutId(id);
      autoSave(id, { name, date, notes, items: newItems, startTime: null, status: 'planning' });
    } else if (workoutId) {
      const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
      scheduleAutoSave(workoutId, { name, date, notes, items: newItems, startTime, status });
    }
  }

  function handleItemsTextChange(newItems) {
    latestItemsRef.current = newItems;
    setItems(newItems);
    if (!workoutId && newItems.length > 0) {
      setWorkoutId(crypto.randomUUID());
    }
  }

  function handleItemsTextBlur() {
    if (!workoutId) return;
    const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
    scheduleAutoSave(workoutId, { name, date, notes, items: latestItemsRef.current, startTime, status });
  }

  
  function handleSetCompleted(exIdx, setIdx) {
    if (!workoutId) return;

    const targetEx = items[exIdx];
    const targetSet = targetEx.sets[setIdx];
    const hasValue = targetEx.weightType === 'none' ? !!targetSet.reps : !!targetSet.weight;
    if (!hasValue || targetSet.restStartTime || targetSet.restDuration) return;

    const now = Date.now();
    const newItems = items.map((ex, i) => ({
      ...ex,
      sets: ex.sets.map((s, si) => {
        if (i === exIdx && si === setIdx) {
          return { ...s, restStartTime: now, restDuration: null };
        }
        if (s.restStartTime && !s.restDuration) {
          return { ...s, restDuration: Math.floor((now - s.restStartTime) / 1000), restStartTime: null };
        }
        return s;
      }),
    }));

    // Determine next active set
    let nextEx = exIdx;
    let nextSet = setIdx + 1;
    if (nextSet >= newItems[exIdx].sets.length) {
      nextEx = exIdx + 1;
      nextSet = 0;
    }

    if (nextEx < newItems.length) {
      setActiveExerciseIdx(nextEx);
      setActiveSetIdx(nextSet);
    }

    setItems(newItems);
    const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
    scheduleAutoSave(workoutId, { name, date, notes, items: newItems, startTime, status });
  }

  function handleRestTargetReached(exIdx, setIdx) {
    const item = items[exIdx];
    if (!item?.restTargetSeconds) return;
    const exercise = exercises.find((ex) => ex.id === item.exerciseId);
    setRestAlert({
      id: `${Date.now()}-${exIdx}-${setIdx}`,
      message: `${exercise?.name || 'Exercise'} set ${setIdx + 1} rest target reached.`,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(160);
    }
    clearTimeout(restAlertTimer.current);
    restAlertTimer.current = setTimeout(() => setRestAlert(null), 5000);
  }

  function handleFieldChange(field, value) {
    if (field === 'name') setName(value);
    else if (field === 'date') setDate(value);
    else if (field === 'notes') setNotes(value);

    if (workoutId && field === 'date') {
      const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
      const data = { name, date, notes, items, startTime, status };
      data[field] = value;
      scheduleAutoSave(workoutId, data);
    }
  }

  function handleFieldBlur(field) {
    if (!workoutId) return;
    const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
    const data = { name, date, notes, items, startTime, status };
    if (field === 'name') data.name = name;
    if (field === 'notes') data.notes = notes;
    scheduleAutoSave(workoutId, data);
  }

  // ── Load template into active workout ────────────────────────────────────
  function loadTemplate(templateId) {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;

    const currentExerciseIds = new Set(items.map(item => item.exerciseId));
    
    const newItemsFromTemplate = (t.exerciseItems || [])
      .filter(item => !currentExerciseIds.has(item.exerciseId))
      .map((item) => {
        const lastItem = getLastItemForExercise(item.exerciseId, logs);
        return {
          exerciseId: item.exerciseId,
          weightType: item.weightType || lastItem?.weightType || 'weight',
          restTargetSeconds: item.restTargetSeconds,
          description: item.description,
          useIndividualReps: item.useIndividualReps,
          sets: item.sets.map((s, si) => {
            const targetReps = s.reps || s.placeholderReps || String(settings.defaultReps);
            const targetLeft = s.repsLeft || s.placeholderRepsLeft || targetReps;
            const targetRight = s.repsRight || s.placeholderRepsRight || targetReps;
            if (lastItem && lastItem.sets && si < lastItem.sets.length) {
              return {
                reps: '',
                repsLeft: '',
                repsRight: '',
                weight: '',
                placeholderReps: `${lastItem.sets[si].reps} (${targetReps})`,
                placeholderRepsLeft: `${lastItem.sets[si].repsLeft || lastItem.sets[si].reps || ''} (${targetLeft})`,
                placeholderRepsRight: `${lastItem.sets[si].repsRight || lastItem.sets[si].reps || ''} (${targetRight})`,
                placeholderWeight: lastItem.sets[si].weight,
              };
            }
            return {
              reps: '',
              repsLeft: '',
              repsRight: '',
              weight: '',
              placeholderReps: targetReps,
              placeholderRepsLeft: targetLeft,
              placeholderRepsRight: targetRight,
              placeholderWeight: '',
            };
          }),
        };
      });

    if (newItemsFromTemplate.length === 0) return;

    const combinedItems = [...items, ...newItemsFromTemplate];
    
    setItems(combinedItems);
    if (!name || name === '') {
      setName(t.name);
    }
    if (!workoutId) {
      enterPlanningMode(t.name, combinedItems);
    } else {
      const finalName = (!name || name === '') ? t.name : name;
      const status = isEditing.current ? 'finished' : (startTime ? 'active' : 'planning');
      scheduleAutoSave(workoutId, { name: finalName, date, notes, items: combinedItems, startTime, status });
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
      const pbExercises = [];
      let currentExercises = [...exercises];
      for (const item of items) {
        const candidate = bestPersonalBestSet(item.sets, item.weightType);
        const ex = currentExercises.find((e) => e.id === item.exerciseId);
        if (!ex || !isPersonalBestImprovement(candidate, ex.personalBest)) continue;
        const personalBest = personalBestPayload(candidate, date);
        if (personalBest) {
          pbExerciseIds.push(item.exerciseId);
          pbExercises.push(`${ex.name} - ${personalBestLabel(personalBest, ex.usesTime)}`);
          // Update the exercise's PB
          const updated = await saveExercise({
            ...ex,
            personalBest,
          });
          currentExercises = updated;
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
          pbExercises,
          duration: formatDuration(startTime, endTime),
          exerciseCount: items.length,
          setCount: items.reduce((acc, i) => acc + i.sets.length, 0),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPersonalBest(exercise) {
    const withoutPersonalBest = { ...exercise };
    delete withoutPersonalBest.personalBest;
    try {
      const updated = await saveExercise(withoutPersonalBest);
      onExercisesChanged(updated);
    } catch (error) {
      console.error('Failed to reset PB:', error);
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
    setRestAlert(null);
    clearTimeout(restAlertTimer.current);
    isEditing.current = false;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const showStartWorkout = isActive && items.length > 0 && isPlanningMode;
  const showFinishWorkout = isActive && items.length > 0 && !isPlanningMode;
  const canSubmitWorkout = !!name.trim();

  return (
    <div className={`page workout-log-page ${showStartWorkout ? 'has-sticky-action' : ''}`}>
      <header className="workout-page-header">
        <div className="workout-page-title-row">
          <div className="workout-page-title">
            <h1>
              {isEditing.current ? 'Edit Workout' : isPlanningMode ? 'Plan Workout' : 'Log Workout'}
            </h1>
            {isActive && startTime && !isEditing.current && (
              <div className="flex items-center gap-8 text-muted" style={{ marginTop: 2 }}>
                <Clock size={12} /> <span style={{ fontSize: 13 }}>In progress · {elapsed}</span>
              </div>
            )}
          </div>

          {isActive && (
            <button
              className="btn btn-secondary btn-sm workout-discard-button"
              onClick={() => setConfirmDiscard(true)}
              disabled={saving}
            >
              <X size={14} /> {isEditing.current ? 'Cancel' : isPlanningMode ? 'Discard Plan' : 'Discard'}
            </button>
          )}
        </div>

        {(showStartWorkout || showFinishWorkout) && (
          <div className="workout-page-primary-actions">
            {showStartWorkout && (
              <button
                className="btn btn-primary workout-primary-button workout-start-top"
                onClick={handleStartWorkout}
                disabled={!canSubmitWorkout}
              >
                <Check size={16} /> Start Workout
              </button>
            )}
            {showFinishWorkout && (
              <button
                className="btn btn-primary workout-primary-button"
                onClick={handleFinish}
                disabled={!canSubmitWorkout || saving}
              >
                <Check size={16} /> {saving ? 'Saving…' : isEditing.current ? 'Save Changes' : 'Finish Workout'}
              </button>
            )}
          </div>
        )}
      </header>

      {restAlert && (
        <div className="rest-alert" role="status" aria-live="polite">
          <Clock size={16} />
          <span>{restAlert.message}</span>
        </div>
      )}

      {showStartWorkout && (
        <div className="workout-sticky-action">
          <div className="workout-sticky-action-inner">
            <button
              className="btn btn-primary workout-sticky-button"
              onClick={handleStartWorkout}
              disabled={!canSubmitWorkout}
            >
              <Check size={16} /> Start Workout
            </button>
          </div>
        </div>
      )}

      <div className="form-row" style={{ marginTop: 12 }}>
        <div className="form-group" style={{ flex: 2 }}>
          <label>Workout Name</label>
          <input
            type="text"
            placeholder="e.g. Monday Push Day"
            value={name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            onBlur={() => handleFieldBlur('name')}
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
          <div className="input-with-icon">
            <Clipboard className="input-icon" size={16} />
            <select value="" onChange={(e) => loadTemplate(e.target.value)} style={{ paddingLeft: 36, fontSize: 14 }}>
              <option value="" disabled>Select a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {isActive && templates.length > 0 && (
        <div className="form-group">
          <label>Add from Template</label>
          <div className="input-with-icon">
            <Clipboard className="input-icon" size={16} />
            <select value="" onChange={(e) => loadTemplate(e.target.value)} style={{ paddingLeft: 36, fontSize: 14 }}>
              <option value="" disabled>Add exercises from template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <hr className="divider" style={{ opacity: 0.3, margin: '16px 0' }} />
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Exercises</h2>
      <WorkoutBuilder
        exercises={exercises}
        items={items}
        onChange={handleItemsChange}
        onTextChange={handleItemsTextChange}
        onTextBlur={handleItemsTextBlur}
        activeExerciseIdx={activeExerciseIdx}
        activeSetIdx={activeSetIdx}
        onSetCompleted={handleSetCompleted}
        onRestTargetReached={handleRestTargetReached}
        onResetPersonalBest={!isEditing.current && startTime ? handleResetPersonalBest : undefined}
        defaultSets={settings.defaultSets}
        defaultReps={settings.defaultReps}
        defaultRestTargetSeconds={settings.defaultRestTargetSeconds}
        planningMode={isPlanningMode}
      />

      <hr className="divider" style={{ opacity: 0.3, margin: '16px 0' }} />
      <div className="form-group">
        <label>Session Notes (optional)</label>
        <textarea
          rows={2}
          placeholder="How did it go? Any PRs, fatigue notes…"
          value={notes}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          onBlur={() => handleFieldBlur('notes')}
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
                <Trash2 size={16} /> {saving ? 'Discarding…' : isEditing.current ? 'Cancel Edit' : 'Discard Workout'}
              </button>
            </>
          }
        >
          <p>
            {isEditing.current
              ? 'Discard your changes and go back?'
              : isPlanningMode
              ? 'Discard this workout plan?'
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
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ background: 'var(--surface)', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent)' }}>
              <Trophy size={40} style={{ margin: '0 auto' }} />
            </div>
            <p style={{ fontSize: 20, fontWeight: 700 }}>Great job!</p>
            <p style={{ marginTop: 8 }}><strong>{name}</strong> — {finishModal.duration}</p>
            <p className="text-muted" style={{ marginTop: 4 }}>
              {finishModal.exerciseCount} exercise{finishModal.exerciseCount !== 1 ? 's' : ''} · {finishModal.setCount} total sets
            </p>
          </div>
          {finishModal.pbExercises.length > 0 && (
            <div style={{ marginTop: 12, padding: '16px', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg))', border: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))', borderRadius: 'var(--radius)' }}>
              <div className="flex items-center gap-8" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
                <Trophy size={16} fill="currentColor" /> <span>New Personal Bests!</span>
              </div>
              <ul style={{ margin: '0 0 0 24px', fontSize: 14 }}>
                {finishModal.pbExercises.map((name) => <li key={name} style={{ marginBottom: 4 }}>{name}</li>)}
              </ul>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
