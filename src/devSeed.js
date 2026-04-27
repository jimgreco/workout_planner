// Seed data for local dev (DEV_BYPASS mode). Mirrors a realistic first-time setup.

const EX = {
  benchPress:        'ex-0001-bench-press',
  inclineDB:         'ex-0002-incline-db-press',
  cableFly:          'ex-0003-cable-fly',
  overheadPress:     'ex-0004-overhead-press',
  lateralRaise:      'ex-0005-lateral-raise',
  tricepPushdown:    'ex-0006-tricep-pushdown',
  skullCrusher:      'ex-0007-skull-crusher',
  pullUp:            'ex-0008-pull-up',
  barbellRow:        'ex-0009-barbell-row',
  latPulldown:       'ex-0010-lat-pulldown',
  cableRow:          'ex-0011-cable-row',
  bicepCurl:         'ex-0012-bicep-curl',
  hammerCurl:        'ex-0013-hammer-curl',
  squat:             'ex-0014-squat',
  legPress:          'ex-0015-leg-press',
  romanianDeadlift:  'ex-0016-romanian-deadlift',
  legCurl:           'ex-0017-leg-curl',
  calfRaise:         'ex-0018-calf-raise',
  deadlift:          'ex-0019-deadlift',
  plank:             'ex-0020-plank',
  russianTwist:      'ex-0021-russian-twist',
};

export const seedExercises = [
  { id: EX.benchPress,       name: 'Bench Press',           muscleGroup: 'Chest',      notes: '' },
  { id: EX.inclineDB,        name: 'Incline Dumbbell Press', muscleGroup: 'Chest',     notes: '' },
  { id: EX.cableFly,         name: 'Cable Fly',             muscleGroup: 'Chest',      notes: 'Keep slight bend in elbows' },
  { id: EX.overheadPress,    name: 'Overhead Press',        muscleGroup: 'Shoulders',  notes: '' },
  { id: EX.lateralRaise,     name: 'Lateral Raise',         muscleGroup: 'Shoulders',  notes: '' },
  { id: EX.tricepPushdown,   name: 'Tricep Pushdown',       muscleGroup: 'Triceps',    notes: '' },
  { id: EX.skullCrusher,     name: 'Skull Crusher',         muscleGroup: 'Triceps',    notes: '' },
  { id: EX.pullUp,           name: 'Pull-up',               muscleGroup: 'Back',       notes: '' },
  { id: EX.barbellRow,       name: 'Barbell Row',           muscleGroup: 'Back',       notes: '' },
  { id: EX.latPulldown,      name: 'Lat Pulldown',          muscleGroup: 'Back',       notes: '' },
  { id: EX.cableRow,         name: 'Cable Row',             muscleGroup: 'Back',       notes: '' },
  { id: EX.bicepCurl,        name: 'Bicep Curl',            muscleGroup: 'Biceps',     notes: '' },
  { id: EX.hammerCurl,       name: 'Hammer Curl',           muscleGroup: 'Biceps',     notes: '' },
  { id: EX.squat,            name: 'Squat',                 muscleGroup: 'Quads',      notes: '' },
  { id: EX.legPress,         name: 'Leg Press',             muscleGroup: 'Quads',      notes: '' },
  { id: EX.romanianDeadlift, name: 'Romanian Deadlift',     muscleGroup: 'Hamstrings', notes: '' },
  { id: EX.legCurl,          name: 'Leg Curl',              muscleGroup: 'Hamstrings', notes: '' },
  { id: EX.calfRaise,        name: 'Calf Raise',            muscleGroup: 'Calves',     notes: '' },
  { id: EX.deadlift,         name: 'Deadlift',              muscleGroup: 'Back',       notes: '' },
  { id: EX.plank,            name: 'Plank',                 muscleGroup: 'Core',       notes: 'Time in seconds' },
  { id: EX.russianTwist,     name: 'Russian Twist',         muscleGroup: 'Core',       notes: '' },
];

function sets(n, reps, weight = '') {
  return Array.from({ length: n }, () => ({ reps: String(reps), weight: String(weight) }));
}

