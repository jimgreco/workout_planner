/**
 * WorkoutBuilder — reusable component for building a workout's exercise list.
 * Used by both the Templates editor and the Workout Logger.
 *
 * Props:
 *   exercises      — full list of configured exercises
 *   items          — array of workout exercise items:
 *                    [{ exerciseId, sets: [{ reps, weight }] }]
 *   onChange(items) — called with updated items
 *   readOnly        — if true, inputs are disabled (view mode)
 */
export default function WorkoutBuilder({ exercises, items, onChange, readOnly = false, planning = false }) {
  function exById(id) {
    return exercises.find((e) => e.id === id);
  }

  function addExercise(exerciseId) {
    if (!exerciseId) return;
    if (items.some((i) => i.exerciseId === exerciseId)) return;
    onChange([...items, { exerciseId, sets: [{ reps: '', weight: '' }] }]);
  }

  function removeExercise(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function addSet(itemIdx) {
    const copy = items.map((item, i) => {
      if (i !== itemIdx) return item;
      const lastSet = item.sets[item.sets.length - 1] || { reps: '', weight: '' };
      return { ...item, sets: [...item.sets, { reps: lastSet.reps, weight: lastSet.weight }] };
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
  const availableExercises = exercises.filter((e) => !usedIds.has(e.id));

  return (
    <div>
      {items.map((item, idx) => {
        const ex = exById(item.exerciseId);
        if (!ex) return null;
        return (
          <div key={item.exerciseId} className="sets-block">
            <div className="sets-block-header">
              <div>
                <span style={{ fontWeight: 600 }}>{ex.name}</span>
                <span className="badge" style={{ marginLeft: 8 }}>{ex.muscleGroup}</span>
              </div>
              {!readOnly && (
                <div className="flex gap-8 items-center">
                  <button className="btn-icon" title="Move up" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>↑</button>
                  <button className="btn-icon" title="Move down" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}>↓</button>
                  <button className="btn-icon" title="Remove exercise" onClick={() => removeExercise(idx)}>✕</button>
                </div>
              )}
            </div>

            <table className="sets-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>Set</th>
                  <th>{planning ? 'Target Reps' : 'Reps'}</th>
                  <th>Weight (lbs)</th>
                  {!readOnly && <th style={{ width: 32 }}></th>}
                </tr>
              </thead>
              <tbody>
                {item.sets.map((set, si) => (
                  <tr key={si}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 6 }}>{si + 1}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={set.reps}
                        onChange={(e) => updateSet(idx, si, 'reps', e.target.value)}
                        disabled={readOnly}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="2.5"
                        placeholder="—"
                        value={set.weight}
                        onChange={(e) => updateSet(idx, si, 'weight', e.target.value)}
                        disabled={readOnly}
                        style={{ width: 100 }}
                      />
                    </td>
                    {!readOnly && (
                      <td>
                        <button
                          className="btn-icon"
                          onClick={() => removeSet(idx, si)}
                          disabled={item.sets.length <= 1}
                          title="Remove set"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {!readOnly && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => addSet(idx)}
              >
                + Add Set
              </button>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div className="form-group mt-8">
          <label>Add Exercise</label>
          <select
            value=""
            onChange={(e) => addExercise(e.target.value)}
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
      )}

      {exercises.length === 0 && !readOnly && (
        <p className="text-muted" style={{ marginTop: 8 }}>
          No exercises configured yet. Go to Exercises to add some first.
        </p>
      )}
    </div>
  );
}
