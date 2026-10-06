// A prescription, never a substitute for actual set.rir.
export function targetRIRForSet(item = {}, set = {}, exercise = {}) {
  const value = item.targetRIR;
  return !exercise.usesTime && set.setType !== 'warmup' && Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
}

export function targetGoalLabel(reps, targetRIR) {
  const text = String(reps ?? '').trim();
  const goal = (text.match(/\(([^)]*)\)\s*$/)?.[1] ?? text).replace(/(\d)\s*[-–]\s*(?=\d)/g, '$1–');
  const rir = Number.isInteger(targetRIR) && targetRIR >= 0 && targetRIR <= 10 ? targetRIR : null;
  if (!goal) return rir == null ? null : `Goal ${rir} RIR`;
  return `Goal ${goal}${rir == null ? '' : `+${rir}`}`;
}

export function setTargetGoalLabel(set, targetRIR) {
  const repGoal = value => {
    const text = String(value ?? '').trim();
    return (text.match(/\(([^)]*)\)\s*$/)?.[1] ?? text).trim();
  };
  const common = repGoal(set.placeholderReps);
  const left = repGoal(set.placeholderRepsLeft) || common;
  const right = repGoal(set.placeholderRepsRight) || common;
  const goal = left && right && left !== right ? `${left}/${right}` : left || right || common;
  return targetGoalLabel(goal, targetRIR);
}
