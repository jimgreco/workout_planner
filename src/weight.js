export function smithBarWeight(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 500 ? value : null;
}

export function effectiveWeight(weight, weightType = 'weight', barWeight) {
  const raw = String(weight ?? '').trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < 0 || weightType === 'none') return 0;
  if (weightType === 'smith_double') {
    const resistance = smithBarWeight(barWeight);
    return resistance === null ? null : value * 2 + resistance;
  }
  if (value === 0) return 0;
  if (weightType === 'bar_double') return value * 2 + 45;
  if (weightType === 'double') return value * 2;
  return value;
}

export function smithWeightCaption(weight, barWeight) {
  const raw = String(weight ?? '').trim();
  if (!raw || !Number.isFinite(Number(raw)) || Number(raw) < 0) return null;
  const total = effectiveWeight(raw, 'smith_double', barWeight);
  return total === null ? `${Number(raw) * 2} lb plates + unknown bar` : `Total ${total} lbs`;
}

// Suppress conversions into/out of a Smith setup: its historical resistance
// may differ from the current setup. Same-mode placeholders remain per side.
export function contextualWeightPlaceholder(weight, sourceWeightType, targetWeightType) {
  const raw = String(weight ?? '').trim();
  if (!raw) return '';
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  const source = sourceWeightType || targetWeightType || 'weight';
  const target = targetWeightType || 'weight';
  if (source === 'smith_double' || target === 'smith_double') return source === target ? raw : '';
  const total = source === 'bar_double' ? value * 2 + 45 : source === 'double' ? value * 2 : value;
  const result = target === 'bar_double' ? Math.max(0, (total - 45) / 2) : target === 'double' ? total / 2 : total;
  return String(Number(result.toFixed(1)));
}

export function smithLoadContext(item) {
  return item?.weightType === 'smith_double' ? `smith:${smithBarWeight(item.setupProfile?.smithBarWeight) ?? 'unknown'}` : 'other';
}
