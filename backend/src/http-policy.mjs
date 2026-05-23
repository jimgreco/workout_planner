const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function parseAllowedOrigins(value = '') {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isStateChangingMethod(method) {
  return STATE_CHANGING_METHODS.has(String(method || '').toUpperCase());
}

export function originPolicyError({ method, origin, allowedOrigins, requestedMethod } = {}) {
  const effectiveMethod = requestedMethod || method;
  if (!origin || !isStateChangingMethod(effectiveMethod)) return undefined;
  if (allowedOrigins.includes(origin)) return undefined;
  return 'Forbidden request origin';
}
