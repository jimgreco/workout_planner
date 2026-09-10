/**
 * Default exercises seeded for new users on their first GET /exercises.
 */
const exercises = [
  // Chest
  { name: 'Bench Press', muscleGroup: 'Chest', notes: 'Barbell flat bench' },
  { name: 'Incline Bench Press', muscleGroup: 'Chest', notes: 'Barbell incline bench' },
  { name: 'Dumbbell Bench Press', muscleGroup: 'Chest', notes: 'Flat bench with dumbbells' },
  { name: 'Incline Dumbbell Press', muscleGroup: 'Chest', notes: 'Incline bench with dumbbells' },
  { name: 'Chest Fly', muscleGroup: 'Chest', notes: 'Dumbbell or cable fly' },
  { name: 'Cable Crossover', muscleGroup: 'Chest', notes: '' },
  { name: 'Dips (Chest)', muscleGroup: 'Chest', notes: 'Lean forward to target chest' },

  // Back
  { name: 'Lat Pulldown', muscleGroup: 'Back', notes: '' },
  { name: 'Seated Cable Row', muscleGroup: 'Back', notes: '' },
  { name: 'Barbell Row', muscleGroup: 'Back', notes: 'Bent-over barbell row' },
  { name: 'Dumbbell Row', muscleGroup: 'Back', notes: 'Single-arm on bench' },
  { name: 'T-Bar Row', muscleGroup: 'Back', notes: '' },
  { name: 'Pull-Up', muscleGroup: 'Back', notes: '' },
  { name: 'Face Pull', muscleGroup: 'Back', notes: 'Cable with rope attachment' },

  // Shoulders
  { name: 'Overhead Press', muscleGroup: 'Shoulders', notes: 'Barbell standing or seated' },
  { name: 'Dumbbell Shoulder Press', muscleGroup: 'Shoulders', notes: 'Seated dumbbell press' },
  { name: 'Lateral Raise', muscleGroup: 'Shoulders', notes: 'Dumbbell or cable' },
  { name: 'Front Raise', muscleGroup: 'Shoulders', notes: '' },
  { name: 'Reverse Fly', muscleGroup: 'Shoulders', notes: 'Rear delt fly with dumbbells or cable' },
  { name: 'Arnold Press', muscleGroup: 'Shoulders', notes: '' },

  // Biceps
  { name: 'Barbell Curl', muscleGroup: 'Biceps', notes: '' },
  { name: 'Dumbbell Curl', muscleGroup: 'Biceps', notes: '' },
  { name: 'Hammer Curl', muscleGroup: 'Biceps', notes: 'Neutral grip dumbbell curl' },
  { name: 'Preacher Curl', muscleGroup: 'Biceps', notes: 'EZ bar or dumbbell' },
  { name: 'Cable Curl', muscleGroup: 'Biceps', notes: '' },
  { name: 'Incline Dumbbell Curl', muscleGroup: 'Biceps', notes: 'Seated on incline bench' },

  // Triceps
  { name: 'Tricep Pushdown', muscleGroup: 'Triceps', notes: 'Cable with bar or rope' },
  { name: 'Overhead Tricep Extension', muscleGroup: 'Triceps', notes: 'Dumbbell or cable' },
  { name: 'Skull Crusher', muscleGroup: 'Triceps', notes: 'EZ bar or dumbbells on flat bench' },
  { name: 'Close-Grip Bench Press', muscleGroup: 'Triceps', notes: '' },
  { name: 'Dips (Tricep)', muscleGroup: 'Triceps', notes: 'Upright torso to target triceps' },

  // Quads
  { name: 'Barbell Squat', muscleGroup: 'Quads', notes: 'Back squat' },
  { name: 'Front Squat', muscleGroup: 'Quads', notes: '' },
  { name: 'Leg Press', muscleGroup: 'Quads', notes: '' },
  { name: 'Leg Extension', muscleGroup: 'Quads', notes: '' },
  { name: 'Goblet Squat', muscleGroup: 'Quads', notes: 'Dumbbell or kettlebell' },
  { name: 'Bulgarian Split Squat', muscleGroup: 'Quads', notes: 'Rear foot elevated' },
  { name: 'Hack Squat', muscleGroup: 'Quads', notes: '' },
  { name: 'Walking Lunge', muscleGroup: 'Quads', notes: 'Dumbbell or barbell' },

  // Hamstrings
  { name: 'Romanian Deadlift', muscleGroup: 'Hamstrings', notes: 'Barbell or dumbbell' },
  { name: 'Leg Curl', muscleGroup: 'Hamstrings', notes: 'Seated or lying' },
  { name: 'Stiff-Leg Deadlift', muscleGroup: 'Hamstrings', notes: '' },
  { name: 'Good Morning', muscleGroup: 'Hamstrings', notes: 'Barbell on back' },

  // Glutes
  { name: 'Hip Thrust', muscleGroup: 'Glutes', notes: 'Barbell or smith machine' },
  { name: 'Cable Kickback', muscleGroup: 'Glutes', notes: '' },
  { name: 'Glute Bridge', muscleGroup: 'Glutes', notes: 'Bodyweight or weighted' },

  // Calves
  { name: 'Standing Calf Raise', muscleGroup: 'Calves', notes: 'Machine or smith machine' },
  { name: 'Seated Calf Raise', muscleGroup: 'Calves', notes: '' },

  // Core
  { name: 'Cable Crunch', muscleGroup: 'Core', notes: '' },
  { name: 'Hanging Leg Raise', muscleGroup: 'Core', notes: '' },
  { name: 'Ab Rollout', muscleGroup: 'Core', notes: 'Ab wheel' },
  { name: 'Plank', muscleGroup: 'Core', notes: '' },
  { name: 'Russian Twist', muscleGroup: 'Core', notes: 'Dumbbell or plate' },
  { name: 'Woodchop', muscleGroup: 'Core', notes: 'Cable or dumbbell' },

  // Forearms
  { name: 'Wrist Curl', muscleGroup: 'Forearms', notes: 'Barbell or dumbbell' },
  { name: 'Reverse Wrist Curl', muscleGroup: 'Forearms', notes: '' },
  { name: 'Farmer Walk', muscleGroup: 'Forearms', notes: 'Heavy dumbbells or trap bar' },

  // Full Body
  { name: 'Deadlift', muscleGroup: 'Full Body', notes: 'Conventional barbell deadlift' },
  { name: 'Clean and Press', muscleGroup: 'Full Body', notes: 'Barbell or dumbbell' },
  { name: 'Kettlebell Swing', muscleGroup: 'Full Body', notes: '' },

  // Cardio
  { name: 'Treadmill', muscleGroup: 'Cardio', notes: '' },
  { name: 'Stationary Bike', muscleGroup: 'Cardio', notes: '' },
  { name: 'Rowing Machine', muscleGroup: 'Cardio', notes: '' },
  { name: 'Stair Climber', muscleGroup: 'Cardio', notes: '' },
  { name: 'Elliptical', muscleGroup: 'Cardio', notes: '' },
];

