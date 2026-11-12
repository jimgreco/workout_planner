export const EQUIPMENT_CATEGORIES = ['Free weights', 'Machines', 'Cables', 'Benches & racks', 'Cardio', 'Accessories', 'Other'];

export function equipmentAtGym(exercise, gym) {
  const refs = exercise?.equipmentAlternatives ?? [];
  if (!refs.length) return 'No equipment requirement recorded';
  const available = gym.equipment.filter((item) => refs.some((ref) => ref.gymId ? ref.gymId === gym.id && ref.equipmentId === item.id : ref.equipmentId === (item.equipmentId ?? item.id)));
  return available.length ? available.map((item) => item.name).join(' OR ') : 'No recorded alternative at this gym';
}

export function gymBrief(gym, routine, exercises = []) {
  const lines = [
    'Help me build a workout using this gym inventory.',
    'Use only the listed equipment and bodyweight. Do not assume unlisted machines, attachments, or weight ranges are available. Ask about anything missing.',
    'Equipment alternatives identify the main implement or station. Check that any supporting bench, rack, plates, or attachments needed for the movement are also available.',
    'Ask me about my goals, experience, weekly schedule, session length, and limitations before suggesting a plan.',
    '', `Gym: ${gym.name}`,
  ];
  if (gym.notes?.trim()) lines.push(`Gym notes: ${gym.notes.trim()}`);
  lines.push('', 'Equipment:');
  if (!gym.equipment.length) lines.push('No equipment recorded yet. Ask me to complete the inventory before planning.');
  for (const category of EQUIPMENT_CATEGORIES) {
    const items = gym.equipment.filter((item) => item.category === category);
    if (!items.length) continue;
    lines.push(category + ':');
    for (const item of items) lines.push(`- ${item.name}${item.details?.trim() ? ` — ${item.details.trim()}` : ''}`);
  }
  if (routine) {
    lines.push('', `Routine to adapt: ${routine.name}`);
    if (routine.description) lines.push(routine.description);
    for (const item of routine.exerciseItems ?? []) {
      const exercise = exercises.find((entry) => entry.id === item.exerciseId);
      lines.push(`- ${exercise?.name ?? item.exerciseId}`);
      for (const detail of routineItemDetails(item)) lines.push(`  ${detail}`);
      lines.push(`  Equipment: ${equipmentAtGym(exercise, gym)}`);
    }
    lines.push('Equipment entries are alternatives: any one listed option can be used. If no requirement is recorded, ask rather than assuming the exercise needs no equipment.');
    lines.push('Suggest changes before replacing any exercise. Preserve the intent of the routine.');
  }
  return lines.join('\n');
}

const text = (value) => String(value ?? '').trim();

function loadLabel(weight, weightType) {
  if (weightType === 'none') return 'bodyweight';
  if (!weight) return '';
  if (weightType === 'double') return `${weight} lb each side`;
  if (weightType === 'bar_double') return `${weight} lb per side on a 45 lb bar`;
  if (weightType === 'smith_double') return `${weight} lb per side on the Smith machine`;
  return `${weight} lb`;
}

function setLabel(set, weightType) {
  const left = text(set.repsLeft) || text(set.placeholderRepsLeft);
  const right = text(set.repsRight) || text(set.placeholderRepsRight);
  const reps = left || right ? `${left || '?'} left / ${right || '?'} right reps` : (text(set.reps) || text(set.placeholderReps)) ? `${text(set.reps) || text(set.placeholderReps)} reps` : 'reps not set';
  const load = loadLabel(text(set.weight) || text(set.placeholderWeight), weightType);
  const effort = [text(set.rir) && `RIR ${text(set.rir)}`, text(set.rpe) && `RPE ${text(set.rpe)}`].filter(Boolean).join(', ');
  return [reps, load && `@ ${load}`, effort && `(${effort})`].filter(Boolean).join(' ');
}

// Plain sets and reps the assistant can read, instead of the stored JSON.
// Internal ids and timer state are left out on purpose.
export function routineItemDetails(item = {}) {
  const groups = [];
  for (const set of item.sets ?? []) {
    const label = `${set.setType === 'warmup' ? 'warm-up: ' : ''}${setLabel(set, item.weightType)}`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.count += 1; else groups.push({ label, count: 1 });
  }
  const details = [groups.length ? `Sets: ${groups.map(({ label, count }) => `${count} × ${label}`).join('; ')}` : 'Sets: none prescribed yet'];
  const plan = [
    Number.isFinite(item.targetRIR) && `target ${item.targetRIR} reps in reserve on working sets`,
    item.restTargetSeconds > 0 && `rest ${item.restTargetSeconds}s`,
    text(item.supersetGroup) && `superset ${text(item.supersetGroup)}`,
  ].filter(Boolean);
  if (plan.length) details.push(`Plan: ${plan.join(', ')}`);
  const setup = item.setupProfile;
  const setupText = [text(setup?.machine), text(setup?.seat) && `seat ${text(setup.seat)}`, text(setup?.grip) && `grip ${text(setup.grip)}`].filter(Boolean).join(', ');
  if (setupText) details.push(`Setup: ${setupText}`);
  if (text(item.techniqueNote)) details.push(`Technique: ${text(item.techniqueNote)}`);
  if (text(item.description)) details.push(`Notes: ${text(item.description)}`);
  return details;
}
