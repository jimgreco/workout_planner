/**
 * Lightweight HTTP server that wraps the API handler.
 * Points DynamoDB at the local instance (port 8000).
 *
 * Usage:  node backend/local-server.mjs
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || (isProduction ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
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

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const baseHeaders = corsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, baseHeaders);
    return res.end();
  }

  if (rateLimited(clientIp(req))) {
    res.writeHead(429, { ...baseHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Too many requests' }));
  }

  // Read body
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      res.writeHead(413, { ...baseHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Request body is too large' }));
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString() || undefined;

  // Build a minimal request event matching the handler's expected shape.
  const event = {
    rawPath: req.url.split('?')[0],
    headers: req.headers,
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
    res.writeHead(500, { ...baseHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`);
});
