import { describe,it,expect,vi } from 'vitest';
import {activeProgramForDate,programSlotForDate,routinePrescription,programAdherence} from '../programs.js';
const template={id:'routine',name:'Upper',exerciseItems:[{exerciseId:'press',sets:[{reps:'6–10'},{reps:'6–10'},{reps:'6–10'}]}]};
const program={id:'beach',name:'Beach',startDate:'2026-09-21',endDate:'2027-06-11',scheduledActivation:true,schedule:[{id:'day',templateId:'routine'}],phases:[{id:'intro',name:'Calibration',startDate:'2026-09-21',endDate:'2026-10-04',setsPerExercise:2,targetRir:3}]};
describe('training evidence',()=>{
 it('activates on the date and never resurrects the old program after the end',()=>{
  const old={id:'summer',active:true,startDate:'2026-06-01'};
  expect(activeProgramForDate([old,program],'2026-09-20').id).toBe('summer');
  expect(activeProgramForDate([old,program],'2026-09-21').id).toBe('beach');
  expect(activeProgramForDate([old,program],'2027-06-11').id).toBe('beach');
  expect(activeProgramForDate([old,program],'2027-06-12')).toBeNull();
  expect(programSlotForDate(program,'2027-06-12',new Map([['routine',template]])).template).toBeNull();
 });
 it('copies phase targets without mutating the routine or later rewriting the snapshot',()=>{
  const t=structuredClone(template); const snapshot=routinePrescription(t,program,'2026-09-21');
  expect(snapshot.exerciseItems[0].sets).toHaveLength(2);expect(snapshot.targetRir).toBe(3);
  t.exerciseItems[0].sets[0].reps='99';expect(snapshot.exerciseItems[0].sets[0].reps).toBe('6–10');
  expect(routinePrescription(template,program,'2026-10-05').exerciseItems[0].sets).toHaveLength(3);
 });
 it('optional days never count as missed required sessions',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,8,23,12));
  try { const p={...program,schedule:[{id:'optional',templateId:'routine',optional:true}]}; expect(programAdherence(p,[template],[]).scheduled).toBe(0);expect(programAdherence(p,[template],[]).missed).toBe(0); } finally {vi.useRealTimers();}
 });
 it('credits renamed routines using their stable identity',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,8,21,12));
  try {const log={date:'2026-09-21',name:'Old name',status:'finished',prescription:{templateId:'routine',programId:'beach'}};expect(programAdherence(program,[template],[log]).completed).toBe(1);}finally {vi.useRealTimers();}
 });
});
