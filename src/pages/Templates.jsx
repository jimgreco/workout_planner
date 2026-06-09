import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Rewind,
  Settings,
  SkipForward,
  Target,
  Trash2,
} from 'lucide-react';
import Modal from '../components/Modal.jsx';
import WorkoutBuilder from '../components/WorkoutBuilder.jsx';
import Exercises, { ExerciseFormFields } from './Exercises.jsx';
import { cleanExerciseForm } from '../exerciseForm.js';
import { saveTemplate, deleteTemplate, saveSettings, saveProgram, deleteProgram, saveLog, saveExercise } from '../api.js';

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

const DELOAD_TYPES = [
  { value: 'none', label: 'No structured deload' },
  { value: 'every_n_weeks', label: 'Every N weeks' },
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

function defaultDeload(type = 'none') {
  return {
    type,
    everyWeeks: 4,
    loadPercent: 85,
    repPercent: 100,
    startDate: localDateKey(startOfToday()),
  };
}

const emptyTemplate = () => ({ name: '', description: '', exerciseItems: [] });
const emptyProgram = () => ({
  name: '',
  description: '',
  active: true,
  schedule: [],
  progression: defaultProgression(),
  deload: defaultDeload(),
  progressionRule: '',
});
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
      .map((exercise) => ({
        exerciseId: exercise.id,
        weightType: 'weight',
        ...(settings.defaultRestTargetSeconds > 0 ? { restTargetSeconds: settings.defaultRestTargetSeconds } : {}),
        description: exercise.description || '',
        useIndividualReps: false,
        sets: starterSets(settings),
      }));
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

function activityId() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function withProgramActivity(program, type, title, detail) {
  return {
    ...program,
    activity: [
      {
        id: activityId(),
        type,
        date: new Date().toISOString(),
        title,
        ...(detail ? { detail } : {}),
      },
      ...(program.activity ?? []),
    ].slice(0, 30),
  };
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

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function deloadForForm(deload, fallbackType = 'none') {
  return {
    ...defaultDeload(fallbackType),
    ...(deload || {}),
    type: deload?.type || fallbackType,
  };
}

function cleanDeload(deload) {
  const rule = deloadForForm(deload);
  if (rule.type === 'none') return null;

  const everyWeeks = Number.parseInt(rule.everyWeeks, 10);
  const loadPercent = Number.parseInt(rule.loadPercent, 10);
  const repPercent = Number.parseInt(rule.repPercent, 10);
  const startDate = parseLocalDate(rule.startDate) ? rule.startDate : localDateKey(startOfToday());

  return {
    type: 'every_n_weeks',
    everyWeeks: Number.isInteger(everyWeeks) ? Math.min(Math.max(everyWeeks, 2), 12) : 4,
    loadPercent: Number.isInteger(loadPercent) ? Math.min(Math.max(loadPercent, 40), 100) : 85,
    repPercent: Number.isInteger(repPercent) ? Math.min(Math.max(repPercent, 40), 100) : 100,
    startDate,
  };
}

function deloadInstruction(deload) {
  const rule = deloadForForm(deload);
  return `${rule.loadPercent ?? 85}% load / ${rule.repPercent ?? 100}% reps`;
}

function deloadSummary(deload) {
  const rule = deloadForForm(deload, deload?.type || 'none');
  if (!deload || rule.type === 'none') return '';
  const start = parseLocalDate(rule.startDate);
  const startLabel = start ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start) : 'today';
  return `Every ${rule.everyWeeks ?? 4} weeks: ${deloadInstruction(rule)}, starting ${startLabel}`;
}

function deloadWeekInfo(program, date = new Date()) {
  const rule = deloadForForm(program?.deload, program?.deload?.type || 'none');
  if (!program?.deload || rule.type === 'none') return null;
  const start = parseLocalDate(rule.startDate);
  if (!start) return null;

  const everyWeeks = Math.max(2, Number.parseInt(rule.everyWeeks, 10) || 4);
  const currentWeekStart = startOfWeek(date);
  const startWeek = startOfWeek(start);
  const weeksSinceStart = Math.max(0, Math.floor((currentWeekStart - startWeek) / (7 * 24 * 60 * 60 * 1000)));
  const weekNumber = weeksSinceStart + 1;
  const isDeload = weekNumber % everyWeeks === 0;
  const weeksUntilNext = isDeload ? everyWeeks : everyWeeks - (weekNumber % everyWeeks);
  const nextDate = new Date(currentWeekStart);
  nextDate.setDate(currentWeekStart.getDate() + weeksUntilNext * 7);

  return {
    isDeload,
    nextDate,
    weekNumber,
    instruction: deloadInstruction(rule),
  };
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

function moveScheduledWorkout(schedule, startWeekday, direction) {
  const normalized = (schedule ?? [])
    .filter((item) => item.templateId)
    .map((item) => ({ ...item, weekday: Number(item.weekday) }));
  if (!normalized.length) return normalized;

  const scheduleByDay = new Map(normalized.map((item) => [item.weekday, item]));
  const fallbackStart = normalized
    .map((item) => item.weekday)
    .sort((a, b) => a - b)[0];
  const start = Number.isInteger(startWeekday) ? startWeekday : fallbackStart;
  if (!scheduleByDay.has(start)) return normalized.sort((a, b) => a.weekday - b.weekday);

  let carry = scheduleByDay.get(start);
  scheduleByDay.delete(start);

  for (let step = 1; step <= 7; step += 1) {
    const targetDay = (start + (direction * step) + 7) % 7;
    const displaced = scheduleByDay.get(targetDay);
    scheduleByDay.set(targetDay, { ...carry, weekday: targetDay });
    if (!displaced) break;
    carry = displaced;
  }

  return [...scheduleByDay.values()].sort((a, b) => a.weekday - b.weekday);
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

function upcomingProgramSchedule(program, templates, logs, days = 21) {
  const byId = templateById(templates);
  const today = startOfToday();

  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dayKey = localDateKey(date);
    const scheduled = scheduledTemplatesForWeekday(program, date.getDay(), byId);
    const templatesForDay = scheduled.map((item) => item.template);
    const completedCount = templatesForDay.filter((template) => isCompletedOn(logs, template, dayKey)).length;
    const skippedCount = templatesForDay.filter((template) => isSkippedOn(logs, template, dayKey)).length;
    const handledCount = completedCount + skippedCount;
    const isPast = date < today;
    let status = 'rest';

    if (templatesForDay.length > 0 && completedCount === templatesForDay.length) {
      status = 'done';
    } else if (templatesForDay.length > 0 && handledCount === templatesForDay.length) {
      status = 'skipped';
    } else if (templatesForDay.length > 0 && isPast) {
      status = 'missed';
    } else if (templatesForDay.length > 0) {
      status = 'planned';
    }

    return {
      id: `${dayKey}-${offset}`,
      date,
      dayKey,
      templates: templatesForDay,
      completedCount,
      skippedCount,
      status,
    };
  });
}

function programAdherence(program, templates, logs, weeks = 4) {
  const byId = templateById(templates);
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(today.getDate() - ((weeks * 7) - 1));
  const summary = {
    weeks,
    scheduled: 0,
    completed: 0,
    skipped: 0,
    missed: 0,
    remainingToday: 0,
    completionRate: 0,
  };

  if (!program?.schedule?.length) return summary;

  for (let date = new Date(start); date <= today; date.setDate(date.getDate() + 1)) {
    const day = new Date(date);
    const dayKey = localDateKey(day);
    const scheduled = scheduledTemplatesForWeekday(program, day.getDay(), byId).map((item) => item.template);
    for (const template of scheduled) {
      summary.scheduled += 1;
      if (isCompletedOn(logs, template, dayKey)) {
        summary.completed += 1;
      } else if (isSkippedOn(logs, template, dayKey)) {
        summary.skipped += 1;
      } else if (day < today) {
        summary.missed += 1;
      } else {
        summary.remainingToday += 1;
      }
    }
  }

  summary.completionRate = summary.scheduled > 0
    ? Math.round((summary.completed / summary.scheduled) * 100)
    : 0;
  return summary;
}

function cleanProgram(program) {
  const seenWeekdays = new Set();
  const cleaned = {
    ...program,
    name: program.name.trim(),
    description: program.description?.trim() || '',
    progressionRule: program.progressionRule?.trim() || '',
    schedule: (program.schedule ?? [])
      .filter((item) => item.templateId)
      .map((item) => ({ weekday: Number(item.weekday), templateId: item.templateId, ...(item.notes ? { notes: item.notes } : {}) }))
      .filter((item) => {
        if (seenWeekdays.has(item.weekday)) return false;
        seenWeekdays.add(item.weekday);
        return true;
      })
      .sort((a, b) => a.weekday - b.weekday),
    activity: (program.activity ?? [])
      .filter((item) => item?.id && item?.type && item?.date && item?.title)
      .map((item) => ({
        id: String(item.id),
        type: String(item.type),
        date: String(item.date),
        title: String(item.title).trim(),
        ...(item.detail ? { detail: String(item.detail).trim() } : {}),
      }))
      .filter((item) => item.title)
      .slice(0, 30),
  };
  const progression = cleanProgression(program.progression);
  if (progression) {
    cleaned.progression = progression;
  } else {
    delete cleaned.progression;
  }
  const deload = cleanDeload(program.deload);
  if (deload) {
    cleaned.deload = deload;
  } else {
    delete cleaned.deload;
  }
  return cleaned;
}

export default function Templates({
  mode = 'all',
  templates,
  exercises,
  logs = [],
  programs = [],
  settings,
  onUpdate,
  onProgramsUpdate = () => {},
  onLogsChanged = () => {},
  onSettingsUpdate,
  onExercisesUpdate = () => {},
  onStartWorkout,
}) {
  const [modal, setModal]               = useState(null); // null | 'add' | 'edit' | 'view' | 'settings' | 'program'
  const [form, setForm]                 = useState(emptyTemplate());
  const [programForm, setProgramForm]   = useState(emptyProgram());
  const [settingsForm, setSettingsForm] = useState({ ...settings });
  const [exerciseForm, setExerciseForm] = useState(null);
  const [exerciseLibraryAction, setExerciseLibraryAction] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmProgramDelete, setConfirmProgramDelete] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showAddMenu, setShowAddMenu]   = useState(false);
  const addMenuRef = useRef(null);
  const showPrograms = mode === 'all' || mode === 'programs';
  const showRoutines = mode === 'all' || mode === 'routines';
  const showExerciseLibrary = mode === 'all';
  const pageTitle = mode === 'routines' ? 'Routines' : 'Program';

  const activeProgram = useMemo(
    () => programs.find((program) => program.active) ?? null,
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
  const upcomingSchedule = useMemo(
    () => upcomingProgramSchedule(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );
  const adherence = useMemo(
    () => programAdherence(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );
  const activeDeload = useMemo(
    () => deloadWeekInfo(activeProgram),
    [activeProgram],
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
      deload: deloadForForm(program.deload, program.deload?.type || 'none'),
      schedule: [...(program.schedule ?? [])],
    });
    setModal('program');
  }

  function openExerciseAdd() {
    setShowAddMenu(false);
    setExerciseLibraryAction({ type: 'add', nonce: Date.now() });
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

  async function handleSaveExerciseEdit() {
    if (!exerciseForm?.name?.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await saveExercise(cleanExerciseForm(exerciseForm));
      onExercisesUpdate(updated);
      setExerciseForm(null);
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
      const updatedPrograms = await saveProgram(cleanProgram(withProgramActivity(
        activeProgram,
        'skip',
        `Skipped ${nextWorkout.template.name}`,
        dateLabel(nextWorkout.date),
      )));
      onProgramsUpdate(updatedPrograms);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelayProgram() {
    if (!activeProgram?.schedule?.length || saving) return;
    setSaving(true);
    try {
      const delayed = {
        ...withProgramActivity(
          activeProgram,
          'delay',
          'Delayed schedule',
          nextWorkout ? `${nextWorkout.template.name} moved later from ${dateLabel(nextWorkout.date)}` : 'Moved next scheduled workout later',
        ),
        schedule: moveScheduledWorkout(activeProgram.schedule, nextWorkout?.entry?.weekday, 1),
      };
      const updated = await saveProgram(cleanProgram(delayed));
      onProgramsUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handlePullForwardProgram() {
    if (!activeProgram?.schedule?.length || saving) return;
    setSaving(true);
    try {
      const pulled = {
        ...withProgramActivity(
          activeProgram,
          'pull_forward',
          'Pulled schedule forward',
          nextWorkout ? `${nextWorkout.template.name} moved earlier from ${dateLabel(nextWorkout.date)}` : 'Moved next scheduled workout earlier',
        ),
        schedule: moveScheduledWorkout(activeProgram.schedule, nextWorkout?.entry?.weekday, -1),
      };
      const updated = await saveProgram(cleanProgram(pulled));
      onProgramsUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  function setScheduledTemplate(weekday, templateId) {
    setProgramForm((draft) => {
      const schedule = (draft.schedule ?? []).filter((item) => item.weekday !== weekday);
      if (templateId) schedule.push({ weekday, templateId });
      return { ...draft, schedule: schedule.sort((a, b) => a.weekday - b.weekday) };
    });
  }

  function scheduledTemplateIdFor(weekday) {
    return (programForm.schedule ?? []).find((item) => item.weekday === weekday)?.templateId || '';
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

  function updateProgramDeload(patch) {
    setProgramForm((draft) => ({
      ...draft,
      deload: {
        ...deloadForForm(draft.deload, draft.deload?.type || 'none'),
        ...patch,
      },
    }));
  }

  const settingsDirty = settingsForm.defaultSets !== settings.defaultSets
    || settingsForm.defaultReps !== settings.defaultReps
    || (settingsForm.defaultRestTargetSeconds || 0) !== (settings.defaultRestTargetSeconds || 0);

  return (
    <div className="page">
      <div className="action-row">
        <h1 style={{ marginBottom: 0 }}>{pageTitle}</h1>
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
                {showPrograms && (
                  <button className="dropdown-item" role="menuitem" onClick={() => openProgram()}>
                    <CalendarDays size={16} /> New Program
                  </button>
                )}
                {showRoutines && (
                  <button className="dropdown-item" role="menuitem" onClick={openAdd}>
                    <LayoutGrid size={16} /> New Routine
                  </button>
                )}
                {showExerciseLibrary && (
                  <button className="dropdown-item" role="menuitem" onClick={openExerciseAdd}>
                    <Plus size={16} /> New Exercise
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPrograms && (
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
                <button className="btn btn-secondary btn-sm" onClick={handleDelayProgram} disabled={!activeProgram?.schedule?.length || saving}>
                  <RefreshCcw size={14} /> Delay
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handlePullForwardProgram} disabled={!activeProgram?.schedule?.length || saving}>
                  <Rewind size={14} /> Pull Forward
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

            {upcomingSchedule.length > 0 && (
              <div className="program-upcoming" aria-label="Upcoming program schedule">
                <div className="program-upcoming-heading">
                  <strong>Upcoming</strong>
                  <span>Next 3 weeks</span>
                </div>
                <div className="program-upcoming-list">
                  {upcomingSchedule.map((day) => (
                    <div key={day.id} className={`program-upcoming-day ${day.status}`}>
                      <div>
                        <strong>{dateLabel(day.date)}</strong>
                        <span>{day.templates.length > 0 ? day.templates.map((template) => template.name).join(', ') : 'Rest'}</span>
                      </div>
                      <em>{day.status}</em>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adherence.scheduled > 0 && (
              <div className="program-adherence" aria-label={`${adherence.weeks} week program adherence`}>
                <div>
                  <strong>{adherence.completionRate}%</strong>
                  <span>{adherence.weeks}-week completion</span>
                </div>
                <div>
                  <strong>{adherence.completed}</strong>
                  <span>Completed</span>
                </div>
                <div>
                  <strong>{adherence.skipped}</strong>
                  <span>Skipped</span>
                </div>
                <div>
                  <strong>{adherence.missed}</strong>
                  <span>Missed</span>
                </div>
                {adherence.remainingToday > 0 && (
                  <div>
                    <strong>{adherence.remainingToday}</strong>
                    <span>Today</span>
                  </div>
                )}
              </div>
            )}

            {activeDeload && (
              <p className={`program-rule ${activeDeload.isDeload ? 'program-rule-highlight' : ''}`}>
                <RefreshCcw size={15} />
                {activeDeload.isDeload
                  ? `Deload week: use ${activeDeload.instruction}`
                  : `Next deload ${dateLabel(activeDeload.nextDate)}: use ${activeDeload.instruction}`}
              </p>
            )}
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
            {activeProgram.activity?.length > 0 && (
              <div className="program-activity" aria-label="Program activity">
                <div className="program-activity-heading">
                  <strong>Activity</strong>
                  <span>Recent changes</span>
                </div>
                <div className="program-activity-list">
                  {activeProgram.activity.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="program-activity-item">
                      <div>
                        <strong>{entry.title}</strong>
                        {entry.detail && <span>{entry.detail}</span>}
                      </div>
                      <time>{formatActivityDate(entry.date)}</time>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="program-empty">
            <CalendarDays size={22} />
            <span>Schedule routines by weekday, then start the next planned workout from here.</span>
          </div>
        )}
      </div>
        {programs.length > 0 && (
          <div className="program-list">
            {programs.map((program) => (
              <div key={program.id} className={`program-list-item ${program.active ? 'active' : 'inactive'}`}>
                <div>
                  <strong>{program.name || 'Untitled program'}</strong>
                  <span>{program.schedule?.length || 0} scheduled {program.schedule?.length === 1 ? 'day' : 'days'}</span>
                </div>
                <div className="flex gap-8 items-center card-actions">
                  <span className={`status-pill ${program.active ? 'active' : 'inactive'}`}>
                    {program.active ? 'Active' : 'Inactive'}
                  </span>
                  <button className="btn-icon" title="Edit Program" onClick={() => openProgram(program)}>
                    <Pencil size={16} />
                  </button>
                  <button className="btn-icon" title="Delete Program" onClick={() => setConfirmProgramDelete(program)}>
                    <Trash2 size={16} color="var(--danger)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {showRoutines && (
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
      )}

      {showExerciseLibrary && (
      <section className="exercise-library-section">
        <Exercises
          exercises={exercises}
          logs={logs}
          onUpdate={onExercisesUpdate}
          actionRequest={exerciseLibraryAction}
          embedded
        />
      </section>
      )}

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
            defaultRestTargetSeconds={settings.defaultRestTargetSeconds}
            planningMode
            onEditExercise={(exercise) => setExerciseForm({ ...exercise })}
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
              const selectedTemplateId = scheduledTemplateIdFor(weekday.value);
              return (
                <div key={weekday.value} className="program-schedule-row">
                  <span className="program-schedule-day">{weekday.long}</span>
                  {templates.length === 0 ? (
                    <span className="program-schedule-empty">Create a routine first</span>
                  ) : (
                    <select
                      aria-label={`${weekday.long} routine`}
                      value={selectedTemplateId}
                      onChange={(event) => setScheduledTemplate(weekday.value, event.target.value)}
                    >
                      <option value="">Rest day</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
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

          <hr className="divider" />
          <div className="form-group">
            <label>Deload Rule</label>
            <select
              aria-label="Deload rule"
              value={programForm.deload?.type || 'none'}
              onChange={(e) => updateProgramDeload({ type: e.target.value })}
            >
              {DELOAD_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {programForm.deload?.type === 'every_n_weeks' && (
            <div className="progression-grid">
              <div className="form-group">
                <label>Every Weeks</label>
                <input
                  type="number"
                  aria-label="Deload every weeks"
                  min="2"
                  max="12"
                  value={programForm.deload?.everyWeeks ?? 4}
                  onChange={(e) => updateProgramDeload({ everyWeeks: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Load Percent</label>
                <input
                  type="number"
                  aria-label="Deload load percent"
                  min="40"
                  max="100"
                  value={programForm.deload?.loadPercent ?? 85}
                  onChange={(e) => updateProgramDeload({ loadPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Rep Percent</label>
                <input
                  type="number"
                  aria-label="Deload rep percent"
                  min="40"
                  max="100"
                  value={programForm.deload?.repPercent ?? 100}
                  onChange={(e) => updateProgramDeload({ repPercent: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  aria-label="Deload start date"
                  value={programForm.deload?.startDate || localDateKey(startOfToday())}
                  onChange={(e) => updateProgramDeload({ startDate: e.target.value })}
                />
              </div>
            </div>
          )}

          {deloadSummary(programForm.deload) && (
            <p className="program-rule-preview">
              {deloadSummary(programForm.deload)}
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
          <div className="form-group">
            <label>Default Rest</label>
            <select
              value={settingsForm.defaultRestTargetSeconds || 0}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultRestTargetSeconds: parseInt(e.target.value, 10) || 0 })}
            >
              <option value={0}>No target</option>
              <option value={30}>0:30</option>
              <option value={60}>1:00</option>
              <option value={90}>1:30</option>
              <option value={120}>2:00</option>
              <option value={180}>3:00</option>
              <option value={300}>5:00</option>
            </select>
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

      {exerciseForm && (
        <Modal
          title={`Edit Exercise — ${exerciseForm.name || 'Exercise'}`}
          onClose={() => !saving && setExerciseForm(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setExerciseForm(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveExerciseEdit} disabled={!exerciseForm.name?.trim() || saving}>
                {saving ? 'Saving…' : 'Save Exercise'}
              </button>
            </>
          }
        >
          <ExerciseFormFields form={exerciseForm} setForm={setExerciseForm} autoFocus />
        </Modal>
      )}
    </div>
  );
}
