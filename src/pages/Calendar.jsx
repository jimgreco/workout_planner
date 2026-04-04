import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import { deleteLog } from '../api.js';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return '—';
  const mins = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Calendar({ logs, exercises, onUpdate, onEditLog }) {
  const now  = new Date();
  const [year, setYear]               = useState(now.getFullYear());
  const [month, setMonth]             = useState(now.getMonth());
  const [view, setView]               = useState('list'); // 'list' | 'calendar'
  const [expandedId, setExpandedId]   = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]       = useState(false);

  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  // Only show finished workouts
  const finishedLogs = logs
    .filter((l) => l.status === 'finished')
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  const logsByDate = {};
  for (const log of finishedLogs) {
    if (!logsByDate[log.date]) logsByDate[log.date] = [];
    logsByDate[log.date].push(log);
  }

  // Calendar navigation
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--)
    cells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, current: true });
  while (cells.length < 42)
    cells.push({ day: cells.length - daysInMonth - firstDayOfMonth + 1, current: false });

  function handleCellClick(cell) {
    if (!cell.current) return;
    const dateStr = toDateStr(year, month, cell.day);
    setSelectedDate(dateStr === selectedDate ? null : dateStr);
  }

  async function handleDeleteLog(id) {
    setDeleting(true);
    try {
      const updated = await deleteLog(id);
      onUpdate(updated);
      setConfirmDelete(null);
      if (expandedId === id) setExpandedId(null);
    } finally {
      setDeleting(false);
    }
  }

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  const selectedLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  // ── List View ────────────────────────────────────────────────────────────
  function renderListView() {
    if (finishedLogs.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <p>No finished workouts yet. Complete a workout to see it here!</p>
        </div>
      );
    }

    return (
      <div className="history-list">
        {finishedLogs.map((log) => {
          const d = new Date(log.date + 'T00:00:00');
          const dayName = DAY_NAMES[d.getDay()];
          const duration = formatDuration(log.startTime, log.endTime);
          const exCount = (log.exerciseItems || []).length;
          const isExpanded = expandedId === log.id;

          return (
            <div key={log.id} className={`history-item ${isExpanded ? 'expanded' : ''}`}>
              <div className="history-item-header" onClick={() => toggleExpand(log.id)}>
                <div className="history-item-left">
                  <div className="history-item-title">
                    {log.hasPB && <span className="pb-star" title="Personal best!">★</span>}
                    {log.name}
                  </div>
                  <div className="history-item-meta">
                    {dayName} · {formatDateNice(log.date)}
                  </div>
                </div>
                <div className="history-item-right">
                  <span className="history-stat">{duration}</span>
                  <span className="history-stat">{exCount} exercise{exCount !== 1 ? 's' : ''}</span>
                  <span className="history-chevron">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="history-item-detail">
                  {(log.exerciseItems || []).map((item) => {
                    const ex = exercises.find((e) => e.id === item.exerciseId);
                    if (!ex) return null;
                    const isPB = (log.pbExerciseIds || []).includes(item.exerciseId);
                    return (
                      <div key={item.exerciseId} className="history-exercise">
                        <div className="history-exercise-name">
                          {isPB && <span className="pb-star-sm">★</span>}
                          {ex.name}
                          <span className="badge" style={{ marginLeft: 6 }}>{ex.muscleGroup}</span>
                        </div>
                        <div className="history-sets">
                          {item.sets.map((s, si) => (
                            <span key={si} className="history-set">
                              {s.reps || '—'} × {s.weight ? `${s.weight} lbs` : '—'}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {log.notes && (
                    <p className="text-muted" style={{ fontStyle: 'italic', marginTop: 8 }}>
                      "{log.notes}"
                    </p>
                  )}
                  <div className="history-item-actions">
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onEditLog(log); }}>
                      Edit
                    </button>
                    <button className="btn-icon" title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmDelete(log); }}>
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Calendar View ────────────────────────────────────────────────────────
  function renderCalendarView() {
    return (
      <>
        <div className="calendar-nav">
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>‹ Prev</button>
          <h2 style={{ marginBottom: 0 }}>{MONTHS[month]} {year}</h2>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Next ›</button>
        </div>

        <div className="calendar-grid">
          {DAYS.map((d) => <div key={d} className="cal-header-cell">{d}</div>)}
          {cells.map((cell, idx) => {
            const dateStr = cell.current ? toDateStr(year, month, cell.day) : null;
            const dayLogs = dateStr ? (logsByDate[dateStr] || []) : [];
            const isToday    = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasLog     = dayLogs.length > 0;
            const hasPB      = dayLogs.some((l) => l.hasPB);

            return (
              <div
                key={idx}
                className={[
                  'cal-cell',
                  !cell.current ? 'cal-other-month' : '',
                  isToday    ? 'cal-today'    : '',
                  hasLog     ? 'cal-has-log'  : '',
                  isSelected ? 'cal-selected' : '',
                ].join(' ')}
                onClick={() => handleCellClick(cell)}
              >
                <span className="cal-date">{cell.day}</span>
                {hasLog && <span className="cal-dot" />}
                {hasPB && <span className="pb-star-sm" style={{ fontSize: 10 }}>★</span>}
                {hasLog && dayLogs.length > 1 && <span className="cal-count">×{dayLogs.length}</span>}
              </div>
            );
          })}
        </div>

        {selectedDate && (
          <div style={{ marginTop: 24 }}>
            <h2>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </h2>

            {selectedLogs.length === 0 ? (
              <p className="text-muted">No workouts logged on this day.</p>
            ) : selectedLogs.map((log) => (
              <div key={log.id} className="card">
                <div className="card-header">
                  <div>
                    <h3>
                      {log.hasPB && <span className="pb-star">★ </span>}
                      {log.name}
                    </h3>
                    <p className="text-muted">
                      {formatDuration(log.startTime, log.endTime)} · {(log.exerciseItems || []).length} exercise{(log.exerciseItems || []).length !== 1 ? 's' : ''} · {(log.exerciseItems || []).reduce((acc, i) => acc + i.sets.length, 0)} sets
                    </p>
                  </div>
                  <div className="flex gap-8">
                    <button className="btn btn-secondary btn-sm" onClick={() => onEditLog(log)}>Edit</button>
                    <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(log)}>🗑️</button>
                  </div>
                </div>
                <WorkoutBuilder exercises={exercises} items={log.exerciseItems || []} onChange={() => {}} readOnly />
                {log.notes && (
                  <p className="text-muted" style={{ fontStyle: 'italic', marginTop: 8 }}>"{log.notes}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>History</h1>
        <div className="view-toggle">
          <button
            className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            className={`btn btn-sm ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
        </div>
      </div>

      {view === 'list' ? renderListView() : renderCalendarView()}

      {confirmDelete && (
        <Modal
          title="Delete Workout"
          onClose={() => !deleting && setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteLog(confirmDelete.id)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
