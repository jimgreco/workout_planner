export const EQUIPMENT_CATEGORIES = ['Free weights', 'Machines', 'Cables', 'Benches & racks', 'Cardio', 'Accessories', 'Other'];
export const QUICK_EQUIPMENT = [
  ['Dumbbells', 'Free weights'], ['Barbells & plates', 'Free weights'],
  ['Adjustable bench', 'Benches & racks'], ['Squat rack', 'Benches & racks'],
  ['Cable station', 'Cables'], ['Lat pulldown', 'Machines'],
  ['Leg press', 'Machines'], ['Smith machine', 'Machines'],
  ['Pull-up bar', 'Accessories'], ['Treadmill', 'Cardio'],
];

export function equipmentAtGym(exercise, gym) {
  const refs = exercise?.equipmentAlternatives ?? [];
  if (!refs.length) return 'No equipment requirement recorded';
  const available = gym.equipment.filter((item) => refs.some((ref) => ref.gymId === gym.id && ref.equipmentId === item.id));
  return available.length ? available.map((item) => item.name).join(' OR ') : 'No recorded alternative at this gym';
}

export function gymBrief(gym, routine, exercises = []) {
  const lines = [
    'Help me build a workout using this gym inventory.',
    'Use only the listed equipment and bodyweight. Do not assume unlisted machines, attachments, or weight ranges are available. Ask about anything missing.',
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
      const name = exercises.find((exercise) => exercise.id === item.exerciseId)?.name ?? item.exerciseId;
      lines.push(`- ${name}: ${JSON.stringify(item)}`);
      lines.push(`  Equipment: ${equipmentAtGym(exercises.find((exercise) => exercise.id === item.exerciseId), gym)}`);
    }
    lines.push('Equipment entries are alternatives: any one listed option can be used. If no requirement is recorded, ask rather than assuming the exercise needs no equipment.');
    lines.push('Suggest changes before replacing any exercise. Preserve the intent of the routine.');
  }
  return lines.join('\n');
}
