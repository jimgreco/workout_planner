import { useState } from 'react';
import { beginLegacyRecovery, exportLegacyRecovery, reviewLegacyRecord } from '../api.js';
import { getSessionSnapshot } from '../auth.js';

export default function LegacyRecovery({ onClose, onStaged }) {
  const [session] = useState(() => getSessionSnapshot());
  const [typed, setTyped] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(null);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [packet, setPacket] = useState('');
  const current = getSessionSnapshot();
  if (session.epoch !== current.epoch || session.user?.sub !== current.user?.sub) return <p>The account changed. Close and reopen recovery from the original account.</p>;

  function openReview() {
    try {
      const result = beginLegacyRecovery(typed, confirmed);
      setReview(result); setRecords(result.records); setError('');
    } catch (e) { setError(e.message); }
  }
  async function act(record, action) {
    setBusy(true); setError('');
    try {
      setRecords([...await reviewLegacyRecord(review, record.id, action)]);
      setPacket('');
      if (action === 'stage') onStaged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function prepareExport() {
    try { setPacket(exportLegacyRecovery(review)); setError(''); }
    catch (e) { setError(e.message); }
  }
  return <div className="legacy-recovery">
    <p>Older work has no verified owner. Nothing here syncs automatically. Verify the original account before viewing private workout data. Leave the source preserved if unsure.</p>
    {!review ? <>
      <p>Signed-in account: <code>{session.user?.sub}</code></p>
      <label>Original account ID<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" /></label>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I verified that this device’s older work belongs to this original account.</label>
      <button className="btn btn-primary" onClick={openReview} disabled={!confirmed || typed !== session.user?.sub}>Review preserved work</button>
    </> : <>
      <p>Recover to conflict review fetches the current cloud copy and stages a comparison. Missing or deleted cloud copies are export-only. It writes nothing to the server. Review that comparison before choosing Keep This Device. Set aside retains the original and changes no cloud history.</p>
      {records.map(record => <section className="conflict-card" key={record.id}>
        <h3>{record.resource || 'Preserved source'} · {record.state}</h3>
        <details><summary>Review saved contents</summary><pre>{record.preview}</pre></details>
        {record.state === 'preserved' && <div className="conflict-actions">
          <button className="btn btn-primary" disabled={busy || !record.recoverable} onClick={() => act(record, 'stage')}>Recover to conflict review</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => act(record, 'archive')}>Set aside; retain original</button>
        </div>}
        {record.state === 'set-aside' && <button className="btn btn-secondary" disabled={busy} onClick={() => act(record, 'restore')}>Return to review</button>}
        {!record.recoverable && record.state === 'preserved' && <p>Deletion or unsupported content needs separate support review. It cannot be replayed here.</p>}
      </section>)}
      <button className="btn btn-secondary" onClick={prepareExport}>Prepare recovery export</button>
      {packet && <><details><summary>Review export contents</summary><pre>{packet}</pre></details><a className="btn btn-secondary" download="forge-local-recovery.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(packet)}`}>Download reviewed copy</a><p>Contains private workout data. No support upload is automatic.</p></>}
    </>}
    {error && <p role="alert">{error}</p>}
    <button className="btn btn-secondary" onClick={onClose}>Close</button>
  </div>;
}
