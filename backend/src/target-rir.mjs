// Older clients omit the field. Preserve only matching existing exercises,
// within the same account/resource; explicit null is an intentional clear.
export function preservingTargetRIR(incoming, existing) {
  if (!Array.isArray(incoming)) return incoming;
  return incoming.map(item => {
    if (Object.hasOwn(item, 'targetRIR')) return item;
    const previous = existing?.find(entry => entry.exerciseId === item.exerciseId);
    return previous && Object.hasOwn(previous, 'targetRIR') ? { ...item, targetRIR: previous.targetRIR } : item;
  });
}
