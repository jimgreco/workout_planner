import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, X, Plus } from 'lucide-react';

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

function RestTimer({ startTime, duration }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startTime || duration) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startTime, duration]);

  const format = (sec) => {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (duration) return <span className="rest-time">{format(duration)}</span>;
  if (startTime) {
    const elapsed = Math.floor((now - startTime) / 1000);
    return <span className="rest-time live">{format(elapsed)}</span>;
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
  onSetWeightBlur,
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
                <span className="exercise-name">{ex.name}</span>
                <div className="exercise-meta">
                  <span className="badge">{ex.muscleGroup}</span>
                  {ex.personalBest?.weight && (
                    <span className="pb-label">
                      • PB: {ex.personalBest.weight} lbs
                    </span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className="flex gap-8 items-center card-actions" style={{ flexWrap: 'wrap' }}>
                  <select
                    value={item.weightType || 'weight'}
                    onChange={(e) => updateWeightType(idx, e.target.value)}
                    className="btn btn-secondary btn-sm"
                    style={{ height: 32, padding: '0 32px 0 12px', fontSize: 12, background: 'var(--surface)', flex: '1 1 auto', minWidth: '120px' }}
                  >
                    <option value="weight">Weight</option>
                    <option value="double">2 x Weight</option>
                    <option value="none">No Weight</option>
                  </select>
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
                </div>
              )}
            </div>
            <table className="sets-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>Set</th>
                  <th>Reps</th>
                  {showWeight && item.weightType !== 'none' && (
                    <th>{item.weightType === 'double' ? 'Weight (2x)' : 'Weight'}</th>
                  )}
                  <th style={{ width: 60, textAlign: 'right' }}>Rest</th>
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
                        placeholder={set.placeholderReps || "—"}
                        value={set.reps}
                        onChange={(e) => updateSet(idx, si, 'reps', e.target.value)}
                        onBlur={() => item.weightType === 'none' && onSetWeightBlur && onSetWeightBlur(idx, si)}
                        disabled={readOnly}
                      />
                    </td>
                    {showWeight && item.weightType !== 'none' && (
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="2.5"
                          placeholder={set.placeholderWeight || "—"}
                          value={set.weight}
                          onChange={(e) => updateSet(idx, si, 'weight', e.target.value)}
                          onBlur={() => onSetWeightBlur && onSetWeightBlur(idx, si)}
                          disabled={readOnly}
                        />
                      </td>
                    )}
                    <td style={{ textAlign: 'right', verticalAlign: 'middle', paddingRight: 8 }}>
                      <RestTimer startTime={set.restStartTime} duration={set.restDuration} />
                    </td>
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
          No exercises configured yet. Go to Exercises to add some first.
        </p>
      )}
    </div>
  );
}
