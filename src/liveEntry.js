// Actual counts are single non-negative integers; prescription ranges are separate.
export function actualRepsInput(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return String(Number(text));
}

export function actualWeightInput(value) {
  const text = String(value ?? '').trim();
  if (text === '' || text === '.') return '';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const weight = Number(text);
  if (!Number.isFinite(weight) || weight < 0 || weight > Number.MAX_SAFE_INTEGER) return null;
  return text.replace(/^\./, '0.').replace(/\.$/, '');
}

export function adjustedLiveWeight(value, delta, fallback = '') {
  const current = actualWeightInput(value);
  const seed = current ? Number(current) : Number(actualWeightInput(fallback) || 0);
  return String(Math.max(0, seed + delta));
}