const EQUIPMENT_BY_EXERCISE = {
  "Bench Press": [{"equipmentId": "eq-barbell-plates"}],
  "Incline Bench Press": [{"equipmentId": "eq-barbell-plates"}],
  "Dumbbell Bench Press": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Incline Dumbbell Press": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Chest Fly": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}, {"equipmentId": "eq-chest-fly-pec-deck"}],
  "Cable Crossover": [{"equipmentId": "eq-cable-crossover-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Dips (Chest)": [{"equipmentId": "eq-dip-station"}, {"equipmentId": "eq-assisted-pull-up-dip-machine"}],
  "Lat Pulldown": [{"equipmentId": "eq-lat-pulldown"}],
  "Seated Cable Row": [{"equipmentId": "eq-seated-cable-row"}],
  "Barbell Row": [{"equipmentId": "eq-barbell-plates"}],
  "Dumbbell Row": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "T-Bar Row": [{"equipmentId": "eq-t-bar-row-machine"}, {"equipmentId": "eq-landmine-attachment"}],
  "Pull-Up": [{"equipmentId": "eq-pull-up-bar"}, {"equipmentId": "eq-assisted-pull-up-dip-machine"}],
  "Face Pull": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Overhead Press": [{"equipmentId": "eq-barbell-plates"}],
  "Dumbbell Shoulder Press": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Lateral Raise": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-lateral-raise-machine"}],
  "Front Raise": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-weight-plates"}, {"equipmentId": "eq-cable-station"}],
  "Reverse Fly": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-dual-adjustable-pulley"}, {"equipmentId": "eq-rear-delt-fly-machine"}],
  "Arnold Press": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Barbell Curl": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-fixed-barbells"}],
  "Dumbbell Curl": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Hammer Curl": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Preacher Curl": [{"equipmentId": "eq-ez-curl-bar"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-biceps-curl-machine"}],
  "Cable Curl": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Incline Dumbbell Curl": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Tricep Pushdown": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Overhead Tricep Extension": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-cable-station"}],
  "Skull Crusher": [{"equipmentId": "eq-ez-curl-bar"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Close-Grip Bench Press": [{"equipmentId": "eq-barbell-plates"}],
  "Dips (Tricep)": [{"equipmentId": "eq-dip-station"}, {"equipmentId": "eq-assisted-pull-up-dip-machine"}],
  "Barbell Squat": [{"equipmentId": "eq-barbell-plates"}],
  "Front Squat": [{"equipmentId": "eq-barbell-plates"}],
  "Leg Press": [{"equipmentId": "eq-leg-press"}],
  "Leg Extension": [{"equipmentId": "eq-leg-extension"}],
  "Goblet Squat": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-kettlebells"}],
  "Bulgarian Split Squat": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-barbell-plates"}],
  "Hack Squat": [{"equipmentId": "eq-hack-squat-machine"}],
  "Walking Lunge": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}, {"equipmentId": "eq-barbell-plates"}],
  "Romanian Deadlift": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Leg Curl": [{"equipmentId": "eq-seated-leg-curl"}, {"equipmentId": "eq-lying-leg-curl"}, {"equipmentId": "eq-standing-leg-curl"}],
  "Stiff-Leg Deadlift": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Good Morning": [{"equipmentId": "eq-barbell-plates"}],
  "Hip Thrust": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-smith-machine"}, {"equipmentId": "eq-hip-thrust-machine"}],
  "Cable Kickback": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Glute Bridge": [],
  "Standing Calf Raise": [{"equipmentId": "eq-standing-calf-raise-machine"}, {"equipmentId": "eq-smith-machine"}],
  "Seated Calf Raise": [{"equipmentId": "eq-seated-calf-raise-machine"}],
  "Cable Crunch": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dual-adjustable-pulley"}],
  "Hanging Leg Raise": [{"equipmentId": "eq-pull-up-bar"}, {"equipmentId": "eq-dip-station"}],
  "Ab Rollout": [{"equipmentId": "eq-ab-wheel"}],
  "Plank": [],
  "Russian Twist": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-weight-plates"}, {"equipmentId": "eq-medicine-ball"}],
  "Woodchop": [{"equipmentId": "eq-cable-station"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Wrist Curl": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Reverse Wrist Curl": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Farmer Walk": [{"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-trap-bar"}, {"equipmentId": "eq-farmer-carry-handles"}],
  "Deadlift": [{"equipmentId": "eq-barbell-plates"}],
  "Clean and Press": [{"equipmentId": "eq-barbell-plates"}, {"equipmentId": "eq-dumbbells"}, {"equipmentId": "eq-adjustable-dumbbells"}],
  "Kettlebell Swing": [{"equipmentId": "eq-kettlebells"}],
  "Treadmill": [{"equipmentId": "eq-treadmill"}],
  "Stationary Bike": [{"equipmentId": "eq-stationary-bike"}, {"equipmentId": "eq-recumbent-bike"}, {"equipmentId": "eq-spin-bike"}],
  "Rowing Machine": [{"equipmentId": "eq-rowing-machine"}],
  "Stair Climber": [{"equipmentId": "eq-stair-climber"}, {"equipmentId": "eq-step-mill"}],
  "Elliptical": [{"equipmentId": "eq-elliptical"}]
};

export const DEFAULT_EXERCISES = exercises.map((exercise) => ({ ...exercise, equipmentAlternatives: EQUIPMENT_BY_EXERCISE[exercise.name] }));

// Enrich legacy preloaded exercises without overwriting any explicit user selection.
export function withDefaultEquipment(exercise) {
  if (exercise.equipmentAlternatives !== undefined) return exercise;
  const preset = DEFAULT_EXERCISES.find((item) => item.name === exercise.name && item.muscleGroup === exercise.muscleGroup);
  return preset ? { ...exercise, equipmentAlternatives: preset.equipmentAlternatives } : exercise;
}
