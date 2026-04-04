/**
 * Workout Planner — Lambda handler
 *
 * Routes (all require a valid Google ID token in Authorization: Bearer <token>):
 *   GET    /exercises          → list user's exercises
 *   PUT    /exercises/:id      → create or update an exercise
 *   DELETE /exercises/:id      → delete an exercise
 *   GET    /templates          → list user's workout templates
 *   PUT    /templates/:id      → create or update a template
 *   DELETE /templates/:id      → delete a template
 *   GET    /logs               → list user's workout logs
 *   PUT    /logs/:id           → create or update a log
 *   DELETE /logs/:id           → delete a log
 *   GET    /settings           → get user settings (singleton)
 *   PUT    /settings           → save user settings (singleton)
 *
 * DynamoDB key schema:
 *   PK  = USER#<googleSub>
 *   SK  = EXERCISE#<id> | TEMPLATE#<id> | LOG#<id> | SETTINGS
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  GetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { OAuth2Client } from 'google-auth-library';
import { DEFAULT_EXERCISES } from './default-exercises.mjs';

console.log('Initializing DynamoDB with endpoint:', process.env.AWS_ENDPOINT_URL_DYNAMODB);
const db = DynamoDBDocumentClient.from(new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB,
  region: process.env.AWS_REGION
}));
const gClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const TABLE = process.env.TABLE_NAME;

const SK_PREFIX = {
  exercises: 'EXERCISE',
  templates: 'TEMPLATE',
  logs: 'LOG',
};

const DEFAULT_SETTINGS = { defaultSets: 4, defaultReps: 8 };

// ── Auth ───────────────────────────────────────────────────────────────────────
const IS_LOCAL = process.env.AWS_SAM_LOCAL === 'true';
const DEV_BYPASS_TOKEN = 'dev-bypass-token';
const DEV_USER_SUB     = 'dev-user-local';

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = authHeader.slice(7);

  // Accept the dev bypass token only when running under `sam local start-api`.
  // AWS_SAM_LOCAL is never set on real Lambda, so this branch is unreachable in production.
  if (IS_LOCAL && token === DEV_BYPASS_TOKEN) return DEV_USER_SUB;

  const ticket = await gClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload().sub;
}

// ── Response helpers ──────────────────────────────────────────────────────────
function ok(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function noContent() {
  return { statusCode: 204, body: '' };
}
function err(status, message) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

// Strip DynamoDB-internal keys (PK, SK) from items before returning to client
function strip({ PK, SK, ...rest }) { return rest; }

// ── Main handler ──────────────────────────────────────────────────────────────
export const handler = async (event) => {
  const method = event.requestContext.http.method;

  // Parse path: /exercises  →  ['exercises']
  //             /exercises/uuid  →  ['exercises', 'uuid']
  const pathParts = event.rawPath.replace(/^\//, '').split('/');
  const resource = pathParts[0]; // 'exercises' | 'templates' | 'logs' | 'settings'
  const id = pathParts[1];       // uuid or undefined

  // Verify Google ID token on every request
  let userId;
  try {
    userId = await verifyToken(
      event.headers?.authorization ?? event.headers?.Authorization,
    );
  } catch {
    return err(401, 'Unauthorized');
  }

  const PK = `USER#${userId}`;

  try {
    // ── Settings (singleton — no collection pattern) ─────────────────────────
    if (resource === 'settings') {
      if (method === 'GET') {
        const result = await db.send(new GetCommand({
          TableName: TABLE,
          Key: { PK, SK: 'SETTINGS' },
        }));
        return ok(result.Item ? strip(result.Item) : DEFAULT_SETTINGS);
      }
      if (method === 'PUT') {
        const body = event.body ? JSON.parse(event.body) : {};
        const item = { PK, SK: 'SETTINGS', ...body };
        await db.send(new PutCommand({ TableName: TABLE, Item: item }));
        return ok(strip(item));
      }
      return err(405, 'Method not allowed');
    }

    // ── Collection resources ─────────────────────────────────────────────────
    const prefix = SK_PREFIX[resource];
    if (!prefix) return err(404, 'Not found');

    // ── GET /resource → list ─────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const result = await db.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk':     PK,
          ':prefix': `${prefix}#`,
        },
      }));

      // Auto-seed default exercises for new users
      if (resource === 'exercises' && result.Items.length === 0) {
        const items = DEFAULT_EXERCISES.map((ex) => {
          const id = crypto.randomUUID();
          return { PK, SK: `EXERCISE#${id}`, id, ...ex };
        });
        // BatchWrite in chunks of 25 (DynamoDB limit)
        for (let i = 0; i < items.length; i += 25) {
          await db.send(new BatchWriteCommand({
            RequestItems: {
              [TABLE]: items.slice(i, i + 25).map((item) => ({
                PutRequest: { Item: item },
              })),
            },
          }));
        }
        return ok(items.map(strip));
      }

      return ok(result.Items.map(strip));
    }

    // ── PUT /resource/:id → upsert ───────────────────────────────────────────
    if (method === 'PUT' && id) {
      const body = event.body ? JSON.parse(event.body) : {};
      const item = { PK, SK: `${prefix}#${id}`, ...body, id };
      await db.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(strip(item));
    }

    // ── DELETE /resource/:id → delete ────────────────────────────────────────
    if (method === 'DELETE' && id) {
      await db.send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK, SK: `${prefix}#${id}` },
      }));
      return noContent();
    }

    return err(405, 'Method not allowed');
  } catch (e) {
    console.error('Handler error:', e);
    return err(500, 'Internal server error');
  }
};
