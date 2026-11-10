import test from 'node:test';
import assert from 'node:assert/strict';
import {previewColors,roofPoints} from '../shared/look-preview.mjs';
import {householdState,dayPlan,dateKey} from '../shared/domain.mjs';
test('preview is read-only, respects disabled pixels and brightness, and declines unknown effects',()=>{
 const e={category:1,mode:0,brightness:255,speed:100,pixels:[{index:1,count:1,color:255,disable:true},{index:0,count:1,color:16711680}]};
 const before=JSON.stringify(e);
 assert.deepEqual(previewColors(e,4),[16711680,0,16711680,0]);
 assert.deepEqual(previewColors({...e,brightness:0},4),[0,0,0,0]);
 assert.equal(previewColors({...e,category:0},4),null);
 assert.equal(previewColors({...e,mode:20},4),null);
 assert.equal(JSON.stringify(e),before);
 assert.notDeepEqual(previewColors({...e,mode:1},5,0),previewColors({...e,mode:1},5,.2));
});
test('roof points follow disconnected sections without inventing connecting lights',()=>{
 const p=roofPoints([{points:[[0,0],[10,0]]},{points:[[90,100],[100,100]]}],5);
 assert.deepEqual(p,[[0,0],[5,0],[10,0],[95,100],[100,100]]);
 assert.deepEqual(roofPoints([{points:[[1,1],[1,1]]}],5),[]);
});
test('nightly presentation uses household date, priority conflict and next-day end',()=>{
 const s=householdState();s.settings.timezone='America/New_York';
 s.patterns=[{id:'a',name:'Holiday'}];
 const r={id:'a',name:'Holiday rule',patternId:'a',startDate:'12-01',endDate:'12-31',enabled:true,priority:10,kind:'fixed',fixedStart:'17:00',end:'01:00'};
 s.rules=[r];
 const key=dateKey(new Date('2026-12-02T02:00Z'),s.settings.timezone);assert.equal(key,'2026-12-01');
 const plan=dayPlan(s,key);assert.equal(plan.pattern,'Holiday');assert.equal(plan.end,'2026-12-02T06:00:00.000Z');
 s.rules.push({...r,id:'b',name:'Birthday',priority:20});assert.equal(dayPlan(s,key).rule.name,'Birthday');
 s.rules.push({...r,id:'c',priority:20});assert.equal(dayPlan(s,key).conflict,true);
 s.rules=[];assert.equal(dayPlan(s,key).rule,null);
});
