import {repairState} from './sync-repair.mjs';
import {readState,writeState,lease,trim,addEvent} from './service.mjs';
import {zonedParts,effectPayload,uuid} from './domain.mjs';
import {rollingPlan,windowFor,signature,effectSignature,calendarSignature,calendarPayload} from './rolling-plan.mjs';
const fingerprint=d=>JSON.stringify({effects:[...d.effects].sort((a,b)=>a.id-b.id).map(e=>[e.id,signature(e)]),calendar:[...d.calendar].sort((a,b)=>a.id-b.id).map(c=>[c.id,calendarSignature(c)]),daily:d.daily,combinedEffect:d.combinedEffect,ports:d.ports});
async function document(env,id){const r=await env.DB.prepare('SELECT data,revision FROM documents WHERE id=?').bind(id).first();return r?JSON.parse(r.data):null;}
async function persist(env,id,data){await env.DB.prepare('INSERT INTO documents (id,data,revision) VALUES (?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=documents.revision+1').bind(id,JSON.stringify(data)).run();}
async function refreshShadow(env,tz){const p=zonedParts(new Date(),tz);await trim(env,'notify-update-shadow',undefined,'POST',{currentDate:{year:+p.year-2000,month:+p.month,day:+p.day,weekday:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()+1,hours:+p.hour,minutes:+p.minute,seconds:+p.second}});await new Promise(resolve=>setTimeout(resolve,3000));}
export async function controllerRead(env,tz){const p=zonedParts(new Date(),tz),currentDate={year:+p.year-2000,month:+p.month,day:+p.day,hours:+p.hour,minutes:+p.minute,seconds:+p.second,weekday:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()+1};const r=await trim(env,'get',undefined,'POST',{currentDate});const d=r.payload;if(!d||!Array.isArray(d.effects)||!Array.isArray(d.calendar)||d.connectivity!==1)throw new Error('Controller is offline or did not return a usable snapshot. This read could not be verified.');return d;}
function stepLabel(op){if(!op)return 'Finishing';return ({deleteCalendar:'Removing old calendar entry',deleteEffect:'Archiving unused controller slot',saveEffect:'Saving design: '+(op.pattern?.name||''),saveCalendar:'Saving calendar: '+(op.row?.start||'')+' through '+(op.row?.end||''),verify:'Verifying patterns, calendar, and Timer Mode'})[op.kind]||'Processing controller request'}
function publicJob(j){if(!j)return null;return {id:j.id,status:j.status,stage:stepLabel(j.ops[j.cursor]),window:j.plan.window,calendarSlots:j.plan.calendarSlots,patternSlots:j.plan.patternSlots,cursor:j.cursor,total:j.ops.length,error:j.error||null,completedAt:j.completedAt||null};}
export async function rollingStatus(env){const r=await readState(env),job=await document(env,'rolling-job');let plan,error;try{plan=rollingPlan(r.state)}catch(e){error=e.message}return {...r,job:publicJob(job),plan:plan&&{window:plan.window,calendarSlots:plan.calendarSlots,patternSlots:plan.patternSlots,roundMinutes:5},error};}
export async function rollingAction(env,body){return lease(env,async()=>{
 const r=await readState(env),s=r.state;let revision=r.revision;let job=await document(env,'rolling-job');
 if(body.action==='repair'){
  if(job?.status==='running')throw new Error('Finish the running job before repairing designs.');
  if(body.revision!==revision)throw new Error('The library changed. Refresh before repairing.');
  const next=repairState(s,body.patternId,body.mode,body.transferProtection===true);
  addEvent(next,'Created compatible copy and reassigned its calendar rules');
  return {state:next,revision:await writeState(env,next,revision)};
 }
 if(body.action==='acceptReset'){
  if(!job||job.status!=='failed')throw new Error('No failed sync requires a new baseline.');
  if(body.confirmReset!==true||body.jobId!==job.id||body.revision!==revision)throw new Error('Refresh and confirm that this controller was reset and works in Trimlight.');
  await refreshShadow(env,s.settings.timezone);
  const current=await controllerRead(env,s.settings.timezone);
  // Ensure the snapshot is usable before clearing the failed-job interlock.
  fingerprint(current);
  await persist(env,'rolling-archive-'+job.id,job);
  await persist(env,'rolling-baseline-'+job.id,{at:new Date().toISOString(),device:current});
  job={...job,status:'resetAccepted',error:null,resetAcceptedAt:new Date().toISOString(),restored:false};
  s.device=current;s.snapshotAt=job.resetAcceptedAt;s.snapshotSource='Accepted post-reset controller';
  s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;
  s.runtime={...s.runtime,preview:false,lastApplied:null,holdUntil:0};
  s.rolling={...publicJob(job),roundMinutes:5};
  addEvent(s,'Accepted reset controller baseline; previous job archived; scheduling paused');
  const nextRevision=await writeState(env,s,revision);
  await persist(env,'rolling-job',job);
  return {state:s,revision:nextRevision,job:publicJob(job)};
 }
 if(body.action==='recover'){
  if(!job||job.status!=='failed')throw new Error('No failed job requires recovery verification.');await refreshShadow(env,s.settings.timezone);const restored=await controllerRead(env,s.settings.timezone);if(fingerprint(restored)!==fingerprint(job.before))throw new Error(`Recovery is not verified. Backup: ${job.before.effects.length} designs and ${job.before.calendar.length} calendar entries; current readback: ${restored.effects.length} designs and ${restored.calendar.length} calendar entries. Counts alone do not establish a match. Download the pre-sync backup and contact support before another restore.`);job.status='restored';job.restored=true;job.error='Original controller configuration restored and verified.';await persist(env,'rolling-job',job);s.device=restored;s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,job.error);return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};
 }
 if(body.action==='pause'){if(job?.status==='running')throw new Error('Finish the current sync before pausing.');s.settings.rollingEnabled=false;return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};}
 if(body.action==='plan'){await refreshShadow(env,s.settings.timezone);const d=await controllerRead(env,s.settings.timezone);const p=rollingPlan(s,new Date(),d);return {window:p.window,calendarSlots:p.calendarSlots,patternSlots:p.patternSlots,removePatterns:p.removeEffects.map(e=>e.name),addPatterns:p.missing.map(p=>p.name),calendarBefore:d.calendar.length,roundMinutes:5};}
 if(body.action==='enable'){s.settings.rollingEnabled=true;s.settings.schedulerEnabled=false;body={action:'start',force:true};}
 if(body.action==='start'){
  if(!s.settings.rollingEnabled)return {paused:true,job:publicJob(job)};
  if(job?.status==='running')return {job:publicJob(job)};
  if(!body.force&&job?.status==='complete'&&job.plan.window.month===windowFor(new Date(),s.settings.timezone).month)return {job:publicJob(job),alreadyCurrent:true};
  if(job?.status==='failed')throw new Error('The last sync failed and was rolled back or needs recovery. Review its error before starting again.');
  await refreshShadow(env,s.settings.timezone);const before=await controllerRead(env,s.settings.timezone),p=rollingPlan(s,new Date(),before);
  if((before.daily||[]).some(x=>x.enable))throw new Error('An enabled daily timer could overlap the rolling calendar. Disable it in Trimlight before syncing.');
  for(const e of before.effects)if(!s.patterns.some(p=>signature({...p.effect,name:p.name})===signature(e)))s.patterns.push({id:'archive-'+uuid(),name:e.name,effect:e,protected:false,source:'Controller archive',updatedAt:new Date().toISOString(),tags:[]});
  // Archive first, then create a vendor restore point before any effect/calendar mutation.
  const id=uuid();await persist(env,'rolling-backup-'+id,{at:new Date().toISOString(),device:before});
  const t=zonedParts(new Date(),s.settings.timezone);const zone=new Intl.DateTimeFormat('en-US',{timeZone:s.settings.timezone,timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value;
  await trim(env,'data/backup',{backupTime:`${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}:${t.second} ${zone}`});
  const backup=await trim(env,'data/backup/get');if(!backup.payload?.backupKey)throw new Error('Could not verify the controller restore point. Nothing was changed.');
  const ops=[...before.calendar.map(c=>({kind:'deleteCalendar',id:c.id})),...p.removeEffects.map(e=>({kind:'deleteEffect',id:e.id})),...p.missing.map(e=>({kind:'saveEffect',pattern:e})),...p.rows.map((row,index)=>({kind:'saveCalendar',row,id:index})),{kind:'verify'}];
  job={id,status:'running',cursor:0,ops,plan:p,before,backupKey:backup.payload.backupKey,createdAt:new Date().toISOString()};await persist(env,'rolling-job',job);
  s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,`Two-month controller sync started: ${p.window.month}`);await writeState(env,s,revision);return {job:publicJob(job)};
 }
 if(body.action!=='step')throw new Error('Unknown rolling-sync action.');
 if(!job||job.status!=='running')return {job:publicJob(job)};
 if(body.jobId!==job.id)throw new Error('Sync job changed. Read status before continuing.');
 try{
  if(job.ops[job.cursor].kind==='verify')await refreshShadow(env,s.settings.timezone);const device=await controllerRead(env,s.settings.timezone);
  for(const e of job.before.effects.filter(e=>s.patterns.some(p=>p.protected&&effectSignature(p.effect)===effectSignature(e)))){if(!device.effects.some(x=>x.id===e.id&&signature(x)===signature(e)))throw new Error('A protected controller pattern changed during sync.');}
  // One mutation per request. The readback makes retries safe after a lost HTTP response.
  const op=job.ops[job.cursor];
  if(op.kind==='deleteCalendar'){if(device.calendar.some(c=>c.id===op.id))await trim(env,'calendar/delete',{id:op.id});}
  if(op.kind==='deleteEffect'){
   const e=device.effects.find(e=>e.id===op.id);if(e){if(s.patterns.some(p=>p.protected&&effectSignature(p.effect)===effectSignature(e))||device.calendar.some(c=>c.effectId===e.id)||(device.daily||[]).some(c=>c.effectId===e.id)||device.combinedEffect?.effectIds?.includes(e.id)||(device.overlayEffects||[]).some(x=>x.targetEffect===e.id))throw new Error('Pattern still referenced; refusing removal.');await trim(env,'effect/delete',{id:op.id});}
  }
  if(op.kind==='saveEffect'){
   const target={...op.pattern.effect,name:op.pattern.name};const existing=device.effects.find(e=>effectSignature(e)===effectSignature(target));let id=existing?.id;
   if(id===undefined){if(device.effects.length>=60)throw new Error('Controller pattern capacity changed.');const r=await trim(env,'effect/save',{id:-1,name:op.pattern.name,...effectPayload(op.pattern.effect)});id=r.payload?.id;if(!Number.isInteger(id))throw new Error('Missing saved effect ID.');}job.plan.mapping[op.pattern.id]=id;
  }
  if(op.kind==='saveCalendar'){
   const payload=calendarPayload(op.row,job.plan.mapping[op.row.patternId],op.id);if(!Number.isInteger(payload.effectId))throw new Error('Missing controller effect mapping.');
   if(!device.calendar.some(c=>calendarSignature(c)===calendarSignature(payload))){payload.id=[...Array.from({length:59},(_,i)=>i+1),0].find(id=>!device.calendar.some(c=>c.id===id));if(payload.id===undefined)throw new Error('No free calendar slot.');await trim(env,'calendar/save',payload);}
  }
  if(op.kind==='verify'){
   const expected=job.plan.rows.map((row,i)=>calendarSignature(calendarPayload(row,job.plan.mapping[row.patternId],i))).sort();const actual=device.calendar.map(calendarSignature).sort();
   if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('Controller calendar readback did not match the complete plan.');
   for(const id of job.plan.wanted){const p=s.patterns.find(p=>p.id===id);if(!p||!device.effects.some(e=>e.id===job.plan.mapping[id]&&effectSignature(e)===effectSignature(p.effect)))throw new Error('Controller pattern readback did not match the library.');}
   await trim(env,'update',{switchState:2});const verified=await controllerRead(env,s.settings.timezone);if(verified.switchState!==2)throw new Error('Timer Mode was not confirmed.');
   job.status='complete';job.completedAt=new Date().toISOString();s.device=verified;s.snapshotAt=job.completedAt;s.snapshotSource='Verified rolling controller sync';s.runtime={...s.runtime,preview:false,lastApplied:null};addEvent(s,`Verified ${job.plan.calendarSlots} calendar entries and ${verified.effects.length} patterns for ${job.plan.window.month}`);
  }
  job.cursor++;await persist(env,'rolling-job',job);s.rolling={...publicJob(job),roundMinutes:5};await writeState(env,s,revision);return {job:publicJob(job)};
 }catch(error){
  job.status='failed';job.error=error.message;s.settings.rollingEnabled=false;
  job.failure={at:new Date().toISOString(),step:job.cursor,operation:job.ops[job.cursor]?.kind,previousOperation:job.ops[job.cursor-1]?.kind||null};
  if(error.code===12006){job.error+=' Sync paused. No automatic restore was attempted because controller data could not be parsed.';}else try{await trim(env,'data/backup/restore',{backupKey:job.backupKey});await refreshShadow(env,s.settings.timezone);const restored=await controllerRead(env,s.settings.timezone);if(fingerprint(restored)!==fingerprint(job.before))throw new Error('Restore readback differs from backup.');s.device=restored;job.error+=' Original controller configuration restored and verified.';job.restored=true;}catch(e){job.error+=' Recovery needs attention: '+e.message;}
  await persist(env,'rolling-job',job);s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,job.error,'error');await writeState(env,s,revision);return {job:publicJob(job)};
 }
});}
export async function rollingBackup(env){const job=await document(env,'rolling-job');if(!job)return null;return {at:job.createdAt,device:job.before,diagnostics:{jobId:job.id,status:job.status,error:job.error||null,failure:job.failure||{step:job.cursor,operation:job.ops[job.cursor]?.kind,previousOperation:job.ops[job.cursor-1]?.kind||null},restoreVerified:job.restored===true}};}
