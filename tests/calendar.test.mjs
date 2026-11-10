import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDays,moveMonth} from '../shared/calendar.mjs';
test('calendar aligns weeks Sunday through Saturday and includes leap day',()=>{
 const days=calendarDays('2028-02');
 assert.equal(new Date(days[0]+'T12:00Z').getUTCDay(),0);
 assert.equal(new Date(days.at(-1)+'T12:00Z').getUTCDay(),6);
 assert.equal(days.length%7,0);assert.ok(days.includes('2028-02-29'));
 assert.equal(new Set(days).size,days.length);
 assert.equal(days.filter(d=>d.startsWith('2028-02')).length,29);
});
test('month navigation crosses years and six-week months stay complete',()=>{
 assert.equal(moveMonth('2026-12',1),'2027-01');
 assert.equal(moveMonth('2027-01',-1),'2026-12');
 assert.equal(calendarDays('2026-08').length,42);
 assert.throws(()=>calendarDays('2026-13'));
});
