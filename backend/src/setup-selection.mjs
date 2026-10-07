// Older clients omit selection provenance. Retain it only while the same
// exercise/setup/baseline remains; never attach it to a replacement movement.
export function preservingSetupSelection(incoming, existing) {
  if (!Array.isArray(incoming)) return incoming;
  return incoming.map(item => {
    if (Object.hasOwn(item, 'setupSelectionMade')) return item;
    const previous = existing?.find(entry => entry.exerciseId === item.exerciseId
      && entry.setupProfile?.id === item.setupProfile?.id
      && entry.baselineId === item.baselineId);
    return previous?.setupSelectionMade === true ? { ...item, setupSelectionMade: true } : item;
  });
}