export const seedTemplates = [
  {
    id: 'tmpl-0001-push-a',
    name: 'Push A',
    description: 'Chest, shoulders, triceps — heavy pressing focus',
    exerciseItems: [
      { exerciseId: EX.benchPress,     weightType: 'lbs', sets: sets(4, 6, 185) },
      { exerciseId: EX.overheadPress,  weightType: 'lbs', sets: sets(3, 8, 95)  },
      { exerciseId: EX.inclineDB,      weightType: '2xlbs', sets: sets(3, 10, 65) },
      { exerciseId: EX.lateralRaise,   weightType: '2xlbs', sets: sets(3, 15, 20) },
      { exerciseId: EX.tricepPushdown, weightType: 'lbs', sets: sets(3, 12, 50) },
    ],
  },
  {
    id: 'tmpl-0002-push-b',
    name: 'Push B',
    description: 'Chest, shoulders, triceps — volume focus',
    exerciseItems: [
      { exerciseId: EX.inclineDB,      weightType: '2xlbs', sets: sets(4, 10, 60) },
      { exerciseId: EX.cableFly,       weightType: 'lbs', sets: sets(3, 15, 30) },
      { exerciseId: EX.overheadPress,  weightType: 'lbs', sets: sets(3, 10, 85)  },
      { exerciseId: EX.lateralRaise,   weightType: '2xlbs', sets: sets(4, 15, 15) },
      { exerciseId: EX.skullCrusher,   weightType: 'lbs', sets: sets(3, 12, 60) },
    ],
  },
  {
    id: 'tmpl-0003-pull-a',
    name: 'Pull A',
    description: 'Back and biceps — heavy row focus',
    exerciseItems: [
      { exerciseId: EX.deadlift,       weightType: 'lbs', sets: sets(3, 5, 275) },
      { exerciseId: EX.barbellRow,     weightType: 'lbs', sets: sets(4, 6, 155) },
      { exerciseId: EX.latPulldown,    weightType: 'lbs', sets: sets(3, 10, 120) },
      { exerciseId: EX.bicepCurl,      weightType: '2xlbs', sets: sets(3, 12, 35) },
    ],
  },
  {
    id: 'tmpl-0004-pull-b',
    name: 'Pull B',
    description: 'Back and biceps — pull-up and cable focus',
    exerciseItems: [
      { exerciseId: EX.pullUp,         weightType: 'none', sets: sets(4, 8) },
      { exerciseId: EX.cableRow,       weightType: 'lbs', sets: sets(3, 12, 130) },
      { exerciseId: EX.latPulldown,    weightType: 'lbs', sets: sets(3, 12, 110) },
      { exerciseId: EX.hammerCurl,     weightType: '2xlbs', sets: sets(3, 12, 35) },
    ],
  },
  {
    id: 'tmpl-0005-legs-a',
    name: 'Legs A',
    description: 'Quad-dominant lower body',
    exerciseItems: [
      { exerciseId: EX.squat,            weightType: 'lbs', sets: sets(4, 6, 225) },
      { exerciseId: EX.legPress,         weightType: 'lbs', sets: sets(3, 12, 360) },
      { exerciseId: EX.romanianDeadlift, weightType: 'lbs', sets: sets(3, 10, 155) },
      { exerciseId: EX.calfRaise,        weightType: 'lbs', sets: sets(4, 15, 135) },
    ],
  },
  {
    id: 'tmpl-0006-legs-b',
    name: 'Legs B',
    description: 'Hamstring and posterior chain focus',
    exerciseItems: [
      { exerciseId: EX.romanianDeadlift, weightType: 'lbs', sets: sets(4, 8, 175) },
      { exerciseId: EX.legCurl,          weightType: 'lbs', sets: sets(3, 12, 80) },
      { exerciseId: EX.squat,            weightType: 'lbs', sets: sets(3, 10, 185) },
      { exerciseId: EX.calfRaise,        weightType: 'lbs', sets: sets(3, 20, 115) },
    ],
  },
];
