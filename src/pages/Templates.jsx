import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  Settings,
  SkipForward,
  Target,
  Trash2,
} from 'lucide-react';
import Modal from '../components/Modal.jsx';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import { saveTemplate, deleteTemplate, saveSettings, saveProgram, deleteProgram, saveLog } from '../api.js';

const WEEKDAYS = [
  { value: 0, label: 'Sun', long: 'Sunday' },
  { value: 1, label: 'Mon', long: 'Monday' },
  { value: 2, label: 'Tue', long: 'Tuesday' },
  { value: 3, label: 'Wed', long: 'Wednesday' },
  { value: 4, label: 'Thu', long: 'Thursday' },
  { value: 5, label: 'Fri', long: 'Friday' },
  { value: 6, label: 'Sat', long: 'Saturday' },
];

const PROGRESSION_TYPES = [
  { value: 'double_progression', label: 'Reps, then weight' },
  { value: 'linear_weight', label: 'Add weight' },
  { value: 'linear_reps', label: 'Add reps' },
  { value: 'none', label: 'No structured rule' },
];

function defaultProgression(type = 'double_progression') {
  return {
    type,
    minReps: 8,
    maxReps: 12,
    repIncrement: 1,
    weightIncrement: 5,
  };
}

const emptyTemplate = () => ({ name: '', description: '', exerciseItems: [] });
const emptyProgram = () => ({ name: '', description: '', active: true, schedule: [], progression: defaultProgression(), progressionRule: '' });
const STARTER_TEMPLATES = [
  {
    name: 'Push Starter',
    description: 'Chest, shoulders, and triceps',
    exerciseNames: ['Bench Press', 'Overhead Press', 'Tricep Pushdown'],
  },
  {
    name: 'Pull Starter',
    description: 'Back and biceps',
    exerciseNames: ['Lat Pulldown', 'Seated Cable Row', 'Dumbbell Curl'],
  },
  {
    name: 'Legs Starter',
    description: 'Quads, hamstrings, and calves',
    exerciseNames: ['Barbell Squat', 'Romanian Deadlift', 'Standing Calf Raise'],
  },
];

function starterSets(settings) {
  return Array.from({ length: settings.defaultSets }, () => ({ reps: String(settings.defaultReps), weight: '' }));
}

function buildStarterTemplates(exercises, settings) {
  const byName = new Map(exercises.map((exercise) => [exercise.name.toLowerCase(), exercise]));
  return STARTER_TEMPLATES.map((starter) => {
    const exerciseItems = starter.exerciseNames
      .map((name) => byName.get(name.toLowerCase()))
      .filter(Boolean)
      .map((exercise) => ({ exerciseId: exercise.id, weightType: 'weight', sets: starterSets(settings) }));
    return { name: starter.name, description: starter.description, exerciseItems };
  }).filter((template) => template.exerciseItems.length > 0);
}

