import { Fragment, useId, useState, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, Check, X, Plus, RotateCcw, Pencil } from 'lucide-react';
import { personalBestLabel } from '../progress.js';

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

const SET_TYPE_OPTIONS = [
  { value: 'working', label: 'Working' },
  { value: 'warmup', label: 'Warmup' },
  { value: 'drop', label: 'Drop' },
  { value: 'failure', label: 'Failure' },
];

const SUPERSET_OPTIONS = [
  { value: '', label: 'No pairing' },
  { value: 'A', label: 'Superset A' },
  { value: 'B', label: 'Superset B' },
  { value: 'C', label: 'Superset C' },
  { value: 'D', label: 'Superset D' },
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

function supersetLabel(group) {
  return group ? `Superset ${group}` : 'No pairing';
}

function weightTypeLabel(weightType) {
  if (weightType === 'bar_double') return 'Bar + 2x';
  if (weightType === 'double') return 'Weight (2x)';
  if (weightType === 'none') return 'No Weight';
  return 'Weight';
}

function formatWeightNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function contextualWeightPlaceholder(weight, sourceWeightType, targetWeightType) {
  const raw = String(weight ?? '').trim();
  if (!raw) return '';
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;

  const sourceType = sourceWeightType || targetWeightType || 'weight';
  const targetType = targetWeightType || 'weight';
  let total = value;
  if (sourceType === 'double') total = value * 2;
  if (sourceType === 'bar_double') total = (value * 2) + 45;

  let contextualValue = total;
  if (targetType === 'double') contextualValue = total / 2;
  if (targetType === 'bar_double') contextualValue = Math.max(0, (total - 45) / 2);
  return formatWeightNumber(contextualValue);
}

function repRange(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(.*?)\s*[-–]\s*(.*?)$/);
  if (!match) return null;
  return { min: match[1], max: match[2] };
}

function repRangeValue(min, max, { preserveRange = false } = {}) {
  const cleanMin = String(min ?? '').trim();
  const cleanMax = String(max ?? '').trim();
  if (preserveRange) return `${cleanMin}-${cleanMax}`;
  if (cleanMin && cleanMax) return `${cleanMin}-${cleanMax}`;
  return cleanMin || cleanMax;
}

function firstFilledRepValue(values) {
  const value = values.find((entry) => entry !== undefined && entry !== null && String(entry).trim() !== '');
  return value ?? '';
}

function compactRepValue(set = {}, field) {
  if (field === 'placeholderReps') {
    if (set.placeholderReps !== undefined && set.placeholderReps !== null) return set.placeholderReps;
    return firstFilledRepValue([
      set.placeholderRepsLeft,
      set.repsLeft,
      set.placeholderRepsRight,
      set.repsRight,
      set.reps,
    ]);
  }
  if (field === 'placeholderRepsLeft') return set.placeholderRepsLeft ?? set.repsLeft ?? set.placeholderReps ?? set.reps ?? '';
  if (field === 'placeholderRepsRight') return set.placeholderRepsRight ?? set.repsRight ?? set.placeholderReps ?? set.reps ?? '';
  return set[field] ?? '';
}

