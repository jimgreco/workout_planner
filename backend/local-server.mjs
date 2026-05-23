/**
 * Lightweight HTTP server that wraps the API handler.
 * Points DynamoDB at the local instance (port 8000).
 *
 * Usage:  node backend/local-server.mjs
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { originPolicyError, parseAllowedOrigins } from './src/http-policy.mjs';
import { MAX_BODY_BYTES } from './src/validation.mjs';

// Load .env from parent directory
try {
  const envFile = readFileSync(join(process.cwd(), '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#\s][^=]*)=(['"]?)(.*)\2/);
    if (match) {
      const key = match[1].trim();
      const value = match[3].trim();
      process.env[key] ||= value;
    }
  });
} catch (e) {
  // .env might not exist or be readable, skip
}

// Configure env before importing the handler (it reads env at module load).
// Production Docker runs this wrapper too, so local DynamoDB/dev-bypass defaults
// are only applied outside NODE_ENV=production.
const isProduction = process.env.NODE_ENV === 'production';
process.env.TABLE_NAME ||= 'workout-planner';
process.env.AWS_REGION ||= 'us-east-1';
process.env.LOCAL_AUTH_BYPASS ||= isProduction ? 'false' : 'true';
if (process.env.LOCAL_AUTH_BYPASS === 'true') {
  process.env.AWS_ENDPOINT_URL_DYNAMODB ||= 'http://localhost:8000';
  process.env.AWS_ACCESS_KEY_ID ||= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ||= 'local';
}

const { handler } = await import('./src/handler.mjs');

const PORT = Number(process.env.PORT || 3001);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_PER_MINUTE || (isProduction ? 120 : 600));
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS || (isProduction ? '' : 'http://localhost:5173,http://127.0.0.1:5173'));
const rateBuckets = new Map();

function corsHeaders(origin) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  };
  if (!origin && !isProduction) headers['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return bucket.length > RATE_LIMIT_MAX;
}

function requestId(req) {
  const value = req.headers['x-request-id'];
  if (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value;
  return randomUUID();
}

function jsonError(res, statusCode, headers, message, id) {
  res.writeHead(statusCode, {
    ...headers,
    'Content-Type': 'application/json',
    'X-Request-Id': id,
  });
  res.end(JSON.stringify({ error: message, requestId: id }));
}

const server = createServer(async (req, res) => {
  const id = requestId(req);
  const origin = req.headers.origin;
  const baseHeaders = corsHeaders(origin);
  const policyError = originPolicyError({
    method: req.method,
    origin,
    allowedOrigins,
    requestedMethod: req.headers['access-control-request-method'],
  });

  // CORS preflight
  if (req.method === 'OPTIONS') {
    if (policyError) {
      return jsonError(res, 403, baseHeaders, policyError, id);
    }
    res.writeHead(204, { ...baseHeaders, 'X-Request-Id': id });
    return res.end();
  }

  if (policyError) {
    return jsonError(res, 403, baseHeaders, policyError, id);
  }

  if (rateLimited(clientIp(req))) {
    return jsonError(res, 429, baseHeaders, 'Too many requests', id);
  }

  // Read body
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      return jsonError(res, 413, baseHeaders, 'Request body is too large', id);
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString() || undefined;

  // Build a minimal request event matching the handler's expected shape.
  const event = {
    rawPath: req.url.split('?')[0],
    rawQueryString: req.url.split('?')[1] || '',
    headers: {
      ...req.headers,
      'x-request-id': id,
    },
    requestContext: {
      http: { method: req.method },
    },
    body,
  };

  try {
    const result = await handler(event);
    const headers = {
      ...baseHeaders,
      ...result.headers,
    };
    res.writeHead(result.statusCode, headers);
    res.end(result.body ?? '');
  } catch (e) {
    console.error(e);
    jsonError(res, 500, baseHeaders, 'Internal server error', id);
  }
});

server.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`);
});
