/**
 * Workout Planner API handler.
 *
 * Public routes:
 *   GET    /healthz
 *   POST   /auth/google
 *   POST   /auth/apple
 *
 * Authenticated routes require an app session token minted by the auth routes:
 *   GET    /exercises | /templates | /logs | /settings
 *   PUT    /exercises/:id | /templates/:id | /logs/:id | /settings
 *   DELETE /exercises/:id | /templates/:id | /logs/:id
 *   GET    /export
 *   POST   /feedback
 *   DELETE /account
 */

import { randomUUID } from 'node:crypto';
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
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DEFAULT_EXERCISES } from './default-exercises.mjs';
import { createAppSession, hashUserId, verifyAppSession } from './session.mjs';
import {
  MAX_BODY_BYTES,
  ValidationError,
  validateAuthBody,
  validateExercise,
  validateFeedback,
  validateId,
  validateLog,
  validateSettings,
  validateTemplate,
} from './validation.mjs';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB,
  region: process.env.AWS_REGION || 'us-east-1',
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
const IS_LOCAL = process.env.LOCAL_AUTH_BYPASS === 'true' || process.env.NODE_ENV === 'test';
const DEV_BYPASS_TOKEN = 'dev-bypass-token';
const DEV_USER_SUB = 'dev-user-local';

function audienceFor(audiences, provider) {
  if (audiences.length === 0) throw new Error(`${provider} audience not configured`);
  return audiences.length > 1 ? audiences : audiences[0];
}

function ok(body) {
  return response(200, body);
}

function created(body) {
  return response(201, body);
}

function noContent() {
  return {
    statusCode: 204,
    headers: securityHeaders(),
    body: '',
  };
}

function err(status, message) {
  return response(status, { error: message });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...securityHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  };
}

function strip({ PK, SK, ...rest }) {
  return rest;
}

function cleanPath(rawPath = '/') {
  const parts = rawPath
    .replace(/\?.*$/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts[0] === 'api') parts.shift();
  return parts;
}

function parseJsonBody(event) {
  const raw = event.body ?? '';
  const byteLength = Buffer.byteLength(raw, event.isBase64Encoded ? 'base64' : 'utf8');
  if (byteLength > MAX_BODY_BYTES) throw new ValidationError('Request body is too large');
  if (!raw) return {};
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

async function verifyGoogleCredential(credential) {
  const ticket = await gClient.verifyIdToken({
    idToken: credential,
    audience: audienceFor(GOOGLE_AUDIENCES, 'Google'),
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('Google token did not include a subject');
  return {
    sub: payload.sub,
    provider: 'google',
    name: payload.name ?? '',
    email: payload.email ?? '',
    picture: payload.picture ?? '',
  };
}

async function verifyAppleIdentityToken(identityToken, profile = {}) {
  const { payload } = await jwtVerify(identityToken, appleJWKS, {
    issuer: 'https://appleid.apple.com',
    audience: audienceFor(APPLE_AUDIENCES, 'Apple'),
  });
  if (!payload.sub) throw new Error('Apple token did not include a subject');
  return {
    sub: `apple:${payload.sub}`,
    provider: 'apple',
    name: profile.name || '',
    email: typeof payload.email === 'string' ? payload.email : (profile.email || ''),
    picture: profile.picture || '',
  };
}

async function handleAuth(provider, body) {
  const parsed = validateAuthBody(body, provider);
  const user = provider === 'google'
    ? await verifyGoogleCredential(parsed.credential)
    : await verifyAppleIdentityToken(parsed.identityToken, parsed.profile);
  return ok(await createAppSession(user));
}

async function verifyRequestUser(event) {
  const internalSecret = process.env.INTERNAL_SYNC_SECRET;
  const providedSecret = event.headers?.['x-internal-sync-secret'] || event.headers?.['X-Internal-Sync-Secret'];
  const internalUserId = event.headers?.['x-internal-user-id'] || event.headers?.['X-Internal-User-Id'];
  if (internalSecret && providedSecret === internalSecret && internalUserId) {
    if (typeof internalUserId !== 'string' || !/^[A-Za-z0-9:_-]{1,255}$/.test(internalUserId)) {
      throw new Error('Invalid session');
    }
    return internalUserId;
  }

  const header = event.headers?.authorization ?? event.headers?.Authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = header.slice(7);
  if (IS_LOCAL && token === DEV_BYPASS_TOKEN) return DEV_USER_SUB;
  const session = await verifyAppSession(token);
  return session.sub;
}

async function queryCollection(PK, prefix) {
  const result = await db.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': PK,
      ':prefix': `${prefix}#`,
    },
  }));
  return result.Items ?? [];
}

async function queryAllUserItems(PK) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await db.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PK },
      ExclusiveStartKey,
    }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function batchDelete(items) {
  for (let i = 0; i < items.length; i += 25) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: items.slice(i, i + 25).map(({ PK, SK }) => ({
          DeleteRequest: { Key: { PK, SK } },
        })),
      },
    }));
  }
}

