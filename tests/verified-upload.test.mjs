import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../standalone/database.mjs';
import {readState,writeState} from '../shared/service.mjs';
import {rollingAction,rollingStatus,rollingBackup} from '../shared/rolling.mjs';
import {effectPayload} from '../shared/domain.mjs';
async function fixture({stale=0,parseError=false,lostAck=false}={}){
 let now=Date.now();const calls=[],waits=[];const env={DB:openDatabase(':memory:'),LOCAL_RUNNER:true,CONTROLLER_PROTECTION:'off',TRIMLIGHT_CLIENT_ID:'test',TRIMLIGHT_CLIENT_SECRET:'test',TRIMLIGHT_DEVICE_ID:'test',UPLOAD_NOW:()=>now,ADVANCE:ms=>now+=ms,UPLOAD_WAIT:async ms=>{waits.push(ms);now+=ms;}};
 let {state,revision}=await readState(env);
 const effect=effectPayload({category:1,mode:0,brightness:100,speed:50,pixels:[{index:0,count:5,color:255,disable:false}]});
 state.patterns=[{id:'blue',name:'Blue',effect,protected:false}];state.rules=[{id:'all',name:'All year',patternId:'blue',startDate:'01-01',endDate:'12-31',year:null,enabled:true,priority:1,kind:'fixed',fixedStart:'17:00',end:'23:00',offset:0}];
 state.settings.timezone='America/New_York';
 let live={...state.device,connectivity:1},old=structuredClone(live),written=false;
 await writeState(env,state,revision);
 env.FETCH=async(url,init)=>{
  const path=url.split('/device/')[1],body=JSON.parse(init.body||'{}');calls.push({path,payload:body.payload});
  if(path==='get'){
   if(written&&parseError)return Response.json({code:12006,desc:'parse failure'});
   return Response.json({code:0,payload:written&&stale-->0?old:live});
  }
  if(path==='data/backup/get')return Response.json({code:0,payload:{backupKey:'test-backup'}});
  if(path==='effect/save'){old=structuredClone(live);live.effects.push({...body.payload,id:10});written=true;if(lostAck)throw new Error('Connection lost after write');return Response.json({code:0,payload:{id:10}})}
  if(path==='calendar/save'){old=structuredClone(live);written=true;live.calendar.push({...body.payload});return Response.json({code:0,payload:{id:body.payload.id}})}
  if(path==='effect/delete')live.effects=live.effects.filter(e=>e.id!==body.payload.id);
  if(path==='calendar/delete')live.calendar=live.calendar.filter(c=>c.id!==body.payload.id);
  if(path==='update')live.switchState=body.payload.switchState;
  return Response.json({code:0});
 };
 return {env,calls,waits,getLive:()=>live};
}
const step=(env,id)=>{env.ADVANCE(60000);return rollingAction(env,{action:'step',jobId:id});};
test('single-design test waits for refreshed matching readback; no calendar/delete writes; duplicate step does not resend',async()=>{
 const {env,calls,waits}=await fixture({stale:1});let r=await rollingAction(env,{action:'testDesign'});const id=r.job.id;
 r=await step(env,id);assert.equal(r.job.cursor,0);assert.equal(r.job.phase,'verify-write');
 r=await step(env,id);assert.equal(r.job.cursor,0);
 r=await step(env,id);assert.equal(r.job.status,'complete');assert.equal(r.job.cursor,1);
 await step(env,id);
 assert.equal(calls.filter(c=>c.path==='effect/save').length,1);assert.ok(!calls.some(c=>/calendar|delete|restore/.test(c.path)));assert.ok(waits.every(ms=>ms===3000));
 assert.equal((await readState(env)).state.settings.rollingEnabled,false);
 assert.equal((await rollingBackup(env)).diagnostics.verifiedWrites.length,1);
 const paths=calls.map(c=>c.path);for(let i=0;i<paths.length;i++)if(paths[i]==='get')assert.equal(paths[i-1],'notify-update-shadow');
});
test('stale readbacks stop after three minutes without rollback or another write',async()=>{
 const {env,calls}=await fixture({stale:99});let {job}=await rollingAction(env,{action:'testDesign'});
 for(let i=0;i<4;i++)({job}=await step(env,job.id));
 assert.equal(job.status,'failed');assert.match(job.error,/three-minute/);assert.equal(calls.filter(c=>c.path==='effect/save').length,1);assert.ok(!calls.some(c=>c.path.includes('restore')));
});
test('lost write acknowledgement is durable and never replayed',async()=>{
 const {env,calls}=await fixture({lostAck:true});let {job}=await rollingAction(env,{action:'testDesign'});({job}=await step(env,job.id));assert.equal(job.status,'failed');await step(env,job.id);
 assert.equal(calls.filter(c=>c.path==='effect/save').length,1);const backup=await rollingBackup(env);assert.equal(backup.diagnostics.failure.phase,'sending');assert.equal(backup.diagnostics.failure.request.payload.name,'Blue');
});
test('parse failure on refreshed verification stops without restore',async()=>{
 const {env,calls}=await fixture({parseError:true});let {job}=await rollingAction(env,{action:'testDesign'});({job}=await step(env,job.id));({job}=await step(env,job.id));assert.equal(job.status,'failed');assert.match(job.error,/12006/);assert.ok(!calls.some(c=>c.path.includes('restore')));
});
test('process interruption after intent is persisted cannot replay the write',async()=>{
 const {env,calls}=await fixture();let {job}=await rollingAction(env,{action:'testDesign'});
 const row=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('rolling-job').first();const j=JSON.parse(row.data);j.pending={phase:'sending',path:'effect/save',payload:{name:'Blue'}};
 await env.DB.prepare('UPDATE documents SET data=? WHERE id=?').bind(JSON.stringify(j),'rolling-job').run();
 ({job}=await step(env,job.id));assert.equal(job.status,'failed');assert.ok(!calls.some(c=>c.path==='effect/save'));
});
test('full calendar sync verifies each write and Timer Mode before completion',async()=>{
 const {env,calls}=await fixture();let {job}=await rollingAction(env,{action:'enable'});
 for(let i=0;i<30&&job.status==='running';i++)({job}=await step(env,job.id));
 assert.equal(job.status,'complete');assert.equal(job.cursor,job.total);assert.equal((await readState(env)).state.device.switchState,2);
 assert.ok(calls.some(c=>c.path==='calendar/save'));const writes=calls.filter(c=>['effect/save','calendar/save','update'].includes(c.path));assert.equal((await rollingBackup(env)).diagnostics.verifiedWrites.length,writes.length);
});
test('unrelated configuration mismatch blocks the next write',async()=>{
 const {env,calls,getLive}=await fixture();let {job}=await rollingAction(env,{action:'testDesign'});
 getLive().ports=[{id:1,start:1,end:42}];({job}=await step(env,job.id));
 assert.equal(job.status,'failed');assert.match(job.error,/changed outside/);assert.ok(!calls.some(c=>c.path==='effect/save'));
});
test('calendar and effect deletions are individually verified before new uploads',async()=>{
 const {env,calls,getLive}=await fixture();const live=getLive();
 live.effects=[{id:3,name:'Old',...effectPayload({category:1,mode:0,brightness:100,speed:50,pixels:[{index:0,count:5,color:123,disable:false}]})}];
 live.calendar=[{id:2,effectId:3,startDate:{month:1,day:1},endDate:{month:1,day:2},startTime:{hours:17,minutes:0},endTime:{hours:23,minutes:0}}];
 let {job}=await rollingAction(env,{action:'enable'});
 for(let i=0;i<40&&job.status==='running';i++)({job}=await step(env,job.id));
 assert.equal(job.status,'complete');const paths=(await rollingBackup(env)).diagnostics.verifiedWrites.map(w=>w.path);
 assert.deepEqual(paths.slice(0,3),['calendar/delete','effect/delete','effect/save']);
 const mutations=calls.filter(c=>/delete|save/.test(c.path));assert.equal(mutations.length,paths.filter(p=>p!=='update').length);
});
test('new design name changes do not mask altered colors or unrelated configuration',async()=>{
 const {env,getLive}=await fixture();let {job}=await rollingAction(env,{action:'testDesign'});({job}=await step(env,job.id));
 getLive().effects[0].name='Blue ?';getLive().effects[0].pixels[0].color=1234;
 for(let i=0;i<3;i++)({job}=await step(env,job.id));assert.equal(job.status,'failed');
 getLive().effects[0].pixels[0].color=255;
 const r=await rollingAction(env,{action:'recheckUpload',jobId:job.id});assert.equal(r.job.status,'complete');
 assert.equal((await rollingBackup(env)).diagnostics.verifiedWrites[0].controllerName,'Blue ?');
});
test('read-only recheck never issues a second design save',async()=>{
 const {env,calls}=await fixture({stale:3});let {job}=await rollingAction(env,{action:'testDesign'});
 for(let i=0;i<4;i++)({job}=await step(env,job.id));assert.equal(job.status,'failed');
 const count=calls.length;const result=await rollingAction(env,{action:'recheckUpload',jobId:job.id});
 assert.equal(result.job.status,'complete');assert.deepEqual(calls.slice(count).map(c=>c.path),['notify-update-shadow','get']);
});
test('retain unchanged design skips only its pending deletion, without controller writes',async()=>{
 const {env,calls,getLive}=await fixture();const live=getLive();
 live.effects=[{id:7,name:'HALLOWEEN',...effectPayload({category:1,mode:0,brightness:100,speed:50,pixels:[{index:0,count:5,color:123,disable:false}]})}];
 let {job}=await rollingAction(env,{action:'enable'});
 const row=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('rolling-job').first();const j=JSON.parse(row.data);
 j.status='failed';j.pending={phase:'verifying',path:'effect/delete',payload:{id:7}};
 await env.DB.prepare('UPDATE documents SET data=? WHERE id=?').bind(JSON.stringify(j),'rolling-job').run();
 const count=calls.length;
 const r=await rollingAction(env,{action:'keepDesign',jobId:job.id});
 assert.equal(r.job.status,'running');assert.equal(r.job.cursor,1);assert.equal(r.state.device.effects[0].name,'HALLOWEEN');assert.deepEqual(calls.slice(count).map(c=>c.path),['notify-update-shadow','get']);
});
test('retain rejects other controller changes',async()=>{
 const {env,getLive}=await fixture();let {job}=await rollingAction(env,{action:'enable'});
 const row=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('rolling-job').first();const j=JSON.parse(row.data);
 j.ops=[{kind:'deleteEffect',id:7}];j.status='failed';j.pending={phase:'verifying',path:'effect/delete',payload:{id:7}};
 await env.DB.prepare('UPDATE documents SET data=? WHERE id=?').bind(JSON.stringify(j),'rolling-job').run();
 getLive().ports=[{id:1,start:1,end:1}];
 await assert.rejects(rollingAction(env,{action:'keepDesign',jobId:job.id}),/differs/);
});

