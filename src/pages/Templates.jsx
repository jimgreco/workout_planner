import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
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
import {
  createProgramScheduleItem,
  insertProgramRestDay,
  moveProgramScheduleDay,
  nextProgramWorkout as getNextProgramWorkout,
  normalizeProgram,
  programAdherence as summarizeProgramAdherence,
  programSlotForDate,
  removeProgramScheduleItem,
  replaceProgramScheduleItem,
  scheduleItemTitle,
  swapProgramScheduleDays,
  upcomingProgramSchedule as buildUpcomingProgramSchedule,
} from '../programs.js';
import { lastWeightTypesByExerciseId, routineExerciseNeedsWeightIncrease } from '../workoutHistory.js';

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
  startDate: localDateKey(startOfToday()),
  insertedRestDays: [],
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

function buildStarterTemplates(exercises, settings, lastWeightTypeByExerciseId = {}) {
  const byName = new Map(exercises.map((exercise) => [exercise.name.toLowerCase(), exercise]));
  return STARTER_TEMPLATES.map((starter) => {
    const exerciseItems = starter.exerciseNames
      .map((name) => byName.get(name.toLowerCase()))
      .filter(Boolean)
      .map((exercise) => ({
        exerciseId: exercise.id,
        weightType: lastWeightTypeByExerciseId[exercise.id] || 'weight',
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

function programStatusLabel(status) {
  if (status === 'done') return 'Done';
  if (status === 'skipped') return 'Skipped';
  if (status === 'missed') return 'Missed';
  if (status === 'planned') return 'Planned';
  return 'Rest';
}

function cycleDayLabel(index) {
  return `Day ${index + 1}`;
}

function upcomingDayStatusLabel(day) {
  if (day?.isBeforeStart) return 'Before start';
  if (day?.isInsertedRest) return 'Inserted rest';
  return programStatusLabel(day?.status);
}

function nextOccurrenceForScheduleItem(upcomingSchedule, itemId) {
  return upcomingSchedule.find((day) => day.scheduleItem?.id === itemId && !day.isInsertedRest) ?? null;
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

function timelineEntryForDate(program, dayKey) {
  return (program?.timeline ?? []).find((item) => item.date === dayKey) ?? null;
}

function scheduledTemplatesForDate(program, date, byId) {
  const dayKey = localDateKey(date);
  const timelineEntry = timelineEntryForDate(program, dayKey);
  if (timelineEntry) {
    if (!timelineEntry.templateId) return [];
    const template = byId.get(timelineEntry.templateId);
    return template ? [{ entry: timelineEntry, template }] : [];
  }
  return scheduledTemplatesForWeekday(program, date.getDay(), byId);
}

function nextProgramWorkout(program, templates, logs) {
  if (!program?.schedule?.length && !program?.timeline?.length) return null;
  const byId = templateById(templates);
  const today = startOfToday();
  for (let offset = 0; offset < 28; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dayKey = localDateKey(date);
    const scheduled = scheduledTemplatesForDate(program, date, byId);
    for (let index = 0; index < scheduled.length; index += 1) {
      const { entry, template } = scheduled[index];
      if (!isHandledOn(logs, template, dayKey)) {
        return { date, dayKey, entry, template, position: index + 1, total: scheduled.length };
      }
    }
  }
  return null;
}

function weekdayByValue(value) {
  return WEEKDAYS.find((weekday) => weekday.value === value) ?? WEEKDAYS[0];
}

function scheduleEntryFor(schedule, weekday) {
  return (schedule ?? []).find((item) => Number(item.weekday) === weekday && item.templateId) ?? null;
}

function setScheduledWorkout(schedule, weekday, templateId) {
  const next = (schedule ?? [])
    .filter((item) => Number(item.weekday) !== weekday && item.templateId)
    .map((item) => ({ ...item, weekday: Number(item.weekday) }));
  if (templateId) next.push({ weekday, templateId });
  return next.sort((a, b) => a.weekday - b.weekday);
}

function moveOrSwapScheduledWorkout(schedule, sourceWeekday, targetWeekday) {
  if (sourceWeekday === targetWeekday) return schedule ?? [];
  const byDay = new Map();
  for (const item of schedule ?? []) {
    const weekday = Number(item.weekday);
    if (item.templateId && !byDay.has(weekday)) byDay.set(weekday, { ...item, weekday });
  }

  const source = byDay.get(sourceWeekday);
  const target = byDay.get(targetWeekday);
  if (!source && !target) return [...byDay.values()].sort((a, b) => a.weekday - b.weekday);

  byDay.delete(sourceWeekday);
  byDay.delete(targetWeekday);
  if (source) byDay.set(targetWeekday, { ...source, weekday: targetWeekday });
  if (target) byDay.set(sourceWeekday, { ...target, weekday: sourceWeekday });
  return [...byDay.values()].sort((a, b) => a.weekday - b.weekday);
}

function weekPlan(program, templates, logs) {
  const byId = templateById(templates);
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  return WEEKDAYS.map((weekday, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const scheduled = scheduledTemplatesForDate(program, date, byId);
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
    const scheduled = scheduledTemplatesForDate(program, date, byId);
    const templatesForDay = scheduled.map((item) => item.template);
    const templateId = scheduled[0]?.entry?.templateId || '';
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
      templateId,
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

  if (!program?.schedule?.length && !program?.timeline?.length) return summary;

  for (let date = new Date(start); date <= today; date.setDate(date.getDate() + 1)) {
    const day = new Date(date);
    const dayKey = localDateKey(day);
    const scheduled = scheduledTemplatesForDate(program, day, byId).map((item) => item.template);
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

function cleanProgramTimeline(timeline) {
  const seenDates = new Set();
  return (timeline ?? [])
    .map((item) => {
      const date = String(item?.date ?? '');
      if (!parseLocalDate(date) || seenDates.has(date)) return null;
      seenDates.add(date);
      const templateId = String(item?.templateId ?? '').trim();
      const notes = String(item?.notes ?? '').trim();
      return {
        date,
        ...(templateId ? { templateId } : {}),
        ...(notes ? { notes } : {}),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-70);
}

function timelineContentFromDay(day) {
  return {
    templateId: day.templateId || '',
    templateName: day.templates?.[0]?.name || '',
  };
}

function timelineEntryFromContent(day, content) {
  return {
    date: day.dayKey,
    ...(content?.templateId ? { templateId: content.templateId } : {}),
  };
}

function mergeProgramTimeline(timeline, entries) {
  const affectedDates = new Set(entries.map((entry) => entry.date));
  return cleanProgramTimeline([
    ...(timeline ?? []).filter((entry) => !affectedDates.has(entry.date)),
    ...entries,
  ]);
}

function cleanProgram(program) {
  const cleaned = normalizeProgram({
    ...program,
    name: program.name.trim(),
    description: program.description?.trim() || '',
    progressionRule: program.progressionRule?.trim() || '',
    schedule: (program.schedule ?? []).map((item) => ({
      id: String(item?.id ?? ''),
      ...(item?.templateId ? { templateId: String(item.templateId).trim() } : {}),
      ...(item?.notes ? { notes: String(item.notes).trim() } : {}),
    })),
    startDate: parseLocalDate(program.startDate) ? program.startDate : localDateKey(startOfToday()),
    insertedRestDays: program.insertedRestDays ?? [],
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
  });
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
  const [selectedProgramDayId, setSelectedProgramDayId] = useState(null);
  const addMenuRef = useRef(null);
  const showPrograms = mode === 'all' || mode === 'programs';
  const showRoutines = mode === 'all' || mode === 'routines';
  const showExerciseLibrary = mode === 'all';
  const pageTitle = mode === 'routines' ? 'Routines' : 'Program';

  const activeProgram = useMemo(
    () => programs.find((program) => program.active) ?? null,
    [programs],
  );
  const lastWeightTypeByExerciseId = useMemo(() => lastWeightTypesByExerciseId(logs), [logs]);
  const templatesById = useMemo(() => templateById(templates), [templates]);
  const nextWorkout = useMemo(
    () => getNextProgramWorkout(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );
  const todayProgramSlot = useMemo(
    () => activeProgram ? programSlotForDate(activeProgram, new Date(), templatesById) : null,
    [activeProgram, templatesById],
  );
  const selectedProgramDay = useMemo(
    () => activeProgram?.schedule?.find((day) => day.id === selectedProgramDayId) ?? null,
    [activeProgram, selectedProgramDayId],
  );
  const selectedProgramDayIndex = useMemo(
    () => activeProgram?.schedule?.findIndex((day) => day.id === selectedProgramDayId) ?? -1,
    [activeProgram, selectedProgramDayId],
  );
  const upcomingSchedule = useMemo(
    () => buildUpcomingProgramSchedule(activeProgram, templates, logs),
    [activeProgram, templates, logs],
  );
  const selectedProgramOccurrence = useMemo(
    () => nextOccurrenceForScheduleItem(upcomingSchedule, selectedProgramDayId),
    [upcomingSchedule, selectedProgramDayId],
  );
  const adherence = useMemo(
    () => summarizeProgramAdherence(activeProgram, templates, logs),
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
    const normalized = normalizeProgram({ ...emptyProgram(), ...program });
    setProgramForm({
      ...normalized,
      progression: progressionForForm(program.progression, isExisting ? 'none' : 'double_progression'),
      deload: deloadForForm(program.deload, program.deload?.type || 'none'),
      schedule: [...normalized.schedule],
      insertedRestDays: [...normalized.insertedRestDays],
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

  useEffect(() => {
    if (!selectedProgramDayId) return;
    if (!activeProgram?.schedule?.some((day) => day.id === selectedProgramDayId)) {
      setSelectedProgramDayId(null);
    }
  }, [activeProgram, selectedProgramDayId]);

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
      for (const template of buildStarterTemplates(exercises, settings, lastWeightTypeByExerciseId)) {
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

  async function handleSkipProgramWorkout(template, date, dayKey) {
    if (!template || !activeProgram || saving) return;
    setSaving(true);
    try {
      const updated = await saveLog({
        name: template.name,
        date: dayKey,
        notes: 'Skipped from program',
        exerciseItems: [],
        status: 'skipped',
      });
      onLogsChanged(updated);
      const updatedPrograms = await saveProgram(cleanProgram(withProgramActivity(
        activeProgram,
        'skip',
        `Skipped ${template.name}`,
        dateLabel(date),
      )));
      onProgramsUpdate(updatedPrograms);
      setSelectedProgramDayId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipNextWorkout() {
    if (!nextWorkout) return;
    await handleSkipProgramWorkout(nextWorkout.template, nextWorkout.date, nextWorkout.dayKey);
  }

  async function handleSkipProgramDay(day) {
    const template = day?.template;
    if (!template) return;
    await handleSkipProgramWorkout(template, day.date, day.dayKey);
  }

  async function handleSetProgramDayRoutine(dayId, templateId) {
    if (!activeProgram || !dayId || saving) return;
    const dayIndex = activeProgram.schedule.findIndex((item) => item.id === dayId);
    if (dayIndex < 0) return;
    const currentTemplateId = activeProgram.schedule[dayIndex]?.templateId || '';
    if (currentTemplateId === templateId) {
      setSelectedProgramDayId(null);
      return;
    }
    const template = templates.find((item) => item.id === templateId);
    const label = cycleDayLabel(dayIndex);
    const title = templateId ? `Set ${label}` : `Set ${label} as rest`;
    const detail = templateId ? template?.name || 'Routine' : 'Rest';
    setSaving(true);
    try {
      const updatedProgram = {
        ...withProgramActivity(
          activeProgram,
          'schedule_edit',
          title,
          detail,
        ),
        schedule: replaceProgramScheduleItem(activeProgram.schedule, dayId, { templateId }),
      };
      const updated = await saveProgram(cleanProgram(updatedProgram));
      onProgramsUpdate(updated);
      setSelectedProgramDayId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSwapProgramDay(dayId, targetDayId) {
    if (!activeProgram || !dayId || !targetDayId || saving || dayId === targetDayId) return;
    const sourceIndex = activeProgram.schedule.findIndex((item) => item.id === dayId);
    const targetIndex = activeProgram.schedule.findIndex((item) => item.id === targetDayId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const sourceEntry = activeProgram.schedule[sourceIndex];
    const targetEntry = activeProgram.schedule[targetIndex];
    const sourceTemplate = templates.find((template) => template.id === sourceEntry?.templateId);
    const targetTemplate = templates.find((template) => template.id === targetEntry?.templateId);
    setSaving(true);
    try {
      const updatedProgram = {
        ...withProgramActivity(
          activeProgram,
          'swap',
          `Swapped ${cycleDayLabel(sourceIndex)} and ${cycleDayLabel(targetIndex)}`,
          `${sourceTemplate?.name || 'Rest'} <-> ${targetTemplate?.name || 'Rest'}`,
        ),
        schedule: swapProgramScheduleDays(activeProgram.schedule, dayId, targetDayId),
      };
      const updated = await saveProgram(cleanProgram(updatedProgram));
      onProgramsUpdate(updated);
      setSelectedProgramDayId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleInsertProgramRestDay(day) {
    if (!activeProgram || saving || !day?.dayKey || day.isInsertedRest) return;
    setSaving(true);
    try {
      const updatedProgram = withProgramActivity(
        insertProgramRestDay(activeProgram, day.dayKey),
        'rest_insert',
        'Inserted rest day',
        dateLabel(day.date),
      );
      const updated = await saveProgram(cleanProgram(updatedProgram));
      onProgramsUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  function handleAddProgramFormDay() {
    setProgramForm((draft) => ({
      ...draft,
      schedule: [...(draft.schedule ?? []), createProgramScheduleItem()],
    }));
  }

  function handleUpdateProgramFormDay(dayId, patch) {
    setProgramForm((draft) => ({
      ...draft,
      schedule: replaceProgramScheduleItem(draft.schedule, dayId, patch),
    }));
  }

  function handleMoveProgramFormDay(sourceIndex, targetIndex) {
    setProgramForm((draft) => ({
      ...draft,
      schedule: moveProgramScheduleDay(draft.schedule, sourceIndex, targetIndex),
    }));
  }

  function handleDeleteProgramFormDay(dayId) {
    setProgramForm((draft) => ({
      ...draft,
      schedule: removeProgramScheduleItem(draft.schedule, dayId),
    }));
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
    || (settingsForm.defaultRestTargetSeconds || 0) !== (settings.defaultRestTargetSeconds || 0)
    || Boolean(settingsForm.advancedMode) !== Boolean(settings.advancedMode);
  const selectedProgramTemplateId = selectedProgramDay?.templateId || '';

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
                  <small className="text-muted">
                    Starts {activeProgram.startDate}
                    {activeProgram.insertedRestDays?.length > 0 ? ` · ${activeProgram.insertedRestDays.length} inserted rest ${activeProgram.insertedRestDays.length === 1 ? 'day' : 'days'}` : ''}
                  </small>
                </div>
              </div>
              <div className="program-next-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleSkipNextWorkout} disabled={!nextWorkout || saving}>
                  <SkipForward size={14} /> Skip
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => nextWorkout && onStartWorkout(nextWorkout.template, activeProgram)} disabled={!nextWorkout || saving}>
                  <Play size={14} fill="currentColor" /> Start
                </button>
              </div>
            </div>

            <div className="program-week-heading">
              <strong>Repeating Cycle</strong>
              <span>{activeProgram.schedule.length} {activeProgram.schedule.length === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="program-week-grid">
              {activeProgram.schedule.map((day, index) => {
                const title = scheduleItemTitle(day, templatesById);
                const isCurrent = todayProgramSlot?.scheduleItem?.id === day.id && !todayProgramSlot?.isInsertedRest && !todayProgramSlot?.isBeforeStart;
                const isNext = nextWorkout?.scheduleItem?.id === day.id;
                return (
                <button
                  key={day.id}
                  type="button"
                  className={`program-day ${isCurrent ? 'planned' : day.templateId ? '' : 'rest'}`}
                  onClick={() => setSelectedProgramDayId(day.id)}
                  aria-label={`Manage ${cycleDayLabel(index)}: ${title}`}
                >
                  <div className="program-day-top">
                    <span>{cycleDayLabel(index)}</span>
                    <div className="program-day-icons">
                      {isCurrent && <CheckCircle2 size={14} aria-label="Current day" />}
                      {isNext && !isCurrent && <Play size={14} aria-label="Next workout" />}
                    </div>
                  </div>
                  <div className="program-day-routines">
                    {day.templateId ? (
                      <>
                        <strong>{title}</strong>
                        {day.notes && <em>{day.notes}</em>}
                      </>
                    ) : (
                      <strong>Rest</strong>
                    )}
                  </div>
                  {isCurrent && <small className="program-day-count">Today</small>}
                  {isNext && !isCurrent && <small className="program-day-count">Next up</small>}
                </button>
                );
              })}
            </div>

            {upcomingSchedule.length > 0 && (
              <div className="program-upcoming" aria-label="Upcoming program schedule">
                <div className="program-upcoming-heading">
                  <strong>Upcoming</strong>
                  <span>Next 3 weeks</span>
                </div>
                <div className="program-upcoming-list" role="list">
                  {upcomingSchedule.map((day) => (
                    <div
                      key={day.id}
                      className={`program-upcoming-day ${day.status}`}
                      role="listitem"
                      aria-label={`Upcoming day ${dateLabel(day.date)}: ${day.template?.name || 'Rest'}`}
                    >
                      <div className="program-upcoming-main">
                        <div>
                          <strong>{dateLabel(day.date)}</strong>
                          <span>
                            {day.isBeforeStart
                              ? `Program starts ${activeProgram.startDate}`
                              : day.isInsertedRest
                                ? 'Inserted rest day'
                                : day.scheduleItem
                                  ? `${cycleDayLabel(day.scheduleIndex ?? 0)} · ${day.template?.name || 'Rest'}`
                                  : 'Rest'}
                          </span>
                        </div>
                      </div>
                      <div className="program-upcoming-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleInsertProgramRestDay(day)}
                          disabled={saving || day.isInsertedRest}
                          aria-label={`Insert rest day on ${dateLabel(day.date)}`}
                        >
                          <Plus size={12} /> Rest
                        </button>
                        <em>{upcomingDayStatusLabel(day)}</em>
                      </div>
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
            <span>Build a repeating cycle, choose the start date, and insert rest days when life pushes training back.</span>
          </div>
        )}
      </div>
        {programs.length > 0 && (
          <div className="program-list">
            {programs.map((program) => (
              <div key={program.id} className={`program-list-item ${program.active ? 'active' : 'inactive'}`}>
                <div>
                  <strong>{program.name || 'Untitled program'}</strong>
                  <span>{program.schedule?.length || 0} cycle {program.schedule?.length === 1 ? 'day' : 'days'}</span>
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

      {activeProgram && selectedProgramDay && (
        <Modal
          title={`${cycleDayLabel(selectedProgramDayIndex)} Plan`}
          onClose={() => !saving && setSelectedProgramDayId(null)}
          footer={
            <button className="btn btn-secondary" onClick={() => setSelectedProgramDayId(null)} disabled={saving}>
              Close
            </button>
          }
        >
          <div className="program-day-planner">
            <div className={`program-day-current ${selectedProgramOccurrence?.status || 'rest'}`}>
              <div>
                <span>{selectedProgramOccurrence ? dateLabel(selectedProgramOccurrence.date) : 'No upcoming slot in the next 3 weeks'}</span>
                <strong>
                  {scheduleItemTitle(selectedProgramDay, templatesById)}
                </strong>
              </div>
              <em>{selectedProgramOccurrence ? upcomingDayStatusLabel(selectedProgramOccurrence) : 'Cycle day'}</em>
            </div>

            <div className="program-day-action-row">
              <button
                className="btn btn-primary"
                onClick={() => {
                  const template = selectedProgramOccurrence?.template;
                  if (template) {
                    setSelectedProgramDayId(null);
                    onStartWorkout(template, activeProgram);
                  }
                }}
                disabled={!selectedProgramOccurrence?.template || saving}
              >
                <Play size={15} fill="currentColor" /> Start
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleSkipProgramDay(selectedProgramOccurrence)}
                disabled={!selectedProgramOccurrence?.template || saving}
              >
                <SkipForward size={15} /> Skip
              </button>
            </div>

            <div className="program-day-planner-section">
              <label htmlFor="program-day-routine">Routine</label>
              <select
                id="program-day-routine"
                value={selectedProgramTemplateId}
                onChange={(event) => handleSetProgramDayRoutine(selectedProgramDay.id, event.target.value)}
                disabled={saving}
              >
                <option value="">Rest day</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>

            <div className="program-day-planner-section">
              <div className="program-day-planner-heading">
                <strong>Swap Day</strong>
                <ArrowRightLeft size={15} />
              </div>
              <div className="program-day-target-grid">
                {activeProgram.schedule
                  .map((day, index) => ({ day, index }))
                  .filter(({ day }) => day.id !== selectedProgramDay.id)
                  .map(({ day, index }) => {
                  const targetRoutine = scheduleItemTitle(day, templatesById);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      className="program-day-target"
                      aria-label={`Swap with ${cycleDayLabel(index)}: ${targetRoutine}`}
                      onClick={() => handleSwapProgramDay(selectedProgramDay.id, day.id)}
                      disabled={saving}
                    >
                      <span>{cycleDayLabel(index)}</span>
                      <strong>{targetRoutine}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
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
                const needsWeightIncrease = routineExerciseNeedsWeightIncrease(item, logs);
                return (
                  <span
                    key={item.exerciseId}
                    className={`badge routine-exercise-badge ${needsWeightIncrease ? 'needs-weight-increase' : ''}`}
                    title={needsWeightIncrease ? `${ex.name}: increase weight next time` : undefined}
                  >
                    {item.supersetGroup ? `SS ${item.supersetGroup} · ` : ''}{ex.name} • {item.sets.length} {item.sets.length === 1 ? 'set' : 'sets'}
                    {needsWeightIncrease && (
                      <span className="routine-progress-marker" aria-label={`${ex.name}: increase weight next time`}>
                        <Target size={12} aria-hidden="true" /> Add weight
                      </span>
                    )}
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
            advancedMode={settings.advancedMode}
            lastWeightTypeByExerciseId={lastWeightTypeByExerciseId}
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
              <button className="btn btn-primary" onClick={handleSaveProgram} disabled={!programForm.name.trim() || programForm.schedule.length === 0 || saving}>
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

          <div className="form-group">
            <label>Cycle Start Date</label>
            <input
              type="date"
              aria-label="Program cycle start date"
              value={programForm.startDate || localDateKey(startOfToday())}
              onChange={(e) => setProgramForm({ ...programForm, startDate: e.target.value })}
            />
          </div>

          <hr className="divider" />
          <div className="program-week-heading">
            <strong>Repeating Cycle</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddProgramFormDay}>
              <Plus size={14} /> Add Day
            </button>
          </div>
          <div className="program-schedule-editor">
            {programForm.schedule.map((day, index) => (
              <div key={day.id} className="program-schedule-row">
                <span className="program-schedule-day">{cycleDayLabel(index)}</span>
                {templates.length === 0 ? (
                  <span className="program-schedule-empty">Create a routine first</span>
                ) : (
                  <select
                    aria-label={`${cycleDayLabel(index)} routine`}
                    value={day.templateId || ''}
                    onChange={(event) => handleUpdateProgramFormDay(day.id, { templateId: event.target.value })}
                  >
                    <option value="">Rest day</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-8 items-center">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveProgramFormDay(index, index - 1)}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveProgramFormDay(index, index + 1)}
                    disabled={index === programForm.schedule.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDeleteProgramFormDay(day.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {programForm.schedule.length === 0 && (
              <div className="program-empty">
                <CalendarDays size={18} />
                <span>Add at least one cycle day.</span>
              </div>
            )}
          </div>
          {programForm.insertedRestDays?.length > 0 && (
            <p className="program-rule-preview">
              {programForm.insertedRestDays.length} inserted rest {programForm.insertedRestDays.length === 1 ? 'day' : 'days'} will continue to push the cycle back after save.
            </p>
          )}

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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(settingsForm.advancedMode)}
              onChange={(e) => setSettingsForm({ ...settingsForm, advancedMode: e.target.checked })}
            />
            Advanced mode
          </label>
          <p className="text-muted" style={{ marginTop: -2 }}>
            Shows set type, RPE, and RIR controls while logging workouts.
          </p>
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
