/**
 * Workout Planner API handler.
 *
 * Public routes:
 *   GET    /healthz
 *   GET    /version
 *   POST   /auth/google
 *   POST   /auth/apple
 *   GET    /admin/feedback | /admin/overview | /admin/accounts (requires X-Admin-Support-Secret)
 *
 * Authenticated routes require an app session token minted by the auth routes:
 *   GET    /exercises | /templates | /logs | /settings
 *   PUT    /exercises/:id | /templates/:id | /logs/:id | /settings
 *   DELETE /exercises/:id | /templates/:id | /logs/:id
 *   GET    /export
 *   POST   /import
 *   POST   /feedback
 *   DELETE /account
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  GetCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { emailAliasPk, normalizeEmail, isVerifiedEmail, resolveAccountUser } from './account-linking.mjs';
import { DEFAULT_EXERCISES } from './default-exercises.mjs';
import { createAppSession, hashUserId, verifyAppSession } from './session.mjs';
import {
  MAX_BODY_BYTES,
  ValidationError,
  validateAuthBody,
  validateExercise,
  validateFeedback,
  validateImport,
  validateId,
  validateLog,
  validateSettings,
  validateTemplate,
} from './validation.mjs';

let db = DynamoDBDocumentClient.from(new DynamoDBClient({
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
const SERVICE_NAME = 'workout-planner-api';
const BUILD_INFO = {
  service: SERVICE_NAME,
  version: process.env.APP_VERSION || '1.0.0',
  commit: process.env.GIT_COMMIT || process.env.SHORT_SHA || 'local',
  builtAt: process.env.BUILD_TIME || 'local',
};

export function __setTestDb(testDb) {
  if (process.env.NODE_ENV !== 'test') throw new Error('__setTestDb is test-only');
  db = testDb;
}

function audienceFor(audiences, provider) {
  if (audiences.length === 0) throw new Error(`${provider} audience not configured`);
  return audiences.length > 1 ? audiences : audiences[0];
}

function ok(body, headers = {}) {
  return response(200, body, headers);
}

function created(body, headers = {}) {
  return response(201, body, headers);
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

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...securityHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
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

function requestHeader(headers, name) {
  const lowerName = name.toLowerCase();
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === lowerName)?.[1];
}

function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function hasAdminSupportAccess(event) {
  return secretMatches(requestHeader(event.headers, 'x-admin-support-secret'), process.env.ADMIN_SUPPORT_SECRET);
}

function requestIdFrom(event) {
  const provided = requestHeader(event.headers, 'x-request-id');
  if (typeof provided === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(provided)) return provided;
  return randomUUID();
}

function attachRequestId(result, requestId) {
  const headers = {
    ...(result.headers ?? {}),
    'X-Request-Id': requestId,
  };
  let body = result.body;
  const contentType = headers['Content-Type'] || headers['content-type'] || '';
  if (result.statusCode >= 400 && body && contentType.includes('application/json')) {
    try {
      const payload = JSON.parse(body);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        body = JSON.stringify({ ...payload, requestId });
      }
    } catch {
      body = result.body;
    }
  }
  return { ...result, headers, body };
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

function queryParams(event, rawPath) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  if ([...params.keys()].length > 0) return params;
  const rawQuery = event.rawQueryString || rawPath.split('?')[1] || '';
  return new URLSearchParams(rawQuery);
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
    providerSub: payload.sub,
    provider: 'google',
    name: payload.name ?? '',
    email: payload.email ?? '',
    emailVerified: isVerifiedEmail(payload.email_verified),
    picture: payload.picture ?? '',
  };
}

async function verifyAppleIdentityToken(identityToken, profile = {}) {
  const { payload } = await jwtVerify(identityToken, appleJWKS, {
    issuer: 'https://appleid.apple.com',
    audience: audienceFor(APPLE_AUDIENCES, 'Apple'),
  });
  if (!payload.sub) throw new Error('Apple token did not include a subject');
  const providerSub = `apple:${payload.sub}`;
  return {
    sub: providerSub,
    providerSub,
    provider: 'apple',
    name: profile.name || '',
    email: typeof payload.email === 'string' ? payload.email : (profile.email || ''),
    emailVerified: isVerifiedEmail(payload.email_verified),
    picture: profile.picture || '',
  };
}

async function handleAuth(provider, body, event) {
  const parsed = validateAuthBody(body, provider);
  const requestedAccount = await verifyOptionalRequestSession(event);
  const user = provider === 'google'
    ? await verifyGoogleCredential(parsed.credential)
    : await verifyAppleIdentityToken(parsed.identityToken, parsed.profile);
  const accountUser = await resolveAccountUser({
    db,
    tableName: TABLE,
    user,
    requestedAccount,
  });
  return ok(await createAppSession(accountUser));
}

async function verifyRequestSession(event) {
  const internalSecret = process.env.INTERNAL_SYNC_SECRET;
  const providedSecret = requestHeader(event.headers, 'x-internal-sync-secret');
  const internalUserId = requestHeader(event.headers, 'x-internal-user-id');
  if (internalSecret && providedSecret === internalSecret && internalUserId) {
    if (typeof internalUserId !== 'string' || !/^[A-Za-z0-9:_-]{1,255}$/.test(internalUserId)) {
      throw new Error('Invalid session');
    }
    return { sub: internalUserId, provider: 'internal', name: '', email: '', picture: '' };
  }

  const header = requestHeader(event.headers, 'authorization');
  if (!header?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = header.slice(7);
  if (IS_LOCAL && token === DEV_BYPASS_TOKEN) {
    return { sub: DEV_USER_SUB, provider: 'demo', name: 'Dev User', email: 'dev@localhost', picture: '' };
  }
  return verifyAppSession(token);
}

async function verifyOptionalRequestSession(event) {
  const hasBearer = requestHeader(event.headers, 'authorization')?.startsWith('Bearer ');
  const hasInternalSecret = Boolean(requestHeader(event.headers, 'x-internal-sync-secret'));
  if (!hasBearer && !hasInternalSecret) return undefined;
  const session = await verifyRequestSession(event);
  await ensureSessionNotRevoked(session);
  return session;
}

async function verifyRequestUser(event) {
  const session = await verifyRequestSession(event);
  await ensureSessionNotRevoked(session);
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

async function getAccountMetadata(PK) {
  const result = await db.send(new GetCommand({
    TableName: TABLE,
    Key: { PK, SK: 'ACCOUNT' },
  }));
  return result.Item;
}

async function ensureSessionNotRevoked(session) {
  if (!session?.sub || session.provider === 'internal' || session.issuedAt === undefined) return;
  const metadata = await getAccountMetadata(`USER#${session.sub}`);
  const revokedBefore = Date.parse(metadata?.tokenRevokedBefore ?? '');
  if (Number.isFinite(revokedBefore) && session.issuedAt <= Math.floor(revokedBefore / 1000)) {
    throw new Error('Invalid session');
  }
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

function deletionItems(items) {
  const aliasTargets = items
    .filter((item) => typeof item.aliasPK === 'string' && typeof item.aliasSK === 'string')
    .map((item) => ({ PK: item.aliasPK, SK: item.aliasSK }));
  return [...items, ...aliasTargets];
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

function collectionItems(items, prefix) {
  return items.filter((item) => item.SK.startsWith(`${prefix}#`));
}

function userDataItemCount(items) {
  return collectionItems(items, 'EXERCISE').length
    + collectionItems(items, 'TEMPLATE').length
    + collectionItems(items, 'LOG').length;
}

function nameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function uniqueImportedName(name, existingNames, renamed, suffix = 'imported') {
  const base = String(name ?? '').trim() || 'Imported';
  if (!existingNames.has(nameKey(base))) {
    existingNames.add(nameKey(base));
    return base;
  }
  let candidate = `${base} (${suffix})`;
  let index = 2;
  while (existingNames.has(nameKey(candidate))) {
    candidate = `${base} (${suffix} ${index})`;
    index += 1;
  }
  existingNames.add(nameKey(candidate));
  renamed.push({ from: base, to: candidate });
  return candidate;
}

function duplicateSafeItems(existingItems, imported) {
  const renamed = { exercises: [], templates: [], logs: [] };
  const skipped = { exercises: [], templates: [], logs: [] };
  const existingExerciseIds = new Set(collectionItems(existingItems, 'EXERCISE').map((item) => item.id));
  const existingTemplateIds = new Set(collectionItems(existingItems, 'TEMPLATE').map((item) => item.id));
  const existingLogIds = new Set(collectionItems(existingItems, 'LOG').map((item) => item.id));
  const exerciseNames = new Set(collectionItems(existingItems, 'EXERCISE').map((item) => nameKey(item.name)));
  const templateNames = new Set(collectionItems(existingItems, 'TEMPLATE').map((item) => nameKey(item.name)));
  const logNamesByDate = new Set(collectionItems(existingItems, 'LOG').map((item) => `${item.date}|${nameKey(item.name)}`));
  const exercises = imported.exercises.flatMap((exercise) => {
    if (existingExerciseIds.has(exercise.id)) {
      skipped.exercises.push({ id: exercise.id, name: exercise.name });
      return [];
    }
    return [{
      ...exercise,
      name: uniqueImportedName(exercise.name, exerciseNames, renamed.exercises),
    }];
  });
  const templates = imported.templates.flatMap((template) => {
    if (existingTemplateIds.has(template.id)) {
      skipped.templates.push({ id: template.id, name: template.name });
      return [];
    }
    return [{
      ...template,
      name: uniqueImportedName(template.name, templateNames, renamed.templates),
    }];
  });
  const logs = imported.logs.flatMap((log) => {
    if (existingLogIds.has(log.id)) {
      skipped.logs.push({ id: log.id, name: log.name, date: log.date });
      return [];
    }
    const key = `${log.date}|${nameKey(log.name)}`;
    if (!logNamesByDate.has(key)) {
      logNamesByDate.add(key);
      return [log];
    }
    const namesForDate = new Set([...logNamesByDate]
      .filter((value) => value.startsWith(`${log.date}|`))
      .map((value) => value.slice(log.date.length + 1)));
    const name = uniqueImportedName(log.name || 'Imported workout', namesForDate, renamed.logs);
    logNamesByDate.add(`${log.date}|${nameKey(name)}`);
    return [{ ...log, name }];
  });
  return { exercises, templates, logs, settings: imported.settings, renamed, skipped };
}

async function writeImportedCollection(PK, prefix, items) {
  for (const body of items) {
    const SK = `${prefix}#${body.id}`;
    const versioned = await itemWithRevision(PK, SK, body, undefined);
    await db.send(new PutCommand({
      TableName: TABLE,
      Item: { PK, SK, ...versioned },
    }));
  }
}

async function importPayload(PK, body) {
  const imported = validateImport(body);
  const existingItems = await queryAllUserItems(PK);
  if (imported.mode === 'emptyOnly' && userDataItemCount(existingItems) > 0) {
    throw new ValidationError('Import can only restore into an empty account.', { cause: 'conflict' });
  }

  const safe = imported.mode === 'merge'
    ? duplicateSafeItems(existingItems, imported)
    : { ...imported, renamed: { exercises: [], templates: [], logs: [] }, skipped: { exercises: [], templates: [], logs: [] } };

  if (safe.settings) {
    await db.send(new PutCommand({
      TableName: TABLE,
      Item: { PK, SK: 'SETTINGS', ...safe.settings },
    }));
  }
  await writeImportedCollection(PK, 'EXERCISE', safe.exercises);
  await writeImportedCollection(PK, 'TEMPLATE', safe.templates);
  await writeImportedCollection(PK, 'LOG', safe.logs);

  return {
    imported: {
      exercises: safe.exercises.length,
      templates: safe.templates.length,
      logs: safe.logs.length,
      settings: Boolean(safe.settings),
    },
    renamed: safe.renamed,
    skipped: safe.skipped,
  };
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Number.isInteger(decoded.offset) && decoded.offset >= 0) return decoded.offset;
  } catch {
    throw new ValidationError('cursor is invalid');
  }
  throw new ValidationError('cursor is invalid');
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function parseOptionalLogQuery(params) {
  const fields = ['from', 'to', 'limit', 'cursor'];
  if (!fields.some((field) => params.has(field))) return undefined;
  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !datePattern.test(from)) throw new ValidationError('from must use YYYY-MM-DD');
  if (to && !datePattern.test(to)) throw new ValidationError('to must use YYYY-MM-DD');
  const limitValue = params.get('limit');
  const limit = limitValue === null || limitValue === '' ? 50 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError('limit must be an integer between 1 and 100');
  }
  return {
    from,
    to,
    limit,
    offset: decodeCursor(params.get('cursor')),
  };
}

function parseAdminLimit(params) {
  const raw = params.get('limit') ?? '50';
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError('limit must be an integer between 1 and 100');
  }
  return limit;
}

function filteredLogPage(items, query) {
  const logs = items
    .map(strip)
    .filter((log) => (!query.from || log.date >= query.from) && (!query.to || log.date <= query.to))
    .sort((a, b) => (
      b.date.localeCompare(a.date)
      || String(b.endTime ?? b.startTime ?? '').localeCompare(String(a.endTime ?? a.startTime ?? ''))
      || b.id.localeCompare(a.id)
    ));
  const page = logs.slice(query.offset, query.offset + query.limit);
  const nextOffset = query.offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < logs.length ? encodeCursor(nextOffset) : undefined,
  };
}

async function putAccountTombstone(PK, now) {
  await db.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK,
      SK: 'ACCOUNT',
      deletedAt: now,
      tokenRevokedBefore: now,
    },
  }));
}

async function itemWithRevision(PK, SK, body, expectedRevision) {
  const result = await db.send(new GetCommand({
    TableName: TABLE,
    Key: { PK, SK },
  }));
  const existing = result.Item;
  if (expectedRevision !== undefined && (existing?.revision ?? 0) !== expectedRevision) {
    throw new ValidationError('Resource was updated elsewhere. Reload and try again.', { cause: 'conflict' });
  }
  const now = new Date().toISOString();
  return {
    ...body,
    updatedAt: now,
    revision: (Number.isInteger(existing?.revision) ? existing.revision : 0) + 1,
  };
}

function supportFeedbackItem(item) {
  const userId = String(item.PK ?? '').replace(/^USER#/, '');
  return {
    id: item.id,
    createdAt: item.createdAt,
    message: item.message ?? '',
    build: item.build ?? '',
    userHash: hashUserId(userId),
  };
}

function userSummary(accountSub, email, items) {
  const counts = {
    exercises: 0,
    templates: 0,
    logs: 0,
    feedback: 0,
  };
  const feedbackBuilds = new Map();
  let lastWorkoutDate;
  let activeWorkoutCount = 0;
  let latestFeedbackAt;
  let deletedAt;

  for (const item of items) {
    if (item.SK === 'ACCOUNT') deletedAt = item.deletedAt;
    else if (item.SK.startsWith('EXERCISE#')) counts.exercises += 1;
    else if (item.SK.startsWith('TEMPLATE#')) counts.templates += 1;
    else if (item.SK.startsWith('LOG#')) {
      counts.logs += 1;
      if (item.status === 'active' || item.status === 'planning') activeWorkoutCount += 1;
      if (item.date && (!lastWorkoutDate || item.date > lastWorkoutDate)) lastWorkoutDate = item.date;
    } else if (item.SK.startsWith('FEEDBACK#')) {
      counts.feedback += 1;
      if (item.createdAt && (!latestFeedbackAt || item.createdAt > latestFeedbackAt)) latestFeedbackAt = item.createdAt;
      const build = item.build || 'unknown';
      feedbackBuilds.set(build, (feedbackBuilds.get(build) ?? 0) + 1);
    }
  }

  return {
    userHash: hashUserId(accountSub),
    email,
    counts,
    activeWorkoutCount,
    lastWorkoutDate,
    latestFeedbackAt,
    deletedAt,
    feedbackBuilds: [...feedbackBuilds.entries()]
      .map(([build, count]) => ({ build, count }))
      .sort((a, b) => b.count - a.count || a.build.localeCompare(b.build)),
  };
}

function feedbackOverview(items) {
  const builds = new Map();
  const users = new Set();
  for (const item of items) {
    builds.set(item.build || 'unknown', (builds.get(item.build || 'unknown') ?? 0) + 1);
    if (item.userHash) users.add(item.userHash);
  }
  return {
    service: BUILD_INFO,
    feedback: {
      scanned: items.length,
      uniqueUsers: users.size,
      recent: items.slice(0, 8),
      builds: [...builds.entries()]
        .map(([build, count]) => ({ build, count }))
        .sort((a, b) => b.count - a.count || a.build.localeCompare(b.build)),
    },
  };
}

async function scanFeedback(limit) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#sk': 'SK' },
      ExpressionAttributeValues: { ':prefix': 'FEEDBACK#' },
      Limit: Math.max(limit, 25),
      ExclusiveStartKey,
    }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < limit);

  return items
    .map(supportFeedbackItem)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, limit);
}

async function lookupAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError('email is required');
  }
  const alias = await db.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: emailAliasPk(normalized), SK: 'ALIAS' },
  }));
  const accountSub = alias.Item?.accountSub;
  if (!accountSub) return { found: false, email: normalized };
  return {
    found: true,
    account: userSummary(accountSub, normalized, await queryAllUserItems(`USER#${accountSub}`)),
  };
}

async function handleAdminRoute(method, resource, event, params) {
  if (!hasAdminSupportAccess(event)) return err(401, 'Unauthorized');
  if (resource === 'feedback' && method === 'GET') {
    const limit = parseAdminLimit(params);
    return ok({ items: await scanFeedback(limit) });
  }
  if (resource === 'overview' && method === 'GET') {
    return ok(feedbackOverview(await scanFeedback(parseAdminLimit(params))));
  }
  if (resource === 'accounts' && method === 'GET') {
    return ok(await lookupAccountByEmail(params.get('email')));
  }
  return err(404, 'Not found');
}

async function handleAuthenticatedRoute(method, resource, id, event, PK, params) {
  if (resource === 'export' && method === 'GET' && !id) {
    return ok(exportPayload(await queryAllUserItems(PK)));
  }

  if (resource === 'import' && method === 'POST' && !id) {
    return ok(await importPayload(PK, parseJsonBody(event)));
  }

  if (resource === 'account' && method === 'DELETE' && !id) {
    const items = await queryAllUserItems(PK);
    await batchDelete(deletionItems(items));
    await putAccountTombstone(PK, new Date().toISOString());
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
    if (resource === 'logs') {
      const logQuery = parseOptionalLogQuery(params);
      if (logQuery) {
        const { items: page, nextCursor } = filteredLogPage(items, logQuery);
        return ok(page, nextCursor ? { 'X-Next-Cursor': nextCursor } : {});
      }
    }
    return ok(items.map(strip));
  }

  if (method === 'PUT' && id) {
    validateId(id);
    const rawBody = parseJsonBody(event);
    const body = validateResourceBody(resource, rawBody, id);
    const SK = `${prefix}#${id}`;
    const versioned = await itemWithRevision(PK, SK, body, rawBody.expectedRevision);
    const item = { PK, SK, ...versioned };
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
  const requestId = requestIdFrom(event);
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';
  const [resource, id, ...rest] = cleanPath(rawPath);
  const params = queryParams(event, rawPath);
  let userId;

  const finish = (result) => {
    const responseWithRequestId = attachRequestId(result, requestId);
    console.log(JSON.stringify({
      event: 'request',
      requestId,
      method,
      path: `/${[resource, id].filter(Boolean).join('/')}`,
      statusCode: responseWithRequestId.statusCode,
      user: hashUserId(userId),
      durationMs: Date.now() - startedAt,
    }));
    return responseWithRequestId;
  };

  try {
    if (method === 'OPTIONS') return finish(noContent());
    if (rest.length > 0) return finish(err(404, 'Not found'));

    if (resource === 'healthz' && method === 'GET' && !id) {
      return finish(ok({
        ok: true,
        service: SERVICE_NAME,
        tableConfigured: Boolean(TABLE),
        timestamp: new Date().toISOString(),
      }));
    }

    if (resource === 'version' && method === 'GET' && !id) {
      return finish(ok(BUILD_INFO));
    }

    if (resource === 'auth' && id && method === 'POST') {
      if (id !== 'google' && id !== 'apple') return finish(err(404, 'Not found'));
      try {
        return finish(await handleAuth(id, parseJsonBody(event), event));
      } catch (error) {
        if (error instanceof ValidationError) return finish(err(400, error.message));
        console.warn(JSON.stringify({
          event: 'auth_invalid_credentials',
          requestId,
          provider: id,
          message: error?.message ?? String(error),
        }));
        return finish(err(401, 'Invalid credentials'));
      }
    }

    if (resource === 'admin' && id) {
      return finish(await handleAdminRoute(method, id, event, params));
    }

    userId = await verifyRequestUser(event);
    return finish(await handleAuthenticatedRoute(method, resource, id, event, `USER#${userId}`, params));
  } catch (error) {
    if (error instanceof ValidationError) {
      return finish(err(error.cause === 'conflict' ? 409 : 400, error.message));
    }
    if (error?.message === 'Missing token' || error?.message === 'Invalid session') {
      return finish(err(401, 'Unauthorized'));
    }
    console.error(JSON.stringify({
      event: 'handler_error',
      requestId,
      method,
      path: rawPath,
      user: hashUserId(userId),
      message: error?.message ?? String(error),
    }));
    return finish(err(500, 'Internal server error'));
  }
};
