import { useState, useCallback, useEffect } from 'react';
import './index.css';
import { getStoredUser, getStoredCredential, storeUser, clearStoredUser, DEV_BYPASS, DEV_USER } from './auth.js';
import { initData, resetData, getExercises, getTemplates, getLogs } from './api.js';
import Login from './pages/Login.jsx';
import Exercises from './pages/Exercises.jsx';
import Templates from './pages/Templates.jsx';
import WorkoutLog from './pages/WorkoutLog.jsx';
import Calendar from './pages/Calendar.jsx';

const PAGES = [
  { id: 'log',       label: 'Log Workout',  icon: '💪' },
  { id: 'calendar',  label: 'Calendar',     icon: '📅' },
  { id: 'templates', label: 'Templates',    icon: '📋' },
  { id: 'exercises', label: 'Exercises',    icon: '🏋️' },
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

  const [exercises, setExercises] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs]           = useState([]);
  const [pendingTemplate, setPendingTemplate] = useState(null);

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
      })
      .catch((err) => {
        if (err.name !== 'AuthError') setDataError(err.message);
        // AuthError is handled by the wp:auth-error event below
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
    setPendingTemplate(null);
    setPage('log');
  }

  function handleStartWorkout(template) {
    setPendingTemplate(template);
    setPage('log');
  }

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
      <nav className="sidebar">
        <div className="sidebar-logo">
          WrkPlnr
          <span className="logo-sub">Workout Planner</span>
        </div>

        {PAGES.map((p) => (
          <button
            key={p.id}
            className={`nav-item ${page === p.id ? 'active' : ''}`}
            onClick={() => setPage(p.id)}
          >
            <span className="nav-icon">{p.icon}</span>
            {p.label}
          </button>
        ))}

        <div className="sidebar-spacer" />

        <div className="sidebar-user">
          {user.picture && (
            <img src={user.picture} alt="" className="user-avatar" referrerPolicy="no-referrer" />
          )}
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <button className="btn-signout" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </nav>

      <main className="main">
        {page === 'exercises' && (
          <Exercises exercises={exercises} onUpdate={setExercises} />
        )}
        {page === 'templates' && (
          <Templates
            templates={templates}
            exercises={exercises}
            onUpdate={setTemplates}
            onStartWorkout={handleStartWorkout}
          />
        )}
        {page === 'log' && (
          <WorkoutLog
            exercises={exercises}
            templates={templates}
            onSaved={setLogs}
            initialTemplate={pendingTemplate}
            onClearTemplate={() => setPendingTemplate(null)}
          />
        )}
        {page === 'calendar' && (
          <Calendar logs={logs} exercises={exercises} onUpdate={setLogs} />
        )}
      </main>
    </div>
  );
}
