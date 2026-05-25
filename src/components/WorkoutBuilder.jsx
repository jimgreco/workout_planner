import { useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, Check, X, Plus } from 'lucide-react';

/**
 * WorkoutBuilder — reusable component for building a workout's exercise list.
 * Used by both the Templates editor and the Workout Logger.
 *
 * Props:
 *   exercises       — full list of configured exercises
 *   items           — array of workout exercise items:
 *                     [{ exerciseId, sets: [{ reps, weight }] }]
 *   onChange(items)  — called with updated items
 *   readOnly         — if true, inputs are disabled (view mode)
 *   showWeight       — if true, show weight column (default true)
 *   defaultSets      — number of sets to add for a new exercise (default 4)
 *   defaultReps      — default rep value for new sets (default 8)
 */

const REST_TARGET_OPTIONS = [
  { value: 0, label: 'No target' },
  { value: 30, label: '0:30' },
  { value: 60, label: '1:00' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2:00' },
  { value: 180, label: '3:00' },
  { value: 300, label: '5:00' },
];

function formatRestDuration(sec) {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function restTargetLabel(seconds) {
  const option = REST_TARGET_OPTIONS.find((item) => item.value === seconds);
  return option?.label ?? formatRestDuration(seconds);
}

function RestTimer({ startTime, duration, targetSeconds = 0, onTargetReached }) {
  const [now, setNow] = useState(() => Date.now());
  const alertedRef = useRef(false);
  const hasDuration = duration !== undefined && duration !== null;

  useEffect(() => {
    alertedRef.current = false;
    if (!startTime || hasDuration) return undefined;
    const timeout = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
    };
  }, [startTime, hasDuration, targetSeconds]);

  const elapsed = startTime ? Math.max(0, Math.floor((now - startTime) / 1000)) : 0;
  const hasTarget = Number.isInteger(targetSeconds) && targetSeconds > 0;
  const overTarget = hasTarget && !hasDuration && startTime && elapsed >= targetSeconds;

  useEffect(() => {
    if (!overTarget || alertedRef.current) return;
    alertedRef.current = true;
    onTargetReached?.();
  }, [overTarget, onTargetReached]);

  if (hasDuration) return <span className="rest-time">{formatRestDuration(duration)}</span>;
  if (startTime) {
    if (hasTarget) {
      const remaining = targetSeconds - elapsed;
      const text = remaining >= 0 ? formatRestDuration(remaining) : `+${formatRestDuration(Math.abs(remaining))}`;
      return (
        <span className={`rest-time live ${remaining < 0 ? 'over-target' : 'target-countdown'}`}>
          {text}
        </span>
      );
    }
    return <span className="rest-time live">{formatRestDuration(elapsed)}</span>;
  }
  return <span className="rest-time" style={{ opacity: 0 }}>00:00</span>;
}

export default function WorkoutBuilder({
  exercises,
  items,
  onChange,
  readOnly = false,
  showWeight = true,
  defaultSets = 4,
  defaultReps = 8,
  activeExerciseIdx = null,
  activeSetIdx = null,
  onSetCompleted,
  onRestTargetReached,
  planningMode = false,
}) {
  function exById(id) {
    return exercises.find((e) => e.id === id);
  }

  function addExercise(exerciseId) {
    if (!exerciseId) return;
    if (items.some((i) => i.exerciseId === exerciseId)) return;
    const sets = Array.from({ length: defaultSets }, () => ({
      reps: String(defaultReps),
      weight: '',
    }));
    onChange([...items, { exerciseId, sets, weightType: 'weight' }]);
  }

  function removeExercise(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function updateWeightType(itemIdx, weightType) {
    const copy = items.map((item, i) =>
      i === itemIdx ? { ...item, weightType } : item
    );
    onChange(copy);
  }

  function updateRestTarget(itemIdx, value) {
    const seconds = Number(value);
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      if (!Number.isInteger(seconds) || seconds <= 0) {
        const withoutTarget = { ...item };
        delete withoutTarget.restTargetSeconds;
        return withoutTarget;
      }
      return { ...item, restTargetSeconds: seconds };
    });
    onChange(copy);
  }

  function addSet(itemIdx) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const lastSet = item.sets[item.sets.length - 1] || { reps: String(defaultReps), weight: '' };
      return { ...item, sets: [...item.sets, { reps: lastSet.reps, weight: lastSet.weight, placeholderReps: lastSet.placeholderReps, placeholderWeight: lastSet.placeholderWeight }] };
    });
    onChange(copy);
  }

  function removeSet(itemIdx, setIdx) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      if (item.sets.length <= 1) return item;
      return { ...item, sets: item.sets.filter((_, si) => si !== setIdx) };
    });
    onChange(copy);
  }

  function updateSet(itemIdx, setIdx, field, value) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      return {
        ...item,
        sets: item.sets.map((s, si) =>
          si === setIdx ? { ...s, [field]: value } : s,
        ),
      };
    });
    onChange(copy);
  }

  function moveItem(idx, dir) {
    const copy = [...items];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= copy.length) return;
    [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
    onChange(copy);
  }

  function setCanComplete(item, set) {
    if (planningMode || readOnly || set.restStartTime || set.restDuration) return false;
    if (item.weightType === 'none') return Boolean(set.reps);
    return Boolean(set.weight);
  }

  function setIsCompleted(set) {
    return Boolean(set.restStartTime || set.restDuration);
  }

  const usedIds = new Set(items.map((i) => i.exerciseId));
  const availableExercises = exercises
    .filter((e) => !usedIds.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {items.map((item, idx) => {
        const ex = exById(item.exerciseId);
        if (!ex) return null;
        return (
          <div key={item.exerciseId} className={`sets-block ${activeExerciseIdx === idx ? "active-exercise" : ""}`}>
            <div className="sets-block-header">
              <div className="sets-block-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="exercise-name">{ex.name}</span>
                  <span className="badge">{ex.muscleGroup}</span>
                  {ex.personalBest?.weight && (
                    <span className="pb-label">• PB: {ex.personalBest.weight} lbs</span>
                  )}
                  {!readOnly && (
                    <label className="rest-target-control">
                      <span>Rest</span>
                      <select
                        aria-label={`Rest target for ${ex.name}`}
                        value={item.restTargetSeconds || 0}
                        onChange={(e) => updateRestTarget(idx, e.target.value)}
                      >
                        {REST_TARGET_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {readOnly && item.restTargetSeconds > 0 && (
                    <span className="rest-target-chip">Rest {restTargetLabel(item.restTargetSeconds)}</span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className="action-buttons-group">
                  <button className="btn-icon" style={{ width: 32, height: 32 }} title="Move up" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                    <ArrowUp size={16} />
                  </button>
                  <button className="btn-icon" style={{ width: 32, height: 32 }} title="Move down" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}>
                    <ArrowDown size={16} />
                  </button>
                  <button className="btn-icon" style={{ width: 32, height: 32 }} title="Remove exercise" onClick={() => removeExercise(idx)}>
                    <X size={16} color="var(--danger)" />
                  </button>
                </div>
              )}
            </div>
            <table className="sets-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>Set</th>
                  <th>Reps</th>
                  {showWeight && (!readOnly || item.weightType !== 'none') && (
                    <th style={{ paddingTop: 0, paddingBottom: 0 }}>
                      {!readOnly ? (
                        <select
                          value={item.weightType || 'weight'}
                          aria-label={`Weight type for ${ex.name}`}
                          onChange={(e) => updateWeightType(idx, e.target.value)}
                          style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 16px 0 0', appearance: 'auto' }}
                        >
                          <option value="weight">Weight</option>
                          <option value="double">Weight (2x)</option>
                          <option value="none">No Weight</option>
                        </select>
                      ) : (
                        item.weightType === 'double' ? 'Weight (2x)' : 'Weight'
                      )}
                    </th>
                  )}
                  <th style={{ width: 60, textAlign: 'right' }}>Rest</th>
                  {!readOnly && !planningMode && <th style={{ width: 44 }}>Done</th>}
                  {!readOnly && <th style={{ width: 36 }}></th>}
                </tr>
              </thead>
              <tbody>
                {item.sets.map((set, si) => (
                  <tr key={si} className={activeExerciseIdx === idx && activeSetIdx === si ? 'active-row' : ''}>
                    <td className="set-num-cell">{si + 1}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={planningMode ? "—" : (set.placeholderReps || "—")}
                        value={planningMode ? (set.placeholderReps || '') : set.reps}
                        onChange={(e) => updateSet(idx, si, planningMode ? 'placeholderReps' : 'reps', e.target.value)}
                        disabled={readOnly}
                        style={planningMode ? { color: 'var(--text-muted)' } : undefined}
                      />
                    </td>
                    {showWeight && (!readOnly || item.weightType !== 'none') && (
                      <td>
                        {item.weightType !== 'none' && !planningMode && (
                          <input
                            type="number"
                            min="0"
                            step="2.5"
                            placeholder={set.placeholderWeight || "—"}
                            value={set.weight}
                            onChange={(e) => updateSet(idx, si, 'weight', e.target.value)}
                            disabled={readOnly}
                          />
                        )}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', verticalAlign: 'middle', paddingRight: 8 }}>
                      <RestTimer
                        startTime={set.restStartTime}
                        duration={set.restDuration}
                        targetSeconds={item.restTargetSeconds}
                        onTargetReached={() => onRestTargetReached?.(idx, si)}
                      />
                    </td>
                    {!readOnly && !planningMode && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`set-complete-btn ${setIsCompleted(set) ? 'completed' : ''}`}
                          onClick={() => onSetCompleted && onSetCompleted(idx, si)}
                          disabled={!setCanComplete(item, set)}
                          title={setIsCompleted(set) ? 'Set complete' : 'Complete set'}
                          aria-label={`Complete set ${si + 1} for ${ex.name}`}
                        >
                          <Check size={15} />
                        </button>
                      </td>
                    )}
                    {!readOnly && (
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ minWidth: 0, padding: 4, textDecoration: 'none' }}
                          onClick={() => removeSet(idx, si)}
                          disabled={item.sets.length <= 1}
                          title="Remove set"
                        >
                          <X size={16} color="var(--text-muted)" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {!readOnly && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 8, width: '100%', background: 'transparent', padding: '4px 8px' }}
                onClick={() => addSet(idx)}
              >
                <Plus size={12} /> Add Set
              </button>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div className="form-group mt-8">
          <label>Add Exercise</label>
          <div className="input-with-icon">
            <Plus className="input-icon" size={16} />
            <select
              value=""
              onChange={(e) => addExercise(e.target.value)}
              style={{ padding: '8px 12px 8px 36px', fontSize: 14 }}
            >
              <option value="" disabled>Select exercise to add…</option>
              {availableExercises.length === 0 && (
                <option disabled>No more exercises available</option>
              )}
              {availableExercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscleGroup})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {exercises.length === 0 && !readOnly && (
        <p className="text-muted" style={{ marginTop: 8 }}>
          No exercises configured yet. Go to Exercise Library to add some first.
        </p>
      )}
    </div>
  );
}
