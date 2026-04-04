/**
 * Seed script — populates exercises for a user in DynamoDB.
 * Useful for local development. Production seeding happens automatically
 * in the Lambda handler when a new user's first GET /exercises returns empty.
 *
 * Usage:  node backend/seed-exercises.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { DEFAULT_EXERCISES } from './src/default-exercises.mjs';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const db = DynamoDBDocumentClient.from(client);

const TABLE = process.env.TABLE_NAME || 'workout-planner';
const USER_SUB = process.env.USER_SUB || 'dev-user-local';
const PK = `USER#${USER_SUB}`;

console.log(`Seeding ${DEFAULT_EXERCISES.length} exercises into ${TABLE} (PK=${PK})...`);

let count = 0;
for (const ex of DEFAULT_EXERCISES) {
  const id = randomUUID();
  await db.send(new PutCommand({
    TableName: TABLE,
    Item: { PK, SK: `EXERCISE#${id}`, id, ...ex },
  }));
  count++;
}

console.log(`Done — ${count} exercises seeded.`);
