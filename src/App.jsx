import { useState, useCallback, useEffect } from 'react';
import './index.css';
import { 
  Dumbbell, 
  Calendar as CalendarIcon, 
  ClipboardList,
  BicepsFlexed,
  TrendingUp,
  LogOut,
  ChevronRight,
  Download,
  Upload,
  MessageSquare,
  ShieldAlert,
  LifeBuoy,
  ExternalLink,
} from 'lucide-react';
import { getStoredUser, getStoredCredential, storeUser, clearStoredUser, DEV_BYPASS, DEV_USER } from './auth.js';
import {
  initData,
  resetData,
  getExercises,
  getTemplates,
  getLogs,
  getPrograms,
  getSettings,
  exportData,
  importData,
  previewImportData,
  submitFeedback,
  deleteAccount as deleteAccountData,
  flushPendingChanges,
  pendingChangeCount,
  pendingConflictCount,
  getPendingConflicts,
  resolvePendingConflict,
} from './api.js';
import { buildLabel } from './buildInfo.js';
import Login from './pages/Login.jsx';
import Exercises from './pages/Exercises.jsx';
import Templates from './pages/Templates.jsx';
import WorkoutLog from './pages/WorkoutLog.jsx';
import Calendar from './pages/Calendar.jsx';
import Progress from './pages/Progress.jsx';
import Logo from './components/Logo.jsx';
import Modal from './components/Modal.jsx';

const PAGES = [
  { id: 'log',       label: 'Workout',          icon: Dumbbell },
  { id: 'progress',  label: 'Progress',         icon: TrendingUp },
  { id: 'history',   label: 'History',          icon: CalendarIcon },
  { id: 'templates', label: 'Program',          icon: ClipboardList },
  { id: 'exercises', label: 'Exercise Library', icon: BicepsFlexed },
];
const ONBOARDING_KEY = 'forge.onboarding.dismissed.v1';
const CRASH_REPORT_KEY = 'forge.lastCrashReportAt.v1';
const CRASH_REPORT_COOLDOWN_MS = 30 * 60 * 1000;

const emptyImportDraft = () => ({
  fileName: '',
  data: null,
  preview: null,
  mode: 'merge',
  error: '',
});

const RESOURCE_LABELS = {
  exercises: 'Exercise',
  templates: 'Routine',
  programs: 'Program',
  logs: 'Workout',
};

function conflictTitle(conflict) {
  const item = conflict.local || conflict.remote || {};
  return item.name || `${RESOURCE_LABELS[conflict.resource] || 'Item'} ${conflict.itemId}`;
}

function formatConflictRevision(item) {
  if (!item) return 'Missing';
  const bits = [];
  if (Number.isInteger(item.revision)) bits.push(`Rev ${item.revision}`);
  if (item.updatedAt) bits.push(new Date(item.updatedAt).toLocaleString());
  return bits.join(' · ') || 'Unsynced';
}

function programProgressionLabel(progression) {
  if (!progression || progression.type === 'none') return '';
  if (progression.type === 'double_progression') {
    return `Rule: ${progression.minReps ?? 8}-${progression.maxReps ?? 12} reps, then +${progression.weightIncrement ?? 5} lb`;
  }
  if (progression.type === 'linear_weight') return `Rule: +${progression.weightIncrement ?? 5} lb`;
  if (progression.type === 'linear_reps') return `Rule: +${progression.repIncrement ?? 1} rep`;
  return '';
}

