import { useState } from 'react';
import './index.css';
import { getExercises, getTemplates, getLogs } from './store';
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
  const [page, setPage] = useState('log');
  const [exercises, setExercises] = useState(getExercises);
  const [templates, setTemplates] = useState(getTemplates);
  const [logs, setLogs] = useState(getLogs);
  const [pendingTemplate, setPendingTemplate] = useState(null);

  function handleStartWorkout(template) {
    setPendingTemplate(template);
    setPage('log');
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
      </nav>

      <main className="main">
        {page === 'exercises' && (
          <Exercises
            exercises={exercises}
            onUpdate={setExercises}
          />
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
          <Calendar
            logs={logs}
            exercises={exercises}
            onUpdate={setLogs}
          />
        )}
      </main>
    </div>
  );
}
