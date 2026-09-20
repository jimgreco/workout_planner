import { describe, it, expect } from 'vitest';
import { programSlotForDate, shiftedDay, editUpcomingProgram, canEditUpcoming, localDateKey, nextProgramWorkout } from '../programs.js';
const today = localDateKey(new Date());
const date = n => shiftedDay(today, n);
const templates = [{id:'a',name:'Push'}, {id:'b',name:'Pull'}, {id:'c',name:'Legs'}];
const map = new Map(templates.map(t => [t.id,t]));
const base = () => ({ id:'p', name:'Program', startDate:today, schedule:[{id:'a',templateId:'a'},{id:'b',templateId:'b'}] });
const sequence = (program, n=6) => Array.from({length:n},(_,i)=>programSlotForDate(program,date(i),map).templateId);
describe('upcoming occurrence editing', () => {
  it('inserts workouts and rest, deletes occurrences and swaps without editing the cycle', () => {
    let p = editUpcomingProgram(base(),date(1),'insert','c');
    expect(sequence(p)).toEqual(['a','c','b','a','b','a']);
    p = editUpcomingProgram(p,date(1),'insert');
    expect(sequence(p)).toEqual(['a','','c','b','a','b']);
    p = editUpcomingProgram(p,date(2),'swap');
    expect(sequence(p)).toEqual(['a','','b','c','a','b']);
    p = editUpcomingProgram(p,date(1),'delete');
    expect(sequence(p)).toEqual(['a','b','c','a','b','a']);
    expect(p.schedule).toEqual(base().schedule);
    expect(sequence(p,31)[30]).toBe('b');
    expect(sequence(JSON.parse(JSON.stringify(p)))).toEqual(sequence(p));
  });
  it('deletes legacy inserted rest and includes an inserted workout as next', () => {
    const p = editUpcomingProgram({...base(),insertedRestDays:[today]},today,'delete');
    expect(sequence(p)).toEqual(sequence(base()));
    const inserted = editUpcomingProgram(base(),today,'insert','c');
    expect(nextProgramWorkout(inserted, templates, []).template.id).toBe('c');
  });
  it('protects history and logged days, respects boundaries, and uses calendar days', () => {
    expect(canEditUpcoming(base(),date(-1),'delete')).toBe(false);
    const logs=[{date:date(3),status:'finished'}];
    expect(canEditUpcoming(base(),today,'insert',logs)).toBe(false);
    expect(canEditUpcoming(base(),today,'swap',logs)).toBe(true);
    expect(canEditUpcoming(base(),date(2),'swap',logs)).toBe(false);
    expect(canEditUpcoming({...base(),endDate:today},today,'swap')).toBe(false);
    expect(shiftedDay('2026-11-01',1)).toBe('2026-11-02');
    expect(shiftedDay('2026-03-08',-1)).toBe('2026-03-07');
  });
});
