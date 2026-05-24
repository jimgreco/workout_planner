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
  getSettings,
  exportData,
  submitFeedback,
  deleteAccount as deleteAccountData,
  flushPendingLogSaves,
  pendingLogSaveCount,
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
  { id: 'log',       label: 'Burn!',    icon: Dumbbell },
  { id: 'progress',  label: 'Progress', icon: TrendingUp },
  { id: 'history',   label: 'History',   icon: CalendarIcon },
  { id: 'templates', label: 'Workouts',  icon: ClipboardList },
  { id: 'exercises', label: 'Exercises', icon: BicepsFlexed },
];

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
  const [accountModal, setAccountModal] = useState(null); // null | 'feedback' | 'delete' | 'support'
  const [feedbackText, setFeedbackText] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [isOffline, setIsOffline] = useState(() => (
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  ));
  const [pendingSyncCount, setPendingSyncCount] = useState(() => pendingLogSaveCount());
  const [syncingPending, setSyncingPending] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs]           = useState([]);
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
    setSettings({ defaultSets: 4, defaultReps: 8 });
    setPendingTemplate(null);
    setEditingLog(null);
    setPage('log');
    setShowUserMenu(false);
    setAccountModal(null);
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

  async function handleFlushPendingLogs() {
    if (syncingPending) return;
    setSyncingPending(true);
    try {
      const updated = await flushPendingLogSaves();
      setLogs(updated);
      setPendingSyncCount(pendingLogSaveCount());
      if (pendingLogSaveCount() === 0) {
        setNotice({ type: 'success', message: 'Pending workout changes synced.' });
      }
    } finally {
      setSyncingPending(false);
    }
  }

  useEffect(() => {
    const updateOnlineStatus = () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);
      if (!offline && pendingLogSaveCount() > 0) {
        handleFlushPendingLogs();
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
      setPendingSyncCount(event.detail?.pendingLogSaves ?? pendingLogSaveCount());
    };
    window.addEventListener('wp:sync-status', onSyncStatus);
    return () => window.removeEventListener('wp:sync-status', onSyncStatus);
  }, []);

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
            <span>{pendingSyncCount} workout {pendingSyncCount === 1 ? 'change is' : 'changes are'} waiting to sync.</span>
            <button className="btn btn-secondary btn-sm" onClick={handleFlushPendingLogs} disabled={syncingPending || isOffline}>
              {syncingPending ? 'Syncing…' : 'Sync now'}
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
            settings={settings}
            onUpdate={setTemplates}
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
    </div>
  );
}
