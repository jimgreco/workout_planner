/**
 * Default exercises seeded for new users on their first GET /exercises.
 */
export const DEFAULT_EXERCISES = [
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
