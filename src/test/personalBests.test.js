import { describe, expect, it } from 'vitest';
import { buildProgress, hasPersonalBestContext, latestPersonalBest, logsWithPersonalBests, personalBestForItem, personalBestIdsForWorkout } from '../progress.js';

const exercise = { id: 'press', name: 'Press', muscleGroup: 'Chest', personalBest: { weight: '300', reps: '5', date: '2026-01-01' } };
const item = (weight = '100', reps = '8', extra = {}) => ({ exerciseId: 'press', baselineId: 'technique-a', setupProfile: { id: 'machine-a' }, weightType: 'weight', sets: [{ weight, reps }], ...extra });
const log = (id, entry = item(), extra = {}) => ({ id, date: `2026-09-${id.padStart(2, '0')}`, name: 'Train', status: 'finished', exerciseItems: [entry], ...extra });
const badgeIds = logs => Object.fromEntries(logsWithPersonalBests(logs).map(log => [log.id, log.pbExerciseIds]));

describe('personal bests within equipment and technique contexts', () => {
  it('awards the first set in a new context despite an older global PB', () => {
    expect(personalBestIdsForWorkout(log('18'), [], [exercise])).toEqual(['press']);
    expect(personalBestForItem(item(), [log('18')], exercise.personalBest)).toEqual({ weight: '100', reps: '8', date: '2026-09-18' });
    expect(latestPersonalBest(exercise, [log('18')])).toMatchObject({ contextual: true, best: { weight: '100' } });
    expect(personalBestForItem(item(), [], exercise.personalBest)).toBeUndefined();
  });
  it('recognizes heavier weight or more reps at equal weight, without rewarding ties or lighter high-rep sets', () => {
    const history = [log('18'), log('19', item('100', '8')), log('20', item('100', '9')), log('21', item('95', '20')), log('22', item('105', '5'))];
    expect(badgeIds(history.reverse())).toEqual({ 18: ['press'], 19: [], 20: ['press'], 21: [], 22: ['press'] });
  });
  it.each([
    { baselineId: 'technique-b' },
    { setupProfile: { id: 'machine-b' } },
    { weightType: 'double' },
  ])('keeps changed context %j independent', extra => {
    expect(personalBestIdsForWorkout(log('19', item('20', '8', extra)), [log('18')], [exercise])).toEqual(['press']);
  });
  it('separates Smith resistance snapshots and never awards an unknown total', () => {
    const smith = resistance => item('45', '10', { weightType: 'smith_double', setupProfile: { id: 'smith', smithBarWeight: resistance } });
    expect(badgeIds([log('18', smith(35)), log('19', smith(20)), log('20', smith(null))])).toEqual({ 18: ['press'], 19: ['press'], 20: [] });
    expect(personalBestForItem(smith(0), [log('18', smith(0))])).toMatchObject({ weight: '90' });
  });
  it.each([
    { sets: [{ weight: '100', placeholderReps: '8' }] },
    { sets: [{ weight: '100', reps: '8', setType: 'warmup' }] },
    { sets: [{ weight: '100', reps: '8', completion: 'skipped' }] },
    { sets: [{ weight: '100', reps: '8', completion: 'unrecorded' }] },
    { weightType: 'none' },
  ])('excludes ineligible evidence %j', extra => {
    expect(personalBestIdsForWorkout(log('18', item('100', '8', extra)), [], [exercise])).toEqual([]);
    expect(badgeIds([log('18', item('100', '8', extra))])[18]).toEqual([]);
  });
  it('retains a historical badge on a notes edit, even after a later larger PB', () => {
    const history = [log('18', item('90')), log('19'), log('20', item('120'))];
    expect(personalBestIdsForWorkout({ ...history[1], notes: 'Edited' }, history, [exercise])).toEqual(['press']);
    expect(badgeIds(history)[19]).toEqual(['press']);
  });
  it('recomputes corrected and deleted records from history without stale PB flags', () => {
    const history = [log('18', item('100')), log('19', item('120'), { hasPB: true, pbExerciseIds: ['press'] }), log('20', item('110'))];
    expect(badgeIds(history)[20]).toEqual([]);
    history[1] = log('19', item('90'), { hasPB: true, pbExerciseIds: ['press'] });
    expect(badgeIds(history)).toEqual({ 18: ['press'], 19: [], 20: ['press'] });
    expect(badgeIds(history.slice(1))).toEqual({ 19: ['press'], 20: ['press'] });
  });
  it('orders same-day records by actual start, deduplicates badges, and leaves source records untouched', () => {
    const first = log('a', item(), { date: '2026-09-18', startTime: '2026-09-18T10:00:00Z' });
    const second = log('b', item(), { date: '2026-09-18', startTime: '2026-09-18T11:00:00Z' });
    const source = JSON.stringify([second, first]);
    expect(badgeIds([second, first])).toEqual({ a: ['press'], b: [] });
    expect(JSON.stringify([second, first])).toBe(source);
  });
  it('does not lose prior context when a progress date range hides older workouts', () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = buildProgress([log('old', item('120'), { date: '2000-01-01' }), log('new', item('100'), { date: today })], [exercise], '7');
    expect(stats.totalWorkouts).toBe(1);
    expect(stats.pbCount).toBe(0);
  });
  it('keeps general PB handling and legacy badges, including edits made after a later PB', () => {
    const general = weight => item(weight, '8', { baselineId: undefined, setupProfile: undefined });
    expect(hasPersonalBestContext(general('100'))).toBe(false);
    expect(personalBestIdsForWorkout(log('19', general('100')), [], [exercise])).toEqual([]);
    const history = [log('18', general('90')), log('19', general('100'), { pbExerciseIds: ['press'] }), log('20', general('120'))];
    const currentExercise = { ...exercise, personalBest: { weight: '120', reps: '8', date: '2026-09-20' } };
    expect(personalBestIdsForWorkout(history[1], history, [currentExercise])).toEqual(['press']);
    expect(personalBestIdsForWorkout(log('19', general('80')), history, [currentExercise])).toEqual([]);
    expect(badgeIds(history)[19]).toEqual(['press']);
    expect(personalBestIdsForWorkout(log('21', general('80')), history, [{ ...exercise, personalBest: undefined }])).toEqual(['press']);
  });
  it('retains numeric precision and avoids thousands separators in stored PBs', () => {
    const history = [log('18', item('1000.25')), log('19', item('999'))];
    expect(personalBestForItem(item(), history)).toMatchObject({ weight: '1000.25' });
    expect(badgeIds(history)[19]).toEqual([]);
  });
  it('counts side-specific reps for the tiebreaker and leaves unfinished drafts out', () => {
    const sides = item('100', '', { sets: [{ weight: '100', repsLeft: '9', repsRight: '9' }] });
    expect(personalBestIdsForWorkout(log('19', sides), [log('18')], [exercise])).toEqual(['press']);
    expect(personalBestForItem(item(), [log('18', item('999'), { status: 'active' })])).toBeUndefined();
  });
});
