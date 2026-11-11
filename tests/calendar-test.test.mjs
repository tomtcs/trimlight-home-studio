import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarTestPlan} from '../shared/calendar-test.mjs';
const device={effects:[{id:11}],calendar:[],daily:[]},body={date:'2026-11-15',start:'17:00',end:'23:00',effectId:11},now=new Date('2026-11-11T17:00:00Z');
const plan=(d=device,b=body)=>calendarTestPlan(d,b,'America/New_York',now);
test('calendar test validates dates, times, and saved design IDs',()=>{
 for(const change of [{date:'2026-02-30'},{date:'2026-11-11'},{date:'2027-01-01'},{start:'23:00',end:'01:00'},{start:'17:02'},{end:'25:00'},{effectId:12},{effectId:'11'}])assert.throws(()=>plan(device,{...body,...change}));
 assert.equal(plan().mapping['calendar-test'],11);
});
test('calendar test refuses occupied dates including year-wrapping ranges and full capacity',()=>{
 for(const dates of [[11,1,11,30],[10,1,2,1]]){const [m,d,m2,d2]=dates;assert.throws(()=>plan({...device,calendar:[{startDate:{month:m,day:d},endDate:{month:m2,day:d2}}]}),/covers that date/);}
 assert.throws(()=>plan({...device,calendar:Array(60).fill({})}),/No free/);
 assert.throws(()=>plan({...device,daily:[{enable:true}]}),/daily timers/);
});
