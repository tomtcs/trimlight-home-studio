import test from 'node:test';import assert from 'node:assert/strict';
import {compatibleEffect,repairState} from '../shared/sync-repair.mjs';
const effect={category:1,mode:19,brightness:100,speed:80,pixels:[{index:0,count:90,color:255,disable:false},{index:1,count:5,color:0xff0000,disable:true}]};
test('compatible copy preserves runs, colors and original; requires explicit supported mode',()=>{
 assert.throws(()=>compatibleEffect(effect,19),/supported animation/);
 const e=compatibleEffect(effect,1);assert.deepEqual(e.pixels.filter(p=>p.count).map(p=>p.count),[60,30,5]);assert.equal(e.pixels[2].disable,true);assert.equal(e.mode,1);
 const state={patterns:[{id:'old',name:'Christmas',protected:true,effect}],rules:[{id:'rule',patternId:'old'}]};
 assert.throws(()=>repairState(state,'old',1,false),/protection/);
 const next=repairState(state,'old',1,true);assert.deepEqual(next.patterns[0].effect,effect);assert.equal(state.patterns[0].protected,true);assert.equal(next.patterns[0].protected,false);assert.equal(next.patterns[1].protected,true);assert.equal(next.rules[0].patternId,next.patterns[1].id);assert.equal(state.rules[0].patternId,'old');
});
test('over-capacity conversion blocks without silently dropping colors',()=>{assert.throws(()=>compatibleEffect({...effect,pixels:Array.from({length:30},(_,index)=>({index,count:90,color:index,disable:false}))},0),/60 color slots/)});

import {rollingPlan} from '../shared/rolling-plan.mjs';
import {householdState} from '../shared/domain.mjs';
test('preflight reports structured repair and reuses matching legacy originals',()=>{
 const s=householdState();s.patterns=[{id:'legacy',name:'Christmas 2',effect,protected:false}];s.rules=[{id:'all',name:'Holiday',patternId:'legacy',startDate:'01-01',endDate:'12-31',year:null,enabled:true,priority:1,kind:'fixed',fixedStart:'17:00',end:'23:00',offset:0}];
 s.settings.timezone='America/New_York';s.settings.lat=40.6;s.settings.lon=-75.4;
 const now=new Date('2026-11-10T12:00Z');
 assert.throws(()=>rollingPlan(s,now),e=>e.issue.code==='legacy_effect'&&e.issue.patternId==='legacy'&&e.issue.dates.length===61);
 const live={...s.device,effects:[{...effect,id:7,name:'Original'}]};const plan=rollingPlan(s,now,live);assert.equal(plan.mapping.legacy,7);assert.equal(plan.missing.length,0);
 const fixed=repairState(s,'legacy',1,false);assert.equal(rollingPlan(fixed,now).missing.length,1);
});
