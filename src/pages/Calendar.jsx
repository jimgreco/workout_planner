import { useState } from 'react';
import Modal from '../components/Modal';
import WorkoutBuilder from '../components/WorkoutBuilder';
import { deleteLog } from '../store';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function Calendar({ logs, exercises, onUpdate }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewLog, setViewLog] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  // Build map: dateStr -> logs[]
  const logsByDate = {};
  for (const log of logs) {
    if (!logsByDate[log.date]) logsByDate[log.date] = [];
    logsByDate[log.date].push(log);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Calendar cell data
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  // Leading days from previous month
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true });
  }
  // Trailing days from next month
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false });
  }

  function handleCellClick(cell) {
    if (!cell.current) return;
    const dateStr = toDateStr(year, month, cell.day);
    setSelectedDate(dateStr === selectedDate ? null : dateStr);
  }

  function handleDeleteLog(id) {
    const updated = deleteLog(id);
    onUpdate(updated);
    setConfirmDelete(null);
    if (viewLog?.id === id) setViewLog(null);
  }

  const selectedLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  return (
    <div className="page">
      <h1>Calendar</h1>

      <div className="calendar-nav">
        <button className="btn btn-secondary btn-sm" onClick={prevMonth}>‹ Prev</button>
        <h2>{MONTHS[month]} {year}</h2>
        <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Next ›</button>
      </div>

      <div className="calendar-grid">
        {DAYS.map((d) => (
          <div key={d} className="cal-header-cell">{d}</div>
        ))}
        {cells.map((cell, idx) => {
          const dateStr = cell.current ? toDateStr(year, month, cell.day) : null;
          const dayLogs = dateStr ? (logsByDate[dateStr] || []) : [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasLog = dayLogs.length > 0;

          return (
            <div
              key={idx}
              className={[
                'cal-cell',
                !cell.current ? 'cal-other-month' : '',
                isToday ? 'cal-today' : '',
                hasLog ? 'cal-has-log' : '',
                isSelected ? 'cal-selected' : '',
              ].join(' ')}
              onClick={() => handleCellClick(cell)}
            >
              <span className="cal-date">{cell.day}</span>
              {hasLog && <span className="cal-dot" />}
              {hasLog && dayLogs.length > 1 && (
                <span className="cal-count">×{dayLogs.length}</span>
              )}
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
          ) : (
            selectedLogs.map((log) => (
              <div key={log.id} className="card">
                <div className="card-header">
                  <div>
                    <h3>{log.name}</h3>
                    <p className="text-muted">
                      {(log.exerciseItems || []).length} exercise{(log.exerciseItems || []).length !== 1 ? 's' : ''} ·{' '}
                      {(log.exerciseItems || []).reduce((acc, i) => acc + i.sets.length, 0)} sets
                    </p>
                  </div>
                  <div className="flex gap-8">
                    <button className="btn btn-secondary btn-sm" onClick={() => setViewLog(log)}>
                      View
                    </button>
                    <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(log)}>🗑️</button>
                  </div>
                </div>
                {log.notes && (
                  <p className="text-muted" style={{ fontStyle: 'italic', marginTop: 4 }}>"{log.notes}"</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {viewLog && (
        <Modal
          title={viewLog.name}
          onClose={() => setViewLog(null)}
          footer={<button className="btn btn-secondary" onClick={() => setViewLog(null)}>Close</button>}
        >
          <p className="text-muted" style={{ marginBottom: 14 }}>
            {new Date(viewLog.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
          <WorkoutBuilder
            exercises={exercises}
            items={viewLog.exerciseItems || []}
            onChange={() => {}}
            readOnly
          />
          {viewLog.notes && (
            <>
              <hr className="divider" />
              <p className="text-muted" style={{ fontStyle: 'italic' }}>Notes: {viewLog.notes}</p>
            </>
          )}
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete Workout Log"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteLog(confirmDelete.id)}>Delete</button>
            </>
          }
        >
          <p>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