function setRepField(set, field, value) {
  const next = { ...set, [field]: value };
  if (field === 'placeholderReps') {
    delete next.reps;
    delete next.repsLeft;
    delete next.repsRight;
    delete next.placeholderRepsLeft;
    delete next.placeholderRepsRight;
  }
  return next;
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
  onTextChange,
  onTextBlur,
  readOnly = false,
  showWeight = true,
  defaultSets = 4,
  defaultReps = 8,
  defaultRestTargetSeconds = 0,
  activeExerciseIdx = null,
  activeSetIdx = null,
  onSetCompleted,
  onRestTargetReached,
  onRestExtended,
  onEndRest,
  onResetPersonalBest,
  onEditExercise,
  planningMode = false,
  lastWeightTypeByExerciseId = {},
}) {
  const [exerciseSearch, setExerciseSearch] = useState('');
  const exerciseListId = useId();
  function exById(id) {
    return exercises.find((e) => e.id === id);
  }

  function addExercise(exerciseId) {
    if (!exerciseId) return;
    if (items.some((i) => i.exerciseId === exerciseId)) return;
    const exercise = exById(exerciseId);
    const setCount = exercise?.defaultSets || defaultSets;
    const repCount = exercise?.defaultReps || defaultReps;
    const weightType = lastWeightTypeByExerciseId[exerciseId] || 'weight';
    const useSideReps = Boolean(exercise?.isUnilateral) && !planningMode;
    const item = {
      exerciseId,
      sets: Array.from({ length: setCount }, () => ({
        reps: String(repCount),
        ...(useSideReps ? { repsLeft: String(repCount), repsRight: String(repCount) } : {}),
        weight: '',
      })),
      weightType,
      description: exercise?.description || '',
      useIndividualReps: false,
    };
    if (defaultRestTargetSeconds > 0) item.restTargetSeconds = defaultRestTargetSeconds;
    onChange([...items, item]);
    setExerciseSearch('');
  }

  function removeExercise(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function updateWeightType(itemIdx, weightType) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const previousWeightType = item.weightType || 'weight';
      const sets = previousWeightType === weightType
        ? item.sets
        : item.sets.map((set) => {
          if (!String(set.placeholderWeight ?? '').trim() || set.placeholderWeightType) return set;
          return { ...set, placeholderWeightType: previousWeightType };
        });
      return { ...item, weightType, sets };
    });
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

  function updateSupersetGroup(itemIdx, value) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      if (!value) {
        const withoutGroup = { ...item };
        delete withoutGroup.supersetGroup;
        return withoutGroup;
      }
      return { ...item, supersetGroup: value };
    });
    onChange(copy);
  }

  function addSet(itemIdx) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const lastSet = item.sets[item.sets.length - 1] || { reps: String(defaultReps), weight: '' };
      return {
        ...item,
        sets: [...item.sets, {
          reps: lastSet.reps,
          repsLeft: lastSet.repsLeft,
          repsRight: lastSet.repsRight,
          weight: lastSet.weight,
          placeholderReps: lastSet.placeholderReps,
          placeholderRepsLeft: lastSet.placeholderRepsLeft,
          placeholderRepsRight: lastSet.placeholderRepsRight,
          placeholderWeight: lastSet.placeholderWeight,
          placeholderWeightType: lastSet.placeholderWeightType,
        }],
      };
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

  function updateSet(itemIdx, setIdx, field, value, options = {}) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      return {
        ...item,
        sets: item.sets.map((s, si) =>
          si === setIdx ? setRepField(s, field, value) : s,
        ),
      };
    });
    if (options.textEntry && onTextChange) {
      onTextChange(copy);
    } else {
      onChange(copy);
    }
  }

  function handleSetTextFocus(itemIdx, setIdx, field) {
    const value = items[itemIdx]?.sets?.[setIdx]?.[field];
    if (readOnly || value === undefined || value === null || value === '') return;
    updateSet(itemIdx, setIdx, field, '', { textEntry: true });
  }

  function handleSetTextBlur() {
    onTextBlur?.();
  }

  function updateItem(itemIdx, patch) {
    onChange(items.map((item, i) => (i === itemIdx ? { ...item, ...patch } : item)));
  }

  function replaceExercise(itemIdx, exerciseId) {
    const replacement = exById(exerciseId);
    if (!replacement || items[itemIdx]?.exerciseId === exerciseId) return;
    onChange(items.map((item, i) => {
      if (i !== itemIdx) return item;
      const previousWeightType = item.weightType || 'weight';
      const weightType = lastWeightTypeByExerciseId[exerciseId] || previousWeightType;
      const sets = previousWeightType === weightType
        ? item.sets
        : item.sets.map((set) => {
          if (!String(set.placeholderWeight ?? '').trim() || set.placeholderWeightType) return set;
          return { ...set, placeholderWeightType: previousWeightType };
        });
      return { ...item, exerciseId, weightType, sets, description: item.description || replacement.description || '' };
    }));
  }

  function replacementExercises(itemIdx) {
    const currentId = items[itemIdx]?.exerciseId;
    const used = new Set(items.map((item) => item.exerciseId));
    return exercises
      .filter((exercise) => exercise.id === currentId || !used.has(exercise.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function updateAllSetReps(itemIdx, field, value) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      return {
        ...item,
        sets: item.sets.map((set) => setRepField(set, field, value)),
      };
    });
    onChange(copy);
  }

  function updateAllSetRepRange(itemIdx, field, side, value) {
    const item = items[itemIdx];
    const currentValue = compactRepValue(item?.sets?.[0], field);
    const current = repRange(currentValue) ?? { min: currentValue, max: '' };
    updateAllSetReps(itemIdx, field, repRangeValue(
      side === 'min' ? value : current.min,
      side === 'max' ? value : current.max,
      { preserveRange: true },
    ));
  }

  function setCompactRangeMode(itemIdx, fields, enabled) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const nextValues = Object.fromEntries(fields.map((field) => {
        const current = compactRepValue(item.sets[0], field);
        const range = repRange(current);
        return [
          field,
          enabled
            ? repRangeValue(range?.min ?? current, range?.max ?? current, { preserveRange: true })
            : (range?.min ?? current),
        ];
      }));
      return {
        ...item,
        sets: item.sets.map((set) => ({ ...set, ...nextValues })),
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
    if (item.weightType === 'none') return Boolean(set.reps || set.repsLeft || set.repsRight);
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
        const hasWeightColumn = showWeight && (!readOnly || item.weightType !== 'none');
        const isUnilateral = Boolean(ex.isUnilateral);
        const usesSideReps = isUnilateral && !planningMode;
        const usesTime = Boolean(ex.usesTime);
        const repUnit = usesTime ? 'secs' : 'reps';
        const repUnitTitle = usesTime ? 'Secs' : 'Reps';
        const repsField = planningMode ? 'placeholderReps' : 'reps';
        const firstSet = item.sets[0] || {};
        const compactRepsValue = compactRepValue(firstSet, repsField);
        const compactRepsRange = repRange(compactRepsValue);
        const compactUsesRange = Boolean(compactRepsRange);
        const setColumnCount = 3
          + (hasWeightColumn ? 1 : 0)
          + (!readOnly && !planningMode ? 1 : 0)
          + (!readOnly ? 1 : 0);
        return (
          <div key={item.exerciseId} className={`sets-block ${item.supersetGroup ? 'superset-member' : ''} ${activeExerciseIdx === idx ? "active-exercise" : ""}`}>
            <div className="sets-block-header">
              <div className="sets-block-info">
                <div className="exercise-meta">
                  <span className="exercise-name">{ex.name}</span>
                  <span className="badge">{ex.muscleGroup}</span>
                  {ex.personalBest?.weight && (
                    <span className="pb-label">
                      • PB: {personalBestLabel(ex.personalBest, ex.usesTime)}
                      {onResetPersonalBest && !planningMode && !readOnly && (
                        <button
                          type="button"
                          className="pb-reset-btn"
                          onClick={() => onResetPersonalBest(ex)}
                          title={`Reset PB for ${ex.name}`}
                        >
                          <RotateCcw size={11} /> Reset PB
                        </button>
                      )}
                    </span>
                  )}
                  {!readOnly && (
                    <label className="superset-control">
                      <span>Pair</span>
                      <select
                        aria-label={`Superset group for ${ex.name}`}
                        value={item.supersetGroup || ''}
                        onChange={(e) => updateSupersetGroup(idx, e.target.value)}
                      >
                        {SUPERSET_OPTIONS.map((option) => (
                          <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {readOnly && item.supersetGroup && (
                    <span className="superset-chip">{supersetLabel(item.supersetGroup)}</span>
                  )}
                  {!readOnly && (
                    <label className="substitution-control">
                      <span>Sub</span>
                      <select
                        aria-label={`Substitute ${ex.name}`}
                        value={item.exerciseId}
                        onChange={(e) => replaceExercise(idx, e.target.value)}
                      >
                        {replacementExercises(idx).map((replacement) => (
                          <option key={replacement.id} value={replacement.id}>{replacement.name}</option>
                        ))}
                      </select>
                    </label>
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
                  {!readOnly && planningMode && onEditExercise && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onEditExercise(ex)}
                    >
                      <Pencil size={13} /> Edit Exercise
                    </button>
                  )}
                </div>
                {(item.description || !readOnly) && (
                  <textarea
                    className="exercise-description-input"
                    rows={2}
                    placeholder="Exercise notes, cues, or substitution reason"
                    value={item.description ?? ex.description ?? ''}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    disabled={readOnly}
                  />
                )}
                {!readOnly && planningMode && (
                  <label className="checkbox-row compact-toggle">
                    <input
                      type="checkbox"
                      checked={!item.useIndividualReps}
                      onChange={(e) => updateItem(idx, { useIndividualReps: !e.target.checked })}
                    />
                    <span>Same {repUnit} target for every set</span>
                  </label>
                )}
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
            {planningMode && !item.useIndividualReps ? (
              <div className="routine-compact-reps">
                <label className="checkbox-row compact-range-toggle">
                  <input
                    type="checkbox"
                    checked={compactUsesRange}
                    onChange={(e) => {
                      setCompactRangeMode(idx, [repsField], e.target.checked);
                    }}
                  />
                  <span>Use {repUnit} range</span>
                </label>
                <div className="form-row">
                  {compactUsesRange ? (
                    <>
                      <label className="form-group">
                        <span>Min {repUnit}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={compactRepsRange?.min ?? compactRepsValue}
                          onChange={(e) => updateAllSetRepRange(idx, repsField, 'min', e.target.value)}
                        />
                      </label>
                      <label className="form-group">
                        <span>Max {repUnit}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={compactRepsRange?.max ?? ''}
                          onChange={(e) => updateAllSetRepRange(idx, repsField, 'max', e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="form-group">
                      <span>{repUnitTitle} for all sets</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={compactRepsValue}
                        onChange={(e) => updateAllSetReps(idx, repsField, e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="form-row compact-set-controls">
                  <span>{item.sets.length} {item.sets.length === 1 ? 'set' : 'sets'}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => addSet(idx)}>
                    <Plus size={12} /> Add Set
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeSet(idx, item.sets.length - 1)} disabled={item.sets.length <= 1}>
                    <X size={14} /> Remove Set
                  </button>
                </div>
              </div>
            ) : (
            <table className="sets-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>Set</th>
                  <th>{usesSideReps ? `${repUnitTitle} L/R` : repUnitTitle}</th>
                  {hasWeightColumn && (
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
                          <option value="bar_double">Bar + 2x</option>
                          <option value="none">No Weight</option>
                        </select>
                      ) : (
                        weightTypeLabel(item.weightType)
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
                  <Fragment key={si}>
                  <tr className={activeExerciseIdx === idx && activeSetIdx === si ? 'active-row' : ''}>
                    <td className="set-num-cell">{si + 1}</td>
                    <td>
                      {usesSideReps ? (
                        <div className="side-reps-inputs">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder={planningMode ? "L" : (set.placeholderRepsLeft || "L")}
                            value={planningMode ? (set.placeholderRepsLeft || '') : (set.repsLeft ?? '')}
                            onFocus={() => handleSetTextFocus(idx, si, planningMode ? 'placeholderRepsLeft' : 'repsLeft')}
                            onBlur={handleSetTextBlur}
                            onChange={(e) => updateSet(idx, si, planningMode ? 'placeholderRepsLeft' : 'repsLeft', e.target.value, { textEntry: true })}
                            disabled={readOnly}
                            aria-label={`Left ${repUnit} for set ${si + 1} of ${ex.name}`}
                            style={planningMode ? { color: 'var(--text-muted)' } : undefined}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder={planningMode ? "R" : (set.placeholderRepsRight || "R")}
                            value={planningMode ? (set.placeholderRepsRight || '') : (set.repsRight ?? '')}
                            onFocus={() => handleSetTextFocus(idx, si, planningMode ? 'placeholderRepsRight' : 'repsRight')}
                            onBlur={handleSetTextBlur}
                            onChange={(e) => updateSet(idx, si, planningMode ? 'placeholderRepsRight' : 'repsRight', e.target.value, { textEntry: true })}
                            disabled={readOnly}
                            aria-label={`Right ${repUnit} for set ${si + 1} of ${ex.name}`}
                            style={planningMode ? { color: 'var(--text-muted)' } : undefined}
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={planningMode ? "—" : (set.placeholderReps || "—")}
                          value={planningMode ? compactRepValue(set, repsField) : (set.reps ?? '')}
                          onFocus={() => handleSetTextFocus(idx, si, planningMode ? 'placeholderReps' : 'reps')}
                          onBlur={handleSetTextBlur}
                          onChange={(e) => updateSet(idx, si, planningMode ? 'placeholderReps' : 'reps', e.target.value, { textEntry: true })}
                          disabled={readOnly}
                          style={planningMode ? { color: 'var(--text-muted)' } : undefined}
                        />
                      )}
                    </td>
                    {hasWeightColumn && (
                      <td>
                        {item.weightType !== 'none' && !planningMode && (
                          <div className="weight-cell">
                            <input
                              type="number"
                              min="0"
                              step="2.5"
                              placeholder={contextualWeightPlaceholder(set.placeholderWeight, set.placeholderWeightType || item.weightType, item.weightType) || "—"}
                              value={set.weight}
                              onFocus={() => handleSetTextFocus(idx, si, 'weight')}
                              onBlur={handleSetTextBlur}
                              onChange={(e) => updateSet(idx, si, 'weight', e.target.value, { textEntry: true })}
                              disabled={readOnly}
                              aria-label={`Weight for set ${si + 1} of ${ex.name}`}
	                            />
                          </div>
                        )}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', verticalAlign: 'middle', paddingRight: 8 }}>
                      <div className="rest-cell-content">
                        <RestTimer
                          startTime={set.restStartTime}
                          duration={set.restDuration}
                          targetSeconds={set.restTargetSeconds || item.restTargetSeconds}
                          onTargetReached={() => onRestTargetReached?.(idx, si)}
                        />
                        {set.restStartTime && !set.restDuration && (
                          <div className="rest-actions">
                            <button
                              type="button"
                              className="rest-action-btn"
                              onClick={() => onRestExtended?.(idx, si, 30)}
                              title="Add 30 seconds"
                              aria-label={`Add 30 seconds to rest for set ${si + 1} of ${ex.name}`}
                            >
                              <Plus size={11} />30s
                            </button>
                            <button
                              type="button"
                              className="rest-action-btn"
                              onClick={() => onEndRest?.(idx, si)}
                              title="End rest"
                              aria-label={`End rest for set ${si + 1} of ${ex.name}`}
                            >
                              <Check size={11} />Ready
                            </button>
                          </div>
                        )}
                      </div>
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
                    {!readOnly && !planningMode && (
                      <tr className="set-effort-row">
                        <td aria-hidden="true"></td>
                        <td colSpan={setColumnCount - 1}>
                          <div className="set-effort-controls">
                            <label className="set-type-field">
                              <span>Type</span>
                              <select
                                value={set.setType || 'working'}
                                onChange={(e) => updateSet(idx, si, 'setType', e.target.value)}
                                aria-label={`Set type for set ${si + 1} of ${ex.name}`}
                              >
                                {SET_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>RPE</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                step="0.5"
                                placeholder="-"
                                value={set.rpe || ''}
                                onFocus={() => handleSetTextFocus(idx, si, 'rpe')}
                                onBlur={handleSetTextBlur}
                                onChange={(e) => updateSet(idx, si, 'rpe', e.target.value, { textEntry: true })}
                                aria-label={`RPE for set ${si + 1} of ${ex.name}`}
                              />
                            </label>
                            <label>
                              <span>RIR</span>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                step="1"
                                placeholder="-"
                                value={set.rir || ''}
                                onFocus={() => handleSetTextFocus(idx, si, 'rir')}
                                onBlur={handleSetTextBlur}
                                onChange={(e) => updateSet(idx, si, 'rir', e.target.value, { textEntry: true })}
                                aria-label={`RIR for set ${si + 1} of ${ex.name}`}
                              />
                            </label>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            )}

            {!readOnly && (!planningMode || item.useIndividualReps) && (
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
            <input
              type="text"
              list={exerciseListId}
              placeholder="Search exercises to add…"
              value={exerciseSearch}
              onChange={(e) => {
                const value = e.target.value;
                const selected = availableExercises.find((ex) => `${ex.name} (${ex.muscleGroup})` === value);
                if (selected) {
                  addExercise(selected.id);
                } else {
                  setExerciseSearch(value);
                }
              }}
              style={{ padding: '8px 12px 8px 36px', fontSize: 14 }}
            />
            <datalist id={exerciseListId}>
              {availableExercises.map((ex) => (
                <option key={ex.id} value={`${ex.name} (${ex.muscleGroup})`} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {exercises.length === 0 && !readOnly && (
        <p className="text-muted" style={{ marginTop: 8 }}>
          No exercises configured yet. Add exercises from the Program page first.
        </p>
      )}
    </div>
  );
}
