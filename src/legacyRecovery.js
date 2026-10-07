// Local, retained recovery journal. Sources are never rewritten or removed.
export const LEGACY_KEYS = ['forge.pendingLogSaves.v1', 'forge.pendingResourceChanges.v1', 'forge.pendingConflicts.v1'];
const JOURNAL = 'forge.legacyRecoveryReview.v1';
const resources = ['logs', 'exercises', 'templates', 'programs'];

export function readRecoveryJournal(storage) {
  const raw = storage.getItem(JOURNAL);
  if (raw === null) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.some(row => !row || !LEGACY_KEYS.includes(row.key) || typeof row.raw !== 'string' || !Number.isInteger(row.index) || typeof row.owner !== 'string' || !row.owner || !['preserved', 'staged', 'set-aside', 'reviewed'].includes(row.state) || (row.state === 'staged' && (!row.conflict?.recoveryID || !resources.includes(row.conflict.resource) || !row.conflict.itemId)))) throw new Error('The recovery journal needs support review. Original work is preserved.');
  return rows;
}
export function recoverySources(storage) {
  return LEGACY_KEYS.flatMap(key => {
    const raw = storage.getItem(key);
    return raw === null ? [] : [{ key, raw }];
  });
}
const sameSource = (a, b) => a.key === b.key && a.raw === b.raw && a.index === b.index;
export function recoveryRecords(sources, journal, owner) {
  return sources.flatMap(source => {
    let rows;
    try { rows = JSON.parse(source.raw); } catch { rows = null; }
    if (!Array.isArray(rows)) return [{ ...source, index: -1, id: source.key, state: 'unreadable', preview: 'Unreadable source; export preserves its exact bytes.' }];
    return rows.map((row, index) => {
      const record = { ...source, index, id: `${source.key}:${index}` };
      const decision = journal.find(entry => sameSource(entry, record));
      if (decision && decision.owner !== owner) return { ...record, state: 'another-account', preview: 'Already attributed to another account. Sign in to that account.' };
      const resource = source.key === LEGACY_KEYS[0] ? 'logs' : row?.resource;
      const local = source.key === LEGACY_KEYS[2] ? row?.local : (resource === 'logs' ? row?.log ?? row : row?.item);
      const operation = row?.operation ?? 'put';
      const valid = operation === 'put' && local?.deleted !== true && resources.includes(resource) && local && typeof local === 'object'
        && typeof local.id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(local.id)
        && (row?.itemId == null || row.itemId === local.id) && (row?.id == null || source.key === LEGACY_KEYS[2] || row.id === local.id);
      return { ...record, resource, local, operation, recoverable: valid, state: decision?.state ?? 'preserved', preview: JSON.stringify(row, null, 2) };
    });
  });
}
export function recoveryConflicts(storage, owner) {
  try { return readRecoveryJournal(storage).filter(row => row.owner === owner && row.state === 'staged').map(row => row.conflict); }
  catch { return []; } // Never replay an unreadable journal.
}
export function recordRecoveryDecision(storage, record, owner, state, conflict) {
  const journal = readRecoveryJournal(storage);
  const prior = journal.find(row => sameSource(row, record));
  if (prior && !(prior.owner === owner && prior.state === 'preserved') && !(prior.owner === owner && prior.state === 'set-aside' && state === 'preserved')) throw new Error('This source has already been reviewed. Its original is retained; use the existing conflict or export for support.');
  storage.setItem(JOURNAL, JSON.stringify([...journal.filter(row => !sameSource(row, record)), { decisionID: crypto.randomUUID(), key: record.key, raw: record.raw, index: record.index, owner, state, conflict }]));
}
export function settleRecoveryConflicts(storage, owner, retained) {
  const journal = readRecoveryJournal(storage);
  let changed = false;
  for (const row of journal) {
    if (row.owner === owner && row.state === 'staged' && !retained.some(c => c.recoveryID === row.conflict.recoveryID)) {
      row.state = 'reviewed'; changed = true;
    }
  }
  if (changed) storage.setItem(JOURNAL, JSON.stringify(journal));
}