function localDateKey(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateLabel(date) {
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (localDateKey(date) === localDateKey(today)) return 'Today';
  if (localDateKey(date) === localDateKey(tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function progressionForForm(progression, fallbackType = 'double_progression') {
  return {
    ...defaultProgression(fallbackType),
    ...(progression || {}),
    type: progression?.type || fallbackType,
  };
}

function cleanProgression(progression) {
  const rule = progressionForForm(progression);
  if (rule.type === 'none') return null;

  const cleaned = { type: rule.type };
  const minReps = Number.parseInt(rule.minReps, 10);
  const maxReps = Number.parseInt(rule.maxReps, 10);
  const repIncrement = Number.parseInt(rule.repIncrement, 10);
  const weightIncrement = Number.parseFloat(rule.weightIncrement);

  if (rule.type === 'double_progression') {
    if (Number.isInteger(minReps)) cleaned.minReps = minReps;
    if (Number.isInteger(maxReps)) cleaned.maxReps = Math.max(maxReps, cleaned.minReps ?? maxReps);
  }
  if (rule.type === 'double_progression' || rule.type === 'linear_reps') {
    if (Number.isInteger(repIncrement)) cleaned.repIncrement = repIncrement;
  }
  if (rule.type === 'double_progression' || rule.type === 'linear_weight') {
    if (Number.isFinite(weightIncrement)) cleaned.weightIncrement = weightIncrement;
  }
  return cleaned;
}

function progressionSummary(progression) {
  const rule = progressionForForm(progression, progression?.type || 'none');
  if (!progression || rule.type === 'none') return '';
  if (rule.type === 'double_progression') {
    return `${rule.minReps}-${rule.maxReps} reps, +${rule.repIncrement} rep until cap, then +${formatNumber(rule.weightIncrement)} lb`;
  }
  if (rule.type === 'linear_weight') {
    return `Add ${formatNumber(rule.weightIncrement)} lb when all target reps are hit`;
  }
  if (rule.type === 'linear_reps') {
    return `Add ${rule.repIncrement} rep when all target reps are hit`;
  }
  return '';
}

function templateById(templates) {
  return new Map(templates.map((template) => [template.id, template]));
}

function isCompletedOn(logs, template, dayKey) {
  return logs.some((log) => (
    log.date === dayKey
    && log.status === 'finished'
    && String(log.name ?? '').trim().toLowerCase() === template.name.trim().toLowerCase()
  ));
}

function isSkippedOn(logs, template, dayKey) {
  return logs.some((log) => (
    log.date === dayKey
    && log.status === 'skipped'
    && String(log.name ?? '').trim().toLowerCase() === template.name.trim().toLowerCase()
  ));
}

function isHandledOn(logs, template, dayKey) {
  return isCompletedOn(logs, template, dayKey) || isSkippedOn(logs, template, dayKey);
}

function scheduledTemplatesForWeekday(program, weekday, byId) {
  return (program?.schedule ?? [])
    .filter((item) => item.weekday === weekday)
    .map((entry) => ({ entry, template: byId.get(entry.templateId) }))
    .filter((item) => item.template);
}

function nextProgramWorkout(program, templates, logs) {
  if (!program?.schedule?.length) return null;
  const byId = templateById(templates);
  const today = startOfToday();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dayKey = localDateKey(date);
    const scheduled = scheduledTemplatesForWeekday(program, date.getDay(), byId);
    for (let index = 0; index < scheduled.length; index += 1) {
      const { entry, template } = scheduled[index];
      if (!isHandledOn(logs, template, dayKey)) {
        return { date, dayKey, entry, template, position: index + 1, total: scheduled.length };
      }
    }
  }
  return null;
}

function weekPlan(program, templates, logs) {
  const byId = templateById(templates);
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return WEEKDAYS.map((weekday, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const scheduled = scheduledTemplatesForWeekday(program, weekday.value, byId);
    const templatesForDay = scheduled.map((item) => item.template);
    const dayKey = localDateKey(date);
    const completedCount = templatesForDay.filter((template) => isCompletedOn(logs, template, dayKey)).length;
    const skippedCount = templatesForDay.filter((template) => isSkippedOn(logs, template, dayKey)).length;
    const handledCount = completedCount + skippedCount;
    const done = templatesForDay.length > 0 && completedCount === templatesForDay.length;
    const isPast = date < today;
    let status = 'rest';
    if (done) {
      status = 'done';
    } else if (templatesForDay.length > 0 && handledCount === templatesForDay.length) {
      status = 'skipped';
    } else if (templatesForDay.length > 0 && isPast) {
      status = 'missed';
    } else if (templatesForDay.length > 0) {
      status = 'planned';
    }
    return {
      ...weekday,
      date,
      dayKey,
      entries: scheduled.map((item) => item.entry),
      templates: templatesForDay,
      completedCount,
      skippedCount,
      status,
    };
  });
}

function cleanProgram(program) {
  const seen = new Set();
  const cleaned = {
    ...program,
    name: program.name.trim(),
    description: program.description?.trim() || '',
    progressionRule: program.progressionRule?.trim() || '',
    schedule: (program.schedule ?? [])
      .filter((item) => item.templateId)
      .map((item) => ({ weekday: Number(item.weekday), templateId: item.templateId, ...(item.notes ? { notes: item.notes } : {}) }))
      .filter((item) => {
        const key = `${item.weekday}:${item.templateId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.weekday - b.weekday),
  };
  const progression = cleanProgression(program.progression);
  if (progression) {
    cleaned.progression = progression;
  } else {
    delete cleaned.progression;
  }
  return cleaned;
}

export default function Templates({
  templates,
  exercises,
  logs = [],
  programs = [],
  settings,
  onUpdate,
  onProgramsUpdate = () => {},
  onLogsChanged = () => {},
  onSettingsUpdate,
  onStartWorkout,
}) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit' | 'view' | 'settings' | 'program'
  const [form, setForm]                 = useState(emptyTemplate());
  const [programForm, setProgramForm]   = useState(emptyProgram());
  const [settingsForm, setSettingsForm] = useState({ ...settings });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmProgramDelete, setConfirmProgramDelete] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showAddMenu, setShowAddMenu]   = useState(false);
  const addMenuRef = useRef(null);

  const activeProgram = useMemo(
    () => programs.find((program) => program.active) ?? programs[0] ?? null,
    [programs],
  );
  const nextWorkout = useMemo(
    () => nextProgramWorkout(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );
  const currentWeek = useMemo(
    () => weekPlan(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );

  function openAdd()      { setShowAddMenu(false); setForm(emptyTemplate()); setModal('add'); }
  function openEdit(t)    { setForm({ ...t }); setModal('edit'); }
  function openView(t)    { setForm({ ...t }); setModal('view'); }
  function openSettings() { setSettingsForm({ ...settings }); setModal('settings'); setSaved(false); }
  function openProgram(program = emptyProgram()) {
    setShowAddMenu(false);
    const isExisting = Boolean(program.id);
    setProgramForm({
      ...emptyProgram(),
      ...program,
      progression: progressionForForm(program.progression, isExisting ? 'none' : 'double_progression'),
      schedule: [...(program.schedule ?? [])],
    });
    setModal('program');
  }

  useEffect(() => {
    if (!showAddMenu) return undefined;
    const close = (event) => {
      if (!addMenuRef.current?.contains(event.target)) setShowAddMenu(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showAddMenu]);

  async function handleSave() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveTemplate({ ...form, name: form.name.trim() });
      onUpdate(updated);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProgram() {
    if (!programForm.name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveProgram(cleanProgram(programForm));
      onProgramsUpdate(updated);
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveSettings(settingsForm);
      onSettingsUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateStarters() {
    if (saving) return;
    setSaving(true);
    try {
      let updated = templates;
      for (const template of buildStarterTemplates(exercises, settings)) {
        updated = await saveTemplate(template);
      }
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      const updated = await deleteTemplate(id);
      onUpdate(updated);
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProgram(id) {
    setSaving(true);
    try {
      const updated = await deleteProgram(id);
      onProgramsUpdate(updated);
      setConfirmProgramDelete(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipNextWorkout() {
    if (!nextWorkout || saving) return;
    setSaving(true);
    try {
      const updated = await saveLog({
        name: nextWorkout.template.name,
        date: nextWorkout.dayKey,
        notes: 'Skipped from program',
        exerciseItems: [],
        status: 'skipped',
      });
      onLogsChanged(updated);
    } finally {
      setSaving(false);
    }
  }

  function toggleScheduledTemplate(weekday, templateId, checked) {
    setProgramForm((draft) => {
      const schedule = (draft.schedule ?? []).filter((item) => !(item.weekday === weekday && item.templateId === templateId));
      if (checked) schedule.push({ weekday, templateId });
      return { ...draft, schedule: schedule.sort((a, b) => a.weekday - b.weekday) };
    });
  }

  function scheduledTemplateIdsFor(weekday) {
    return new Set((programForm.schedule ?? []).filter((item) => item.weekday === weekday).map((item) => item.templateId));
  }

  function updateProgramProgression(patch) {
    setProgramForm((draft) => ({
      ...draft,
      progression: {
        ...progressionForForm(draft.progression, draft.progression?.type || 'double_progression'),
        ...patch,
      },
    }));
  }

  const settingsDirty = settingsForm.defaultSets !== settings.defaultSets || settingsForm.defaultReps !== settings.defaultReps;

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>Program</h1>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={openSettings}>
            <Settings size={18} /> Settings
          </button>
          <div className="add-menu-wrap" ref={addMenuRef} onClick={(event) => event.stopPropagation()}>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMenu((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={showAddMenu}
            >
              <Plus size={18} /> Add
            </button>
            {showAddMenu && (
              <div className="add-menu" role="menu">
                <button className="dropdown-item" role="menuitem" onClick={() => openProgram()}>
                  <CalendarDays size={16} /> New Program
                </button>
                <button className="dropdown-item" role="menuitem" onClick={openAdd}>
                  <LayoutGrid size={16} /> New Routine
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="program-section">
        <div className="program-section-heading">
          <div>
            <span className="section-kicker">Programs</span>
            <h2>Training Plan</h2>
          </div>
          <p>{programs.length === 1 ? '1 program' : `${programs.length} programs`}</p>
        </div>

      <div className="program-panel card">
        <div className="program-header">
          <div>
            <span className="section-kicker">Program</span>
            <h2>{activeProgram?.name || 'No active program'}</h2>
            {activeProgram?.description && <p className="text-muted">{activeProgram.description}</p>}
          </div>
          <div className="flex gap-8 card-actions">
            {activeProgram && (
              <button className="btn-icon" title="Edit Program" onClick={() => openProgram(activeProgram)}>
                <Pencil size={16} />
              </button>
            )}
            {activeProgram && (
              <button className="btn-icon" title="Delete Program" onClick={() => setConfirmProgramDelete(activeProgram)}>
                <Trash2 size={16} color="var(--danger)" />
              </button>
            )}
          </div>
        </div>

        {activeProgram ? (
          <>
            <div className="program-next">
              <div className="program-next-copy">
                <Target size={18} />
                <div>
                  <span>Next</span>
                  <strong>
                    {nextWorkout
                      ? `${dateLabel(nextWorkout.date)} - ${nextWorkout.template.name}${nextWorkout.total > 1 ? ` (${nextWorkout.position} of ${nextWorkout.total})` : ''}`
                      : 'No scheduled workout'}
                  </strong>
                </div>
              </div>
              <div className="program-next-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleSkipNextWorkout} disabled={!nextWorkout || saving}>
                  <SkipForward size={14} /> Skip
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onStartWorkout(nextWorkout.template)} disabled={!nextWorkout}>
                  <Play size={14} fill="currentColor" /> Start
                </button>
              </div>
            </div>

            <div className="program-week-grid">
              {currentWeek.map((day) => (
                <div key={day.value} className={`program-day ${day.status}`}>
                  <span>{day.label}</span>
                  <div className="program-day-routines">
                    {day.templates.length > 0 ? (
                      <>
                        {day.templates.slice(0, 2).map((template) => (
                          <strong key={template.id}>{template.name}</strong>
                        ))}
                        {day.templates.length > 2 && <em>+{day.templates.length - 2} more</em>}
                      </>
                    ) : (
                      <strong>Rest</strong>
                    )}
                  </div>
                  {(day.templates.length > 1 || day.skippedCount > 0) && (
                    <small className="program-day-count">
                      {day.completedCount + day.skippedCount}/{day.templates.length}{day.skippedCount > 0 ? ' handled' : ''}
                    </small>
                  )}
                  {day.status === 'done' && <CheckCircle2 size={14} aria-label="Done" />}
                  {day.status === 'skipped' && <SkipForward size={14} aria-label="Skipped" />}
                </div>
              ))}
            </div>

            {progressionSummary(activeProgram.progression) && (
              <p className="program-rule">
                <Target size={15} />
                {progressionSummary(activeProgram.progression)}
              </p>
            )}
            {activeProgram.progressionRule && (
              <p className="program-rule">
                <CalendarDays size={15} />
                {activeProgram.progressionRule}
              </p>
            )}
          </>
        ) : (
          <div className="program-empty">
            <CalendarDays size={22} />
            <span>Schedule routines by weekday, then start the next planned workout from here.</span>
          </div>
        )}
      </div>
      </section>

      <section className="routine-library-section">
        <div className="program-section-heading">
          <div>
            <span className="section-kicker">Routines</span>
            <h2>Routine Library</h2>
          </div>
          <p>{templates.length === 1 ? '1 routine' : `${templates.length} routines`}</p>
        </div>

        <div className="routine-list">
        {templates.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><LayoutGrid size={48} /></div>
            <p>No routines yet. Create one to save your favorite workouts.</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={handleCreateStarters} disabled={saving || exercises.length === 0}>
                <Plus size={16} /> Add Starter Routines
              </button>
            </div>
          </div>
        )}

        {templates.map((t) => (
          <div key={t.id} className="card">
            <div className="card-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{t.name}</h3>
                {t.description && <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{t.description}</p>}
              </div>
              <div className="flex gap-8 items-center card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openView(t)}>
                  <Eye size={14} /> View
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onStartWorkout(t)}>
                  <Play size={14} fill="currentColor" /> Start
                </button>
                <button className="btn-icon" title="Edit" onClick={() => openEdit(t)}>
                  <Pencil size={16} />
                </button>
                <button className="btn-icon" title="Delete" onClick={() => setConfirmDelete(t)}>
                  <Trash2 size={16} color="var(--danger)" />
                </button>
              </div>
            </div>
            <div className="flex gap-8" style={{ flexWrap: 'wrap', marginTop: 12 }}>
              {(t.exerciseItems || []).map((item) => {
                const ex = exercises.find((e) => e.id === item.exerciseId);
                if (!ex) return null;
                return (
                  <span key={item.exerciseId} className="badge">
                    {item.supersetGroup ? `SS ${item.supersetGroup} · ` : ''}{ex.name} • {item.sets.length} {item.sets.length === 1 ? 'set' : 'sets'}
                  </span>
                );
              })}
              {(!t.exerciseItems || t.exerciseItems.length === 0) && (
                <span className="text-muted" style={{ fontSize: 13 }}>No exercises added</span>
              )}
            </div>
          </div>
        ))}
        </div>
      </section>

      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'New Routine' : 'Edit Routine'}
          onClose={() => !saving && setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim() || saving}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Routine' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Routine Name *</label>
            <input
              type="text"
              placeholder="e.g. Push Day, Leg Day…"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              placeholder="Brief description…"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <hr className="divider" />
          <h3>Exercises</h3>
          <WorkoutBuilder
            exercises={exercises}
            items={form.exerciseItems || []}
            onChange={(items) => setForm({ ...form, exerciseItems: items })}
            showWeight={false}
            defaultSets={settings.defaultSets}
            defaultReps={settings.defaultReps}
          />
        </Modal>
      )}

      {modal === 'view' && (
        <Modal
          title={form.name}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setModal(null); onStartWorkout(form); }}>
                Start Workout
              </button>
            </>
          }
        >
          {form.description && <p className="text-muted" style={{ marginBottom: 14 }}>{form.description}</p>}
          <WorkoutBuilder
            exercises={exercises}
            items={form.exerciseItems || []}
            onChange={() => {}}
            readOnly
            showWeight={false}
          />
        </Modal>
      )}

      {modal === 'program' && (
        <Modal
          title={programForm.id ? 'Edit Program' : 'New Program'}
          onClose={() => !saving && setModal(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveProgram} disabled={!programForm.name.trim() || saving}>
                {saving ? 'Saving…' : programForm.id ? 'Save Program' : 'Create Program'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Program Name *</label>
            <input
              type="text"
              placeholder="e.g. 3 Day Strength"
              value={programForm.name}
              onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              type="text"
              placeholder="Block focus, phase, or goal"
              value={programForm.description || ''}
              onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(programForm.active)}
              onChange={(e) => setProgramForm({ ...programForm, active: e.target.checked })}
            />
            <span>Active Program</span>
          </label>

          <hr className="divider" />
          <h3>Weekly Schedule</h3>
          <div className="program-schedule-editor">
            {WEEKDAYS.map((weekday) => {
              const selectedTemplateIds = scheduledTemplateIdsFor(weekday.value);
              return (
                <div key={weekday.value} className="program-schedule-row">
                  <span className="program-schedule-day">{weekday.long}</span>
                  {templates.length === 0 ? (
                    <span className="program-schedule-empty">Create a routine first</span>
                  ) : (
                    <div className="program-schedule-options">
                      {templates.map((template) => (
                        <label key={template.id} className="program-schedule-option">
                          <input
                            type="checkbox"
                            checked={selectedTemplateIds.has(template.id)}
                            onChange={(event) => toggleScheduledTemplate(weekday.value, template.id, event.target.checked)}
                          />
                          <span>{template.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="form-group">
            <label>Progression Rule</label>
            <select
              aria-label="Progression rule"
              value={programForm.progression?.type || 'none'}
              onChange={(e) => updateProgramProgression({ type: e.target.value })}
            >
              {PROGRESSION_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {programForm.progression?.type !== 'none' && (
            <div className="progression-grid">
              {programForm.progression?.type === 'double_progression' && (
                <>
                  <div className="form-group">
                    <label>Min Reps</label>
                    <input
                      type="number"
                      aria-label="Minimum reps"
                      min="1"
                      max="100"
                      value={programForm.progression?.minReps ?? 8}
                      onChange={(e) => updateProgramProgression({ minReps: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Reps</label>
                    <input
                      type="number"
                      aria-label="Maximum reps"
                      min="1"
                      max="100"
                      value={programForm.progression?.maxReps ?? 12}
                      onChange={(e) => updateProgramProgression({ maxReps: e.target.value })}
                    />
                  </div>
                </>
              )}
              {(programForm.progression?.type === 'double_progression' || programForm.progression?.type === 'linear_reps') && (
                <div className="form-group">
                  <label>Rep Increment</label>
                  <input
                    type="number"
                    aria-label="Rep increment"
                    min="1"
                    max="20"
                    value={programForm.progression?.repIncrement ?? 1}
                    onChange={(e) => updateProgramProgression({ repIncrement: e.target.value })}
                  />
                </div>
              )}
              {(programForm.progression?.type === 'double_progression' || programForm.progression?.type === 'linear_weight') && (
                <div className="form-group">
                  <label>Weight Increment</label>
                  <input
                    type="number"
                    aria-label="Weight increment"
                    min="0.25"
                    max="200"
                    step="0.25"
                    value={programForm.progression?.weightIncrement ?? 5}
                    onChange={(e) => updateProgramProgression({ weightIncrement: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          {progressionSummary(programForm.progression) && (
            <p className="program-rule-preview">
              {progressionSummary(programForm.progression)}
            </p>
          )}

          <div className="form-group">
            <label>Progression Notes (optional)</label>
            <textarea
              rows={3}
              placeholder="Any exercise-specific exceptions, deload notes, or coaching cues"
              value={programForm.progressionRule || ''}
              onChange={(e) => setProgramForm({ ...programForm, progressionRule: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {modal === 'settings' && (
        <Modal
          title="Workout Defaults"
          onClose={() => !saving && setModal(null)}
          footer={
            <div className="flex gap-8 items-center justify-end" style={{ width: '100%' }}>
              {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved!</span>}
              <button className="btn btn-secondary" onClick={() => setModal(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={!settingsDirty || saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          }
        >
          <p className="text-muted" style={{ marginBottom: 20 }}>
            These values are used when adding a new exercise to a workout or routine.
          </p>

          <div className="form-group">
            <label>Default Sets</label>
            <input
              type="number"
              min="1"
              max="20"
              value={settingsForm.defaultSets}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultSets: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="form-group">
            <label>Default Reps</label>
            <input
              type="number"
              min="1"
              max="100"
              value={settingsForm.defaultReps}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultReps: parseInt(e.target.value) || 1 })}
            />
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete Routine"
          onClose={() => !saving && setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete.id)} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>Delete routine <strong>{confirmDelete.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}

      {confirmProgramDelete && (
        <Modal
          title="Delete Program"
          onClose={() => !saving && setConfirmProgramDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmProgramDelete(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteProgram(confirmProgramDelete.id)} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>Delete program <strong>{confirmProgramDelete.name}</strong>? Routines and logs stay untouched.</p>
        </Modal>
      )}
    </div>
  );
}
