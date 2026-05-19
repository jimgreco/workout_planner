/**
 * Workout Planner — Lambda handler
 *
 * Routes (all require a valid Google or Apple ID token in Authorization: Bearer <token>):
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
 *   PK  = USER#<providerUserId>
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
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { DEFAULT_EXERCISES } from './default-exercises.mjs';

console.log('Initializing DynamoDB with endpoint:', process.env.AWS_ENDPOINT_URL_DYNAMODB);
const db = DynamoDBDocumentClient.from(new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB,
  region: process.env.AWS_REGION
}));
const gClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const TABLE = process.env.TABLE_NAME;
const GOOGLE_AUDIENCES = (process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_CLIENT_ID ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const APPLE_AUDIENCES = (process.env.APPLE_CLIENT_IDS ?? process.env.APPLE_CLIENT_ID ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

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

function audienceFor(audiences, provider) {
  if (audiences.length === 0) throw new Error(`${provider} audience not configured`);
  return audiences.length > 1 ? audiences : audiences[0];
}

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = authHeader.slice(7);

  // Accept the dev bypass token only when running under `sam local start-api`.
  // AWS_SAM_LOCAL is never set on real Lambda, so this branch is unreachable in production.
  if (IS_LOCAL && token === DEV_BYPASS_TOKEN) return DEV_USER_SUB;

  const unverifiedPayload = decodeJwt(token);
  if (unverifiedPayload.iss === 'https://appleid.apple.com') {
    const { payload } = await jwtVerify(token, appleJWKS, {
      issuer: 'https://appleid.apple.com',
      audience: audienceFor(APPLE_AUDIENCES, 'Apple'),
      // Match the existing Google behavior, which allows old client-held ID tokens.
      currentDate: new Date(((unverifiedPayload.iat ?? Date.now() / 1000) * 1000)),
    });
    return `apple:${payload.sub}`;
  }

  const ticket = await gClient.verifyIdToken({
    idToken: token,
    audience: audienceFor(GOOGLE_AUDIENCES, 'Google'),
    // Effectively ignore expiry by allowing for a massive clock skew (e.g., 10 years)
    clockSkewSeconds: 10 * 365 * 24 * 60 * 60,
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

  // Verify Google ID token on every request (or trust internal secret)
  let userId;
  const internalSecret = process.env.INTERNAL_SYNC_SECRET;
  const providedSecret = event.headers?.['x-internal-sync-secret'] || event.headers?.['X-Internal-Sync-Secret'];
  const internalUserId = event.headers?.['x-internal-user-id'] || event.headers?.['X-Internal-User-Id'];

  if (internalSecret && providedSecret === internalSecret && internalUserId) {
    userId = internalUserId;
  } else {
    try {
      userId = await verifyToken(
        event.headers?.authorization ?? event.headers?.Authorization,
      );
    } catch {
      return err(401, 'Unauthorized');
    }
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
