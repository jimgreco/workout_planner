import { useState, useCallback, useEffect } from 'react';
import './index.css';
import { 
  Dumbbell, 
  Calendar as CalendarIcon, 
  LayoutGrid, 
  Library, 
  X,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { getStoredUser, getStoredCredential, storeUser, clearStoredUser, DEV_BYPASS, DEV_USER } from './auth.js';
import { initData, resetData, getExercises, getTemplates, getLogs, getSettings } from './api.js';
import Login from './pages/Login.jsx';
import Exercises from './pages/Exercises.jsx';
import Templates from './pages/Templates.jsx';
import WorkoutLog from './pages/WorkoutLog.jsx';
import Calendar from './pages/Calendar.jsx';

const PAGES = [
  { id: 'log',       label: 'Workout',  icon: Dumbbell },
  { id: 'history',   label: 'History',   icon: CalendarIcon },
  { id: 'templates', label: 'Templates', icon: LayoutGrid },
  { id: 'exercises', label: 'Library',   icon: Library },
];

export default function App() {
  // Dev bypass: skip login entirely with a mock user (VITE_DEV_BYPASS_AUTH=true).
  // Normal: require a stored profile + a still-valid Google credential.
  const storedUser = DEV_BYPASS ? DEV_USER : getStoredUser();
  const hasValidSession = DEV_BYPASS || (!!storedUser && !!getStoredCredential());

  const [user, setUser]           = useState(hasValidSession ? storedUser : null);
  const [loading, setLoading]     = useState(hasValidSession); // fetch data on first render
  const [dataError, setDataError] = useState(null);
  const [page, setPage]           = useState('log');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs]           = useState([]);
  const [settings, setSettings]   = useState({ defaultSets: 4, defaultReps: 8 });
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  // ── Load data after login (or on first render with a valid session) ────────
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setDataError(null);
    initData()
      .then(() => {
        setExercises(getExercises());
        setTemplates(getTemplates());
        setLogs(getLogs());
        setSettings(getSettings());
      })
      .catch((err) => {
        if (err.name !== 'AuthError') setDataError(err.message);
      })
      .finally(() => setLoading(false));
  }, [user]);

  // ── Global auth-error handler (fired by api.js on 401 / missing credential) ──
  useEffect(() => {
    const onAuthError = () => handleSignOut();
    window.addEventListener('wp:auth-error', onAuthError);
    return () => window.removeEventListener('wp:auth-error', onAuthError);
  }, []);

  // ── Auth callbacks ─────────────────────────────────────────────────────────
  const handleLogin = useCallback((profile) => {
    storeUser(profile);
    setUser(profile);
  }, []);

  function handleSignOut() {
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const close = () => setShowUserMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showUserMenu]);

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return <Login onLogin={handleLogin} />;
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
        <button className="btn btn-secondary" onClick={() => { setDataError(null); setLoading(true); }}>
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
          <Dumbbell className="logo-icon" size={22} />
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
            <div className="dropdown-info">
              <span className="dropdown-name">{user.name}</span>
              <span className="dropdown-email">{user.email}</span>
            </div>
            <hr className="dropdown-divider" />
            <button className="dropdown-item logout-item" onClick={handleSignOut}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </header>

      {/* Sidebar (Desktop only) */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Dumbbell className="logo-icon" size={32} />
          <div className="logo-text">
            <span className="logo-main">Forge</span>
            <span className="logo-sub">Workout Planner</span>
          </div>
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
              <span className="user-meta">Account settings</span>
            </div>
          </button>

          {showUserMenu && (
            <div className="user-dropdown sidebar-dropdown" onClick={(e) => e.stopPropagation()}>
              <div className="dropdown-info">
                <span className="dropdown-name">{user.name}</span>
                <span className="dropdown-email">{user.email}</span>
              </div>
              <hr className="dropdown-divider" />
              <button className="dropdown-item logout-item" onClick={handleSignOut}>
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        {page === 'exercises' && (
          <Exercises exercises={exercises} logs={logs} onUpdate={setExercises} />
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
    </div>
  );
}
