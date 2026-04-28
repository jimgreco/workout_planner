/**
 * Seed script — populates exercises and templates for a user in DynamoDB.
 * Useful for local development. Production seeding happens automatically
 * in the Lambda handler when a new user's first GET /exercises returns empty.
 *
 * Local usage (requires DynamoDB Local running on port 8000):
 *   node backend/seed-exercises.mjs
 *
 * Against real AWS (uses your default AWS credentials / profile):
 *   USE_AWS=true AWS_REGION=us-east-1 node backend/seed-exercises.mjs
 *   USE_AWS=true AWS_PROFILE=myprofile node backend/seed-exercises.mjs
 *
 * Optional env vars:
 *   TABLE_NAME  — DynamoDB table name (default: workout-planner)
 *   USER_SUB    — user sub to seed data for (default: dev-user-local)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { DEFAULT_EXERCISES } from './src/default-exercises.mjs';

const USE_AWS = process.env.USE_AWS === 'true';

const clientConfig = USE_AWS
  ? { region: process.env.AWS_REGION || 'us-east-1' }
  : {
      endpoint: 'http://localhost:8000',
      region: 'us-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    };

const db = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));

const TABLE = process.env.TABLE_NAME || 'workout-planner';
const USER_SUB = process.env.USER_SUB || 'dev-user-local';
const PK = `USER#${USER_SUB}`;

console.log(`Target: ${USE_AWS ? 'AWS' : 'localhost:8000'} — table=${TABLE} PK=${PK}`);

// ── Seed exercises ────────────────────────────────────────────────────────────
console.log(`\nSeeding ${DEFAULT_EXERCISES.length} exercises...`);

// Build a name→id map so templates can reference the same IDs
const exerciseIdByName = {};
for (const ex of DEFAULT_EXERCISES) {
  const id = randomUUID();
  exerciseIdByName[ex.name] = id;
  await db.send(new PutCommand({
    TableName: TABLE,
    Item: { PK, SK: `EXERCISE#${id}`, id, ...ex },
  }));
}

console.log(`Done — ${DEFAULT_EXERCISES.length} exercises seeded.`);

// ── Template definitions (reference exercises by name) ────────────────────────
const TEMPLATE_DEFS = [
  {
    name: 'Push Day',
    description: 'Chest, shoulders, triceps',
    exercises: [
      'Bench Press',
      'Incline Bench Press',
      'Chest Fly',
      'Overhead Press',
      'Lateral Raise',
      'Tricep Pushdown',
      'Skull Crusher',
    ],
  },
  {
    name: 'Pull Day',
    description: 'Back and biceps',
    exercises: [
      'Lat Pulldown',
      'Barbell Row',
      'Seated Cable Row',
      'Face Pull',
      'Barbell Curl',
      'Hammer Curl',
    ],
  },
  {
    name: 'Leg Day',
    description: 'Quads, hamstrings, glutes, calves',
    exercises: [
      'Barbell Squat',
      'Leg Press',
      'Leg Extension',
      'Romanian Deadlift',
      'Leg Curl',
      'Hip Thrust',
      'Standing Calf Raise',
    ],
  },
  {
    name: 'Upper Body',
    description: 'Full upper-body session',
    exercises: [
      'Bench Press',
      'Barbell Row',
      'Overhead Press',
      'Lat Pulldown',
      'Lateral Raise',
      'Barbell Curl',
      'Tricep Pushdown',
    ],
  },
  {
    name: 'Full Body',
    description: 'Compound-focused full-body session',
    exercises: [
      'Deadlift',
      'Barbell Squat',
      'Bench Press',
      'Barbell Row',
      'Overhead Press',
      'Pull-Up',
    ],
  },
];

// ── Seed templates ────────────────────────────────────────────────────────────
console.log(`\nSeeding ${TEMPLATE_DEFS.length} templates...`);

for (const def of TEMPLATE_DEFS) {
  const id = randomUUID();
  const exerciseItems = def.exercises
    .filter((name) => exerciseIdByName[name])
    .map((name) => ({
      exerciseId: exerciseIdByName[name],
      sets: Array.from({ length: 4 }, () => ({ reps: '8', weight: '' })),
    }));

  await db.send(new PutCommand({
    TableName: TABLE,
    Item: { PK, SK: `TEMPLATE#${id}`, id, name: def.name, description: def.description, exerciseItems },
  }));
  console.log(`  ✓ ${def.name} (${exerciseItems.length} exercises)`);
}

console.log(`\nDone — ${TEMPLATE_DEFS.length} templates seeded.`);
