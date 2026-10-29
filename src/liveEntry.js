// Actual counts are single non-negative integers; prescription ranges are separate.
export function actualRepsInput(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return String(Number(text));
}
