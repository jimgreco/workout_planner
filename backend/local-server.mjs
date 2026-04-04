/**
 * Lightweight local dev server that wraps the Lambda handler.
 * Points DynamoDB at the local instance (port 8000).
 *
 * Usage:  node backend/local-server.mjs
 */

import { createServer } from 'node:http';

// Configure env before importing the handler (it reads env at module load)
process.env.TABLE_NAME ||= 'workout-planner';
process.env.AWS_SAM_LOCAL ||= 'true';
process.env.AWS_ENDPOINT_URL_DYNAMODB ||= 'http://localhost:8000';
process.env.AWS_ACCESS_KEY_ID ||= 'local';
process.env.AWS_SECRET_ACCESS_KEY ||= 'local';
process.env.AWS_REGION ||= 'us-east-1';

const { handler } = await import('./src/handler.mjs');

const PORT = 3001;

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    });
    return res.end();
  }

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString() || undefined;

  // Build a minimal API Gateway v2 event
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
      'Access-Control-Allow-Origin': '*',
      ...result.headers,
    };
    res.writeHead(result.statusCode, headers);
    res.end(result.body ?? '');
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`);
});