function conflictDetails(item, resource) {
  if (!item) return ['Deleted or unavailable'];
  if (resource === 'logs') {
    const setCount = (item.exerciseItems || []).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
    return [
      item.date ? `Date: ${item.date}` : '',
      item.status ? `Status: ${item.status}` : '',
      `${item.exerciseItems?.length || 0} exercises · ${setCount} sets`,
    ].filter(Boolean);
  }
  if (resource === 'exercises') {
    return [
      item.muscleGroup ? `Group: ${item.muscleGroup}` : '',
      item.personalBest?.weight ? `PB: ${item.personalBest.weight}` : '',
      item.notes ? `Notes: ${item.notes}` : '',
    ].filter(Boolean);
  }
  if (resource === 'programs') {
    return [
      item.active ? 'Active program' : 'Inactive program',
      `${item.schedule?.length || 0} scheduled days`,
      programProgressionLabel(item.progression),
      item.progressionRule ? `Rule: ${item.progressionRule}` : '',
    ].filter(Boolean);
  }
  return [
    item.description ? `Description: ${item.description}` : '',
    `${item.exerciseItems?.length || 0} exercises`,
  ].filter(Boolean);
}

export default function App() {
  // Dev bypass: skip login entirely with a mock user (VITE_DEV_BYPASS_AUTH=true).
  // Normal: require a stored profile + a still-valid Google credential.
  const storedUser = DEV_BYPASS ? DEV_USER : getStoredUser();
  const storedCredential = DEV_BYPASS ? 'dev-bypass-token' : getStoredCredential();
  const hasValidSession = DEV_BYPASS || (!!storedUser && !!storedCredential);
  const shouldAutoSelectLogin = !storedUser || hasValidSession;

  const [user, setUser]           = useState(hasValidSession ? storedUser : null);
  const [loading, setLoading]     = useState(hasValidSession); // fetch data on first render
  const [dataError, setDataError] = useState(null);
  const [notice, setNotice]       = useState(null);
  const [loadRequest, setLoadRequest] = useState(0);
  const [page, setPage]           = useState('log');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [accountModal, setAccountModal] = useState(null); // null | 'feedback' | 'import' | 'delete' | 'support'
  const [feedbackText, setFeedbackText] = useState('');
  const [importDraft, setImportDraft] = useState(emptyImportDraft);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  ));
  const [pendingSyncCount, setPendingSyncCount] = useState(() => pendingChangeCount());
  const [conflictCount, setConflictCount] = useState(() => pendingConflictCount());
  const [conflicts, setConflicts] = useState(() => getPendingConflicts());
  const [reviewingConflicts, setReviewingConflicts] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState(null);
  const [syncingPending, setSyncingPending] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs]           = useState([]);
  const [programs, setPrograms]   = useState([]);
  const [settings, setSettings]   = useState({ defaultSets: 4, defaultReps: 8 });
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  // ── Load data after login (or on first render with a valid session) ────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    initData()
      .then(() => {
        if (cancelled) return;
        setExercises(getExercises());
        setTemplates(getTemplates());
        setLogs(getLogs());
        setPrograms(getPrograms());
        setSettings(getSettings());
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AuthError') setDataError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, loadRequest]);

  // ── Auth callbacks ─────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    clearStoredUser();
    resetData();
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    setUser(null);
    setExercises([]);
    setTemplates([]);
    setLogs([]);
    setPrograms([]);
    setSettings({ defaultSets: 4, defaultReps: 8 });
    setPendingTemplate(null);
    setEditingLog(null);
    setPage('log');
    setShowUserMenu(false);
    setAccountModal(null);
    setImportDraft(emptyImportDraft());
    setShowOnboarding(false);
  }, []);

  const handleLogin = useCallback((profile) => {
    storeUser(profile);
    setDataError(null);
    setLoading(true);
    setLoadRequest((value) => value + 1);
    setUser(profile);
  }, []);

  // ── Global auth-error handler (fired by api.js on 401 / missing credential) ──
  useEffect(() => {
    const onAuthError = () => handleSignOut();
    window.addEventListener('wp:auth-error', onAuthError);
    return () => window.removeEventListener('wp:auth-error', onAuthError);
  }, [handleSignOut]);

  useEffect(() => {
    const onApiError = (event) => {
      setNotice({
        type: 'error',
        message: event.detail?.message || 'Something went wrong',
        conflict: Boolean(event.detail?.conflict),
      });
    };
    window.addEventListener('wp:api-error', onApiError);
    return () => window.removeEventListener('wp:api-error', onApiError);
  }, []);

  async function handleFlushPendingChanges() {
    if (syncingPending) return;
    setSyncingPending(true);
    try {
      const updated = await flushPendingChanges();
      setExercises(updated.exercises);
      setTemplates(updated.templates);
      setLogs(updated.logs);
      setPrograms(updated.programs);
      setPendingSyncCount(pendingChangeCount());
      setConflictCount(pendingConflictCount());
      setConflicts(getPendingConflicts());
      if (pendingChangeCount() === 0) {
        setNotice({ type: 'success', message: 'Pending changes synced.' });
      }
    } finally {
      setSyncingPending(false);
    }
  }

  useEffect(() => {
    const updateOnlineStatus = () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);
      if (!offline && pendingChangeCount() > 0) {
        handleFlushPendingChanges();
      }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onSyncStatus = (event) => {
      setPendingSyncCount(event.detail?.pendingChanges ?? pendingChangeCount());
      setConflictCount(event.detail?.pendingConflicts ?? pendingConflictCount());
      setConflicts(getPendingConflicts());
    };
    window.addEventListener('wp:sync-status', onSyncStatus);
    return () => window.removeEventListener('wp:sync-status', onSyncStatus);
  }, []);

  useEffect(() => {
    if (loading || dataError || !user) return;
    const dismissed = window.localStorage.getItem(ONBOARDING_KEY) === 'true';
    if (!dismissed && logs.length === 0) {
      setShowOnboarding(true);
    }
  }, [dataError, loading, logs.length, user]);

  useEffect(() => {
    if (!user) return undefined;
    const report = (message) => {
      const last = Number(window.localStorage.getItem(CRASH_REPORT_KEY) || 0);
      if (Date.now() - last < CRASH_REPORT_COOLDOWN_MS) return;
      window.localStorage.setItem(CRASH_REPORT_KEY, String(Date.now()));
      submitFeedback(`Client error: ${String(message).slice(0, 500)}`, buildLabel()).catch(() => {});
    };
    const onError = (event) => report(event.message || event.error?.message || 'Unknown browser error');
    const onUnhandledRejection = (event) => report(event.reason?.message || event.reason || 'Unhandled browser promise rejection');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [user]);

  function dismissOnboarding(nextPage) {
    window.localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
    if (nextPage) setPage(nextPage);
  }

  async function handleResolveConflict(conflict, resolution) {
    if (resolvingConflictId) return;
    setResolvingConflictId(conflict.id);
    try {
      const updated = await resolvePendingConflict(conflict.id, resolution);
      setExercises(updated.exercises);
      setTemplates(updated.templates);
      setPrograms(updated.programs);
      setLogs(updated.logs);
      setPendingSyncCount(pendingChangeCount());
      setConflictCount(pendingConflictCount());
      const remaining = getPendingConflicts();
      setConflicts(remaining);
      if (remaining.length === 0) setReviewingConflicts(false);
      setNotice({
        type: 'success',
        message: resolution === 'local' ? 'Kept this device copy and synced it.' : 'Kept the cloud copy.',
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Could not resolve conflict.' });
    } finally {
      setResolvingConflictId(null);
    }
  }

  function handleStartWorkout(template) {
    setPendingTemplate(template);
    setPage('log');
  }

  function handleEditLog(log) {
    setEditingLog(log);
    setPage('log');
  }

  function navigate(id) {
    setPage(id);
    setShowUserMenu(false);
  }

  async function handleExportData() {
    setAccountBusy(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `forge-workout-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice({ type: 'success', message: 'Export downloaded.' });
      setShowUserMenu(false);
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const preview = previewImportData(data, { exercises, templates, logs, programs });
      setImportDraft({
        fileName: file.name,
        data,
        preview,
        mode: preview.targetIsEmpty ? 'emptyOnly' : 'merge',
        error: '',
      });
    } catch (error) {
      setImportDraft({
        ...emptyImportDraft(),
        fileName: file.name,
        error: error.message || 'Import file could not be read.',
      });
    }
  }

  async function handleImportData() {
    if (!importDraft.data || accountBusy) return;
    setAccountBusy(true);
    try {
      const result = await importData(importDraft.data, importDraft.mode);
      setExercises(getExercises());
      setTemplates(getTemplates());
      setLogs(getLogs());
      setPrograms(getPrograms());
      setSettings(getSettings());
      setAccountModal(null);
      setImportDraft(emptyImportDraft());
      const renamedCount = Object.values(result.renamed ?? {}).reduce((sum, items) => sum + items.length, 0);
      const skippedCount = Object.values(result.skipped ?? {}).reduce((sum, items) => sum + items.length, 0);
      setNotice({
        type: 'success',
        message: [
          'Import complete.',
          renamedCount > 0 ? `${renamedCount} duplicate ${renamedCount === 1 ? 'name was' : 'names were'} renamed.` : '',
          skippedCount > 0 ? `${skippedCount} existing ${skippedCount === 1 ? 'item was' : 'items were'} skipped.` : '',
        ].filter(Boolean).join(' '),
      });
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleSubmitFeedback() {
    if (!feedbackText.trim() || accountBusy) return;
    setAccountBusy(true);
    try {
      await submitFeedback(feedbackText.trim(), buildLabel());
      setFeedbackText('');
      setAccountModal(null);
      setNotice({ type: 'success', message: 'Feedback sent. Thank you.' });
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleDeleteAccount() {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      await deleteAccountData();
      handleSignOut();
    } finally {
      setAccountBusy(false);
    }
  }

  function renderAccountMenuItems() {
    return (
      <>
        <div className="dropdown-info">
          <span className="dropdown-name">{user.name}</span>
          <span className="dropdown-email">{user.email}</span>
          <span className="dropdown-build">{buildLabel()}</span>
        </div>
        <hr className="dropdown-divider" />
        <button className="dropdown-item" onClick={handleExportData} disabled={accountBusy}>
          <Download size={16} /> Export data
        </button>
        <button className="dropdown-item" onClick={() => { setImportDraft(emptyImportDraft()); setAccountModal('import'); setShowUserMenu(false); }}>
          <Upload size={16} /> Import data
        </button>
        <button className="dropdown-item" onClick={() => { setFeedbackText(''); setAccountModal('feedback'); setShowUserMenu(false); }}>
          <MessageSquare size={16} /> Send feedback
        </button>
        <button className="dropdown-item" onClick={() => { setAccountModal('support'); setShowUserMenu(false); }}>
          <LifeBuoy size={16} /> Privacy & support
        </button>
        <button className="dropdown-item danger-text" onClick={() => { setAccountModal('delete'); setShowUserMenu(false); }}>
          <ShieldAlert size={16} /> Delete account
        </button>
        <hr className="dropdown-divider" />
        <button className="dropdown-item logout-item" onClick={handleSignOut}>
          <LogOut size={16} /> Sign out
        </button>
      </>
    );
  }

  // Close menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const close = () => setShowUserMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showUserMenu]);

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        previousUser={storedUser}
        autoSelect={shouldAutoSelectLogin}
      />
    );
  }

  // ── Loading initial data ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="full-center">
        <div className="spinner" />
        <p className="loading-text">Loading your workouts…</p>
      </div>
    );
  }

  // ── Data load error ────────────────────────────────────────────────────────
  if (dataError) {
    return (
      <div className="full-center">
        <p style={{ color: 'var(--danger)', marginBottom: 12 }}>Failed to load data: {dataError}</p>
        <button className="btn btn-secondary" onClick={() => { setDataError(null); setLoading(true); setLoadRequest((value) => value + 1); }}>
          Retry
        </button>
      </div>
    );
  }

  // ── Main app ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Integrated Top Navigation (Mobile) */}
      <header className="mobile-nav">
        <div className="mobile-nav-left">
          <Logo variant="mark" className="app-logo-mark" title="Forge" />
        </div>
        
        <nav className="mobile-nav-center">
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`mobile-nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={20} strokeWidth={page === p.id ? 2.5 : 2} />
              <span className="mobile-nav-label">{p.label}</span>
            </button>
          ))}
        </nav>

        <div className="mobile-nav-right">
          <button 
            className="mobile-avatar-btn" 
            onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
          >
            {user.picture ? (
              <img src={user.picture} alt="User menu" className="mobile-avatar" referrerPolicy="no-referrer" />
            ) : <div className="mobile-avatar-placeholder" />}
          </button>
        </div>

        {showUserMenu && (
          <div className="user-dropdown mobile-dropdown" onClick={(e) => e.stopPropagation()}>
            {renderAccountMenuItems()}
          </div>
        )}
      </header>

      {/* Sidebar (Desktop only) */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Logo className="app-logo-full" />
        </div>

        <div className="nav-group">
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => navigate(p.id)}
              style={{ padding: '10px 14px', gap: '12px' }}
            >
              <p.icon size={18} className="nav-icon" strokeWidth={page === p.id ? 2.5 : 2} />
              <span className="nav-label" style={{ fontSize: '14.5px' }}>{p.label}</span>
              {page === p.id && <ChevronRight size={14} className="active-chevron" />}
            </button>
          ))}
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-user-container">
          <button 
            className="sidebar-user-toggle" 
            onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
          >
            {user.picture && (
              <img src={user.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
            )}
            <div className="user-info">
              <span className="user-name">{user.name}</span>
            </div>
          </button>

          {showUserMenu && (
            <div className="user-dropdown sidebar-dropdown" onClick={(e) => e.stopPropagation()}>
              {renderAccountMenuItems()}
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        {notice && (
          <div className={`app-notice ${notice.type}`}>
            <span>{notice.message}</span>
            <button className="btn-icon" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button>
          </div>
        )}
        {isOffline && (
          <div className="app-notice warning">
            <span>Offline. Cloud saves are unavailable until your connection returns.</span>
          </div>
        )}
        {pendingSyncCount > 0 && (
          <div className="app-notice warning">
            <span>{pendingSyncCount} {pendingSyncCount === 1 ? 'change is' : 'changes are'} waiting to sync.</span>
            <button className="btn btn-secondary btn-sm" onClick={handleFlushPendingChanges} disabled={syncingPending || isOffline}>
              {syncingPending ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
        {conflictCount > 0 && (
          <div className="app-notice error">
            <span>{conflictCount} sync {conflictCount === 1 ? 'conflict needs' : 'conflicts need'} review.</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setReviewingConflicts(true)}>
              Review
            </button>
          </div>
        )}
        {page === 'exercises' && (
          <Exercises exercises={exercises} logs={logs} onUpdate={setExercises} />
        )}
        {page === 'progress' && (
          <Progress logs={logs} exercises={exercises} />
        )}
        {page === 'templates' && (
          <Templates
            templates={templates}
            exercises={exercises}
            logs={logs}
            programs={programs}
            settings={settings}
            onUpdate={setTemplates}
            onProgramsUpdate={setPrograms}
            onSettingsUpdate={setSettings}
            onStartWorkout={handleStartWorkout}
          />
        )}
        {page === 'log' && (
          <WorkoutLog
            exercises={exercises}
            templates={templates}
            logs={logs}
            settings={settings}
            onLogsChanged={setLogs}
            onExercisesChanged={setExercises}
            initialTemplate={pendingTemplate}
            onClearTemplate={() => setPendingTemplate(null)}
            editingLog={editingLog}
            onClearEditing={() => setEditingLog(null)}
          />
        )}
        {page === 'history' && (
          <Calendar
            logs={logs}
            exercises={exercises}
            onUpdate={setLogs}
            onEditLog={handleEditLog}
          />
        )}
      </main>

      {reviewingConflicts && (
        <Modal
          title="Review Sync Conflicts"
          onClose={() => !resolvingConflictId && setReviewingConflicts(false)}
          footer={
            <button className="btn btn-secondary" onClick={() => setReviewingConflicts(false)} disabled={!!resolvingConflictId}>
              Done
            </button>
          }
        >
          <div className="conflict-modal">
            {conflicts.length === 0 ? (
              <p className="text-muted">No pending conflicts.</p>
            ) : conflicts.map((conflict) => (
              <div className="conflict-card" key={conflict.id}>
                <div className="conflict-card-header">
                  <div>
                    <span className="section-kicker">{RESOURCE_LABELS[conflict.resource] || 'Item'}</span>
                    <h3>{conflictTitle(conflict)}</h3>
                  </div>
                  {conflict.requestId && <span className="conflict-request-id">Request {conflict.requestId}</span>}
                </div>
                <div className="conflict-comparison">
                  <div className="conflict-side">
                    <span className="conflict-side-label">This device</span>
                    <strong>{conflict.local?.name || 'Untitled'}</strong>
                    <small>{formatConflictRevision(conflict.local)}</small>
                    {conflictDetails(conflict.local, conflict.resource).map((line) => <p key={line}>{line}</p>)}
                  </div>
                  <div className="conflict-side">
                    <span className="conflict-side-label">Cloud</span>
                    <strong>{conflict.remote?.name || 'Untitled'}</strong>
                    <small>{formatConflictRevision(conflict.remote)}</small>
                    {conflictDetails(conflict.remote, conflict.resource).map((line) => <p key={line}>{line}</p>)}
                  </div>
                </div>
                <div className="conflict-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleResolveConflict(conflict, 'remote')}
                    disabled={!!resolvingConflictId}
                  >
                    Use Cloud Copy
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleResolveConflict(conflict, 'local')}
                    disabled={!!resolvingConflictId}
                  >
                    {resolvingConflictId === conflict.id ? 'Saving...' : 'Keep This Device'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {accountModal === 'feedback' && (
        <Modal
          title="Send Feedback"
          onClose={() => !accountBusy && setAccountModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAccountModal(null)} disabled={accountBusy}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmitFeedback} disabled={!feedbackText.trim() || accountBusy}>
                {accountBusy ? 'Sending…' : 'Send'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>What should I know?</label>
            <textarea
              rows={5}
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="Bug, rough edge, feature idea…"
              autoFocus
            />
          </div>
          <p className="text-muted" style={{ fontSize: 13 }}>Includes {buildLabel()} so issues are easier to trace.</p>
        </Modal>
      )}

      {accountModal === 'import' && (
        <Modal
          title="Import Data"
          onClose={() => !accountBusy && setAccountModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAccountModal(null)} disabled={accountBusy}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleImportData}
                disabled={!importDraft.data || importDraft.preview?.isEmpty || accountBusy}
              >
                {accountBusy ? 'Importing…' : 'Import'}
              </button>
            </>
          }
        >
          <div className="import-modal">
            <div className="form-group">
              <label htmlFor="import-file">Forge JSON export</label>
              <input id="import-file" type="file" accept="application/json,.json" onChange={handleImportFile} />
            </div>

            {importDraft.error && (
              <p className="inline-error">{importDraft.error}</p>
            )}

            {importDraft.preview && (
              <>
                <div className="import-preview">
                  <div>
                    <span>Exercises</span>
                    <strong>{importDraft.preview.counts.exercises}</strong>
                  </div>
                  <div>
                    <span>Routines</span>
                    <strong>{importDraft.preview.counts.templates}</strong>
                  </div>
                  <div>
                    <span>Workouts</span>
                    <strong>{importDraft.preview.counts.logs}</strong>
                  </div>
                  <div>
                    <span>Programs</span>
                    <strong>{importDraft.preview.counts.programs}</strong>
                  </div>
                  <div>
                    <span>Settings</span>
                    <strong>{importDraft.preview.counts.settings}</strong>
                  </div>
                </div>

                {!importDraft.preview.isEmpty && (
                  <fieldset className="import-mode">
                    <legend>Import mode</legend>
                    <label>
                      <input
                        type="radio"
                        name="import-mode"
                        value="merge"
                        checked={importDraft.mode === 'merge'}
                        onChange={() => setImportDraft((draft) => ({ ...draft, mode: 'merge' }))}
                      />
                      <span>
                        <strong>Merge into this account</strong>
                        <small>Existing IDs stay untouched; duplicate names are renamed.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="import-mode"
                        value="emptyOnly"
                        checked={importDraft.mode === 'emptyOnly'}
                        onChange={() => setImportDraft((draft) => ({ ...draft, mode: 'emptyOnly' }))}
                      />
                      <span>
                        <strong>Restore only if empty</strong>
                        <small>Best for moving an export into a fresh account.</small>
                      </span>
                    </label>
                  </fieldset>
                )}

                {Object.values(importDraft.preview.duplicateIds).some((count) => count > 0) && (
                  <p className="text-muted import-note">
                    {Object.values(importDraft.preview.duplicateIds).reduce((sum, count) => sum + count, 0)} existing ID {Object.values(importDraft.preview.duplicateIds).reduce((sum, count) => sum + count, 0) === 1 ? 'match' : 'matches'} will be skipped in merge mode.
                  </p>
                )}

                {importDraft.preview.isEmpty && (
                  <p className="text-muted import-note">This file does not contain exercises, routines, or workouts.</p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {accountModal === 'delete' && (
        <Modal
          title="Delete Account"
          onClose={() => !accountBusy && setAccountModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAccountModal(null)} disabled={accountBusy}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteAccount} disabled={accountBusy}>
                {accountBusy ? 'Deleting…' : 'Delete Everything'}
              </button>
            </>
          }
        >
          <p>This permanently deletes your exercises, workouts, templates, settings, and feedback from the backend.</p>
        </Modal>
      )}

      {accountModal === 'support' && (
        <Modal title="Privacy & Support" onClose={() => setAccountModal(null)}>
          <div className="support-modal">
            <p className="support-build">Build {buildLabel()}</p>
            <div className="support-links">
              <a href="/support.html" target="_blank" rel="noreferrer" className="support-link">
                Support <ExternalLink size={14} />
              </a>
              <a href="/privacy.html" target="_blank" rel="noreferrer" className="support-link">
                Privacy Policy <ExternalLink size={14} />
              </a>
            </div>
            <dl className="support-facts">
              <div>
                <dt>Request IDs</dt>
                <dd>Error banners include a Request ID when the backend returns one.</dd>
              </div>
              <div>
                <dt>Data controls</dt>
                <dd>You can export your data or delete the account from this menu.</dd>
              </div>
            </dl>
          </div>
        </Modal>
      )}

      {showOnboarding && (
        <Modal
          title="Start Forge"
          onClose={() => dismissOnboarding()}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => dismissOnboarding()}>Not Now</button>
              <button className="btn btn-primary" onClick={() => dismissOnboarding('log')}>Log Workout</button>
            </>
          }
        >
          <div className="onboarding-modal">
            <p className="text-muted">Pick a starting point for this account.</p>
            <div className="onboarding-actions">
              <button className="support-link" onClick={() => dismissOnboarding('templates')}>
                <span>Build a Routine</span>
                <ChevronRight size={16} />
              </button>
              <button className="support-link" onClick={() => dismissOnboarding('exercises')}>
                <span>Browse Exercise Library</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
