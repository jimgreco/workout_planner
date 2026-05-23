import assert from 'node:assert/strict';
import test from 'node:test';
import {
  originPolicyError,
  parseAllowedOrigins,
} from './http-policy.mjs';

test('parseAllowedOrigins trims empty entries', () => {
  assert.deepEqual(
    parseAllowedOrigins('https://app.example.com, http://localhost:5173,'),
    ['https://app.example.com', 'http://localhost:5173'],
  );
});

test('rejects disallowed browser origins for state-changing requests', () => {
  const error = originPolicyError({
    method: 'POST',
    origin: 'https://evil.example.com',
    allowedOrigins: ['https://workout-planner.jim-greco.com'],
  });
  assert.equal(error, 'Forbidden request origin');
});

test('allows trusted browser origins and no-origin native requests', () => {
  assert.equal(originPolicyError({
    method: 'DELETE',
    origin: 'https://workout-planner.jim-greco.com',
    allowedOrigins: ['https://workout-planner.jim-greco.com'],
  }), undefined);
  assert.equal(originPolicyError({
    method: 'PUT',
    origin: undefined,
    allowedOrigins: ['https://workout-planner.jim-greco.com'],
  }), undefined);
});

test('checks preflight requested method', () => {
  const error = originPolicyError({
    method: 'OPTIONS',
    requestedMethod: 'DELETE',
    origin: 'https://evil.example.com',
    allowedOrigins: ['https://workout-planner.jim-greco.com'],
  });
  assert.equal(error, 'Forbidden request origin');
});