async function seedDefaultExercises(PK) {
  const items = DEFAULT_EXERCISES.map((ex) => {
    const id = randomUUID();
    return { PK, SK: `EXERCISE#${id}`, id, ...ex };
  });
  for (let i = 0; i < items.length; i += 25) {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: items.slice(i, i + 25).map((item) => ({
          PutRequest: { Item: item },
        })),
      },
    }));
  }
  return items;
}

function validateResourceBody(resource, body, id) {
  if (resource === 'exercises') return validateExercise(body, id);
  if (resource === 'templates') return validateTemplate(body, id);
  if (resource === 'logs') return validateLog(body, id);
  throw new ValidationError('Unknown resource');
}

function exportPayload(items) {
  const data = {
    exportedAt: new Date().toISOString(),
    exercises: [],
    templates: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
    feedback: [],
  };
  for (const item of items) {
    if (item.SK === 'SETTINGS') data.settings = strip(item);
    else if (item.SK.startsWith('EXERCISE#')) data.exercises.push(strip(item));
    else if (item.SK.startsWith('TEMPLATE#')) data.templates.push(strip(item));
    else if (item.SK.startsWith('LOG#')) data.logs.push(strip(item));
    else if (item.SK.startsWith('FEEDBACK#')) data.feedback.push(strip(item));
  }
  return data;
}

async function handleAuthenticatedRoute(method, resource, id, event, PK) {
  if (resource === 'export' && method === 'GET' && !id) {
    return ok(exportPayload(await queryAllUserItems(PK)));
  }

  if (resource === 'account' && method === 'DELETE' && !id) {
    const items = await queryAllUserItems(PK);
    await batchDelete(items);
    return ok({ deleted: items.length });
  }

  if (resource === 'feedback' && method === 'POST' && !id) {
    const body = validateFeedback(parseJsonBody(event));
    const now = new Date().toISOString();
    const item = {
      PK,
      SK: `FEEDBACK#${now}#${randomUUID()}`,
      id: randomUUID(),
      createdAt: now,
      ...body,
    };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    return created(strip(item));
  }

  if (resource === 'settings') {
    if (method === 'GET' && !id) {
      const result = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { PK, SK: 'SETTINGS' },
      }));
      return ok(result.Item ? strip(result.Item) : DEFAULT_SETTINGS);
    }
    if (method === 'PUT' && !id) {
      const body = validateSettings(parseJsonBody(event));
      const item = { PK, SK: 'SETTINGS', ...body };
      await db.send(new PutCommand({ TableName: TABLE, Item: item }));
      return ok(strip(item));
    }
    return err(405, 'Method not allowed');
  }

  const prefix = SK_PREFIX[resource];
  if (!prefix) return err(404, 'Not found');

  if (method === 'GET' && !id) {
    let items = await queryCollection(PK, prefix);
    if (resource === 'exercises' && items.length === 0) {
      items = await seedDefaultExercises(PK);
    }
    return ok(items.map(strip));
  }

  if (method === 'PUT' && id) {
    validateId(id);
    const body = validateResourceBody(resource, parseJsonBody(event), id);
    const item = { PK, SK: `${prefix}#${id}`, ...body };
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    return ok(strip(item));
  }

  if (method === 'DELETE' && id) {
    validateId(id);
    await db.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK, SK: `${prefix}#${id}` },
    }));
    return noContent();
  }

  return err(405, 'Method not allowed');
}

export const handler = async (event) => {
  const startedAt = Date.now();
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';
  const [resource, id, ...rest] = cleanPath(rawPath);
  let userId;

  const finish = (result) => {
    console.log(JSON.stringify({
      event: 'request',
      method,
      path: `/${[resource, id].filter(Boolean).join('/')}`,
      statusCode: result.statusCode,
      user: hashUserId(userId),
      durationMs: Date.now() - startedAt,
    }));
    return result;
  };

  try {
    if (method === 'OPTIONS') return finish(noContent());
    if (rest.length > 0) return finish(err(404, 'Not found'));

    if (resource === 'healthz' && method === 'GET' && !id) {
      return finish(ok({
        ok: true,
        service: 'workout-planner-api',
        tableConfigured: Boolean(TABLE),
        timestamp: new Date().toISOString(),
      }));
    }

    if (resource === 'auth' && id && method === 'POST') {
      if (id !== 'google' && id !== 'apple') return finish(err(404, 'Not found'));
      try {
        return finish(await handleAuth(id, parseJsonBody(event)));
      } catch (error) {
        if (error instanceof ValidationError) return finish(err(400, error.message));
        return finish(err(401, 'Invalid credentials'));
      }
    }

    userId = await verifyRequestUser(event);
    return finish(await handleAuthenticatedRoute(method, resource, id, event, `USER#${userId}`));
  } catch (error) {
    if (error instanceof ValidationError) return finish(err(400, error.message));
    if (error?.message === 'Missing token' || error?.message === 'Invalid session') {
      return finish(err(401, 'Unauthorized'));
    }
    console.error(JSON.stringify({
      event: 'handler_error',
      method,
      path: rawPath,
      user: hashUserId(userId),
      message: error?.message ?? String(error),
    }));
    return finish(err(500, 'Internal server error'));
  }
};
