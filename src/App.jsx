import { useState, useCallback } from 'react';
import './index.css';
import { getStoredUser, storeUser, clearStoredUser } from './auth';
import { getExercises, getTemplates, getLogs } from './store';
import Login from './pages/Login';
import Exercises from './pages/Exercises';
import Templates from './pages/Templates';
import WorkoutLog from './pages/WorkoutLog';
import Calendar from './pages/Calendar';

const PAGES = [
  { id: 'log',       label: 'Log Workout',  icon: '💪' },
  { id: 'calendar',  label: 'Calendar',     icon: '📅' },
  { id: 'templates', label: 'Templates',    icon: '📋' },
  { id: 'exercises', label: 'Exercises',    icon: '🏋️' },
];

export default function App() {
  const [user, setUser] = useState(getStoredUser);
  const [page, setPage] = useState('log');

  // Data state is initialized from localStorage for the stored user (if any).
  const [exercises, setExercises] = useState(() => user ? getExercises(user.sub) : []);
  const [templates, setTemplates] = useState(() => user ? getTemplates(user.sub) : []);
  const [logs, setLogs] = useState(() => user ? getLogs(user.sub) : []);
  const [pendingTemplate, setPendingTemplate] = useState(null);

  const handleLogin = useCallback((profile) => {
    storeUser(profile);
    setUser(profile);
    setExercises(getExercises(profile.sub));
    setTemplates(getTemplates(profile.sub));
    setLogs(getLogs(profile.sub));
  }, []);

  function handleSignOut() {
    clearStoredUser();
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

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

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
          <Exercises
            userId={user.sub}
            exercises={exercises}
            onUpdate={setExercises}
          />
        )}
        {page === 'templates' && (
          <Templates
            userId={user.sub}
            templates={templates}
            exercises={exercises}
            onUpdate={setTemplates}
            onStartWorkout={handleStartWorkout}
          />
        )}
        {page === 'log' && (
          <WorkoutLog
            userId={user.sub}
            exercises={exercises}
            templates={templates}
            onSaved={setLogs}
            initialTemplate={pendingTemplate}
            onClearTemplate={() => setPendingTemplate(null)}
          />
        )}
        {page === 'calendar' && (
          <Calendar
            userId={user.sub}
            logs={logs}
            exercises={exercises}
            onUpdate={setLogs}
          />
        )}
      </main>
    </div>
  );
}