test('rapid polling waits between reads and tolerates more than three stale snapshots',async()=>{
 const {env,calls,waits}=await fixture({stale:6});let {job}=await rollingAction(env,{action:'testDesign'});
 ({job}=await rollingAction(env,{action:'step',jobId:job.id}));
 for(let i=0;i<6;i++){({job}=await rollingAction(env,{action:'step',jobId:job.id}));assert.equal(job.status,'running');assert.equal(job.cursor,0);}
 assert.match(job.stage,/Waiting for Trimlight cloud/);
 ({job}=await rollingAction(env,{action:'step',jobId:job.id}));assert.equal(job.status,'complete');
 assert.ok(waits.includes(15000));assert.equal(calls.filter(c=>c.path==='effect/save').length,1);
});

test('calendar test saves one entry referencing a saved effect without other mutations',async()=>{
 const {env,calls,getLive}=await fixture();const live=getLive();
 live.effects=[{id:11,name:'Golden Garland',...effectPayload({category:1,mode:6,brightness:115,speed:35,pixels:[{index:0,count:3,color:16759922,disable:false},{index:1,count:1,color:16751392,disable:false}]})}];
 live.calendar=[{id:0,effectId:11,startDate:{month:1,day:1},endDate:{month:1,day:1},startTime:{hours:17,minutes:0},endTime:{hours:23,minutes:0}}];
 const before=structuredClone(live);const date=`${new Date().getUTCFullYear()}-12-31`;
 let {job}=await rollingAction(env,{action:'testCalendar',date,start:'17:00',end:'23:00',effectId:11});
 assert.equal(job.total,1);assert.equal(job.testKind,'calendar');
 while(job.status==='running')({job}=await step(env,job.id));
 assert.equal(job.status,'complete');assert.deepEqual(live.effects,before.effects);assert.deepEqual(live.calendar[0],before.calendar[0]);assert.equal(live.calendar.length,2);assert.equal(live.calendar[1].id,1);assert.equal(live.calendar[1].effectId,11);
 assert.equal(calls.filter(c=>c.path==='calendar/save').length,1);assert.ok(!calls.some(c=>['effect/save','effect/delete','calendar/delete','update','data/restore'].includes(c.path)));
 const state=(await readState(env)).state;assert.equal(state.settings.rollingEnabled,false);assert.equal(state.settings.schedulerEnabled,false);
});

test('calendar test waits through stale readback without repeating the save',async()=>{
 const {env,calls,getLive}=await fixture({stale:6});getLive().effects=[{id:11,name:'Existing',...effectPayload({category:1,mode:0,brightness:100,speed:50,pixels:[{index:0,count:1,color:255,disable:false}]})}];
 let {job}=await rollingAction(env,{action:'testCalendar',date:`${new Date().getUTCFullYear()}-12-31`,start:'17:00',end:'23:00',effectId:11});
 for(let i=0;i<8;i++)({job}=await rollingAction(env,{action:'step',jobId:job.id}));
 assert.equal(job.status,'complete');assert.equal(calls.filter(c=>c.path==='calendar/save').length,1);
 assert.ok(!calls.some(c=>['effect/save','effect/delete','calendar/delete','update'].includes(c.path)));
});
