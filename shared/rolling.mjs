import {calendarTestPlan} from './calendar-test.mjs';
import {repairState} from './sync-repair.mjs';
import {readState,writeState,lease,trim,addEvent} from './service.mjs';
import {zonedParts,effectPayload,uuid} from './domain.mjs';
import {rollingPlan,windowFor,signature,effectSignature,calendarSignature,calendarPayload} from './rolling-plan.mjs';
import {fingerprint,expectedAfter,matchesExpected,controllerName} from './upload-verification.mjs';
const VERIFY_WINDOW_MS=180000, VERIFY_INTERVAL_MS=15000;
const uploadNow=env=>env.UPLOAD_NOW?env.UPLOAD_NOW():Date.now();
async function document(env,id){const r=await env.DB.prepare('SELECT data,revision FROM documents WHERE id=?').bind(id).first();return r?JSON.parse(r.data):null;}
async function persist(env,id,data){await env.DB.prepare('INSERT INTO documents (id,data,revision) VALUES (?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=documents.revision+1').bind(id,JSON.stringify(data)).run();}
async function refreshShadow(env,tz){const p=zonedParts(new Date(),tz);await trim(env,'notify-update-shadow',undefined,'POST',{currentDate:{year:+p.year-2000,month:+p.month,day:+p.day,weekday:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()+1,hours:+p.hour,minutes:+p.minute,seconds:+p.second}});await (env.UPLOAD_WAIT||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(3000);}
export async function controllerRead(env,tz){const p=zonedParts(new Date(),tz),currentDate={year:+p.year-2000,month:+p.month,day:+p.day,hours:+p.hour,minutes:+p.minute,seconds:+p.second,weekday:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()+1};const r=await trim(env,'get',undefined,'POST',{currentDate});const d=r.payload;if(!d||!Array.isArray(d.effects)||!Array.isArray(d.calendar)||d.connectivity!==1)throw new Error('Controller is offline or did not return a usable snapshot. This read could not be verified.');return d;}
function stepLabel(op){if(!op)return 'Finishing';return ({deleteCalendar:'Removing old calendar entry',deleteEffect:'Archiving unused controller slot',saveEffect:'Saving design: '+(op.pattern?.name||''),saveCalendar:'Saving calendar: '+(op.row?.start||'')+' through '+(op.row?.end||''),verify:'Verifying patterns, calendar, and Timer Mode'})[op.kind]||'Processing controller request'}
function publicJob(j){if(!j)return null;return {id:j.id,status:j.status,stage:j.pending?'Waiting for Trimlight cloud data to update: '+stepLabel(j.ops[j.cursor])+' · '+(j.pending.attempts||0)+' checks · '+Math.floor((j.pending.elapsedMs||0)/1000)+'s / 180s':stepLabel(j.ops[j.cursor]),window:j.plan.window,calendarSlots:j.plan.calendarSlots,patternSlots:j.plan.patternSlots,cursor:j.cursor,total:j.ops.length,error:j.error||null,completedAt:j.completedAt||null,testMode:!!j.testMode,testKind:j.testKind||'design',canReviewRejected:!!(j.status==='failed'&&j.testKind==='calendar'&&j.failure?.code===12000&&j.pending?.path==='calendar/save'),phase:j.pending?'verify-write':'prepare-write'};}
export async function rollingStatus(env){const r=await readState(env),job=await document(env,'rolling-job');let plan,error;try{plan=rollingPlan(r.state)}catch(e){error=e.message}return {...r,job:publicJob(job),plan:plan&&{window:plan.window,calendarSlots:plan.calendarSlots,patternSlots:plan.patternSlots,roundMinutes:5},error};}
export async function rollingAction(env,body){return lease(env,async()=>{
 const r=await readState(env),s=r.state;let revision=r.revision;let job=await document(env,'rolling-job');let readOnlyRecheck=false;
 if(body.action==='repair'){
  if(job?.status==='running')throw new Error('Finish the running job before repairing designs.');
  if(body.revision!==revision)throw new Error('The library changed. Refresh before repairing.');
  const next=repairState(s,body.patternId,body.mode,body.transferProtection===true);
  addEvent(next,'Created compatible copy and reassigned its calendar rules');
  return {state:next,revision:await writeState(env,next,revision)};
 }
 if(body.action==='reviewRejectedCalendar'){
  if(!job||job.status!=='failed'||job.testKind!=='calendar'||job.failure?.code!==12000||job.pending?.path!=='calendar/save')throw new Error('No explicitly rejected calendar test is available for review.');
  if(body.jobId!==job.id||body.revision!==revision||body.confirmReview!==true)throw new Error('Refresh and confirm the rejected calendar review.');
  await refreshShadow(env,s.settings.timezone);const current=await controllerRead(env,s.settings.timezone);
  const baseline=job.verifiedDevice||job.before;
  const added=current.calendar.filter(c=>!baseline.calendar.some(b=>b.id===c.id));
  const withoutAdded={...current,calendar:current.calendar.filter(c=>baseline.calendar.some(b=>b.id===c.id))};
  if(fingerprint(withoutAdded)!==fingerprint(baseline)||added.length>1||added.some(c=>calendarSignature(c)!==calendarSignature(job.pending.payload)))throw new Error('Controller changes exceed the rejected test or its matching manually created entry. Job remains paused.');
  await persist(env,'rolling-archive-'+job.id,job);
  job.status='rejectionReviewed';job.error=null;job.reviewedAt=new Date().toISOString();job.reviewedDevice=current;
  s.device=current;s.snapshotAt=job.reviewedAt;s.snapshotSource='Read-only rejected calendar review';
  s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;s.rolling={...publicJob(job),roundMinutes:5};
  await persist(env,'rolling-job',job);addEvent(s,'Rejected calendar test archived after read-only verification. No controller write sent.');
  return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};
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
 if(body.action==='keepDesign'){
  const pending=job?.pending,op=job?.ops[job.cursor];
  if(!job||job.status!=='failed'||job.uploaderVersion!==2||pending?.phase!=='verifying'||pending.path!=='effect/delete'||op?.kind!=='deleteEffect'||pending.payload.id!==op.id||body.jobId!==job.id)throw new Error('No unverified design deletion can be retained.');
  await refreshShadow(env,s.settings.timezone);const current=await controllerRead(env,s.settings.timezone);
  if(fingerprint(current)!==fingerprint(job.verifiedDevice)||!current.effects.some(e=>e.id===op.id))throw new Error('Controller differs from the configuration before this deletion. Retention was not accepted.');
  // Conservative peak usage: do not rely on future deletions to make space.
  const remaining=job.ops.slice(job.cursor+1).filter(o=>o.kind==='saveEffect').length;
  if(current.effects.length+remaining>60)throw new Error('Keeping this design could exceed controller capacity. Sync remains paused.');
  const retained=current.effects.find(e=>e.id===op.id);
  job.history=[...(job.history||[]),{step:job.cursor,path:'retain-effect',payload:{id:op.id,name:retained.name},verifiedAt:new Date().toISOString()}];
  job.plan.patternSlots++;job.pending=null;job.error=null;job.cursor++;job.status='running';job.verifiedDevice=current;
  await persist(env,'rolling-job',job);s.device=current;s.rolling={...publicJob(job),roundMinutes:5};s.settings.rollingEnabled=false;
  addEvent(s,`Retained ${retained.name}; skipped its deletion. Ready to continue sync.`);
  return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};
 }
 if(body.action==='recheckUpload'){
  if(!job||job.status!=='failed'||job.uploaderVersion!==2||job.pending?.phase!=='verifying'||body.jobId!==job.id)throw new Error('No acknowledged upload is available for a read-only recheck.');
  job.status='running';job.error=null;readOnlyRecheck=true;
  body={action:'step',jobId:job.id};
 }
 if(body.action==='recover'){
  if(!job||job.status!=='failed')throw new Error('No failed job requires recovery verification.');await refreshShadow(env,s.settings.timezone);const restored=await controllerRead(env,s.settings.timezone);if(fingerprint(restored)!==fingerprint(job.before))throw new Error(`Recovery is not verified. Backup: ${job.before.effects.length} designs and ${job.before.calendar.length} calendar entries; current readback: ${restored.effects.length} designs and ${restored.calendar.length} calendar entries. Counts alone do not establish a match. Download the pre-sync backup and contact support before another restore.`);job.status='restored';job.restored=true;job.error='Original controller configuration restored and verified.';await persist(env,'rolling-job',job);s.device=restored;s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,job.error);return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};
 }
 if(body.action==='pause'){if(job?.status==='running')throw new Error('Finish the current sync before pausing.');s.settings.rollingEnabled=false;return {state:s,revision:await writeState(env,s,revision),job:publicJob(job)};}
 if(body.action==='plan'){await refreshShadow(env,s.settings.timezone);const d=await controllerRead(env,s.settings.timezone);const p=rollingPlan(s,new Date(),d);return {window:p.window,calendarSlots:p.calendarSlots,patternSlots:p.patternSlots,removePatterns:p.removeEffects.map(e=>e.name),addPatterns:p.missing.map(p=>p.name),calendarBefore:d.calendar.length,roundMinutes:5};}
 if(body.action==='testCalendar'){s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;body={...body,action:'start',testMode:true,testKind:'calendar',force:true};}
 if(body.action==='testDesign'){s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;body={...body,action:'start',testMode:true,force:true};}
 if(body.action==='enable'){s.settings.rollingEnabled=true;s.settings.schedulerEnabled=false;body={action:'start',force:true};}
 if(body.action==='start'){
  if(!s.settings.rollingEnabled&&!body.testMode)return {paused:true,job:publicJob(job)};
  if(job?.status==='running')return {job:publicJob(job)};
  if(!body.force&&job?.status==='complete'&&!job.testMode&&job.plan.window.month===windowFor(new Date(),s.settings.timezone).month)return {job:publicJob(job),alreadyCurrent:true};
  if(job?.status==='failed')throw new Error('The last sync failed and was rolled back or needs recovery. Review its error before starting again.');
  await refreshShadow(env,s.settings.timezone);const before=await controllerRead(env,s.settings.timezone),p=body.testKind==='calendar'?calendarTestPlan(before,body,s.settings.timezone):rollingPlan(s,new Date(),before);
  if((before.daily||[]).some(x=>x.enable))throw new Error('An enabled daily timer could overlap the rolling calendar. Disable it in Trimlight before syncing.');
  for(const e of before.effects)if(!s.patterns.some(p=>signature({...p.effect,name:p.name})===signature(e)))s.patterns.push({id:'archive-'+uuid(),name:e.name,effect:e,protected:false,source:'Controller archive',updatedAt:new Date().toISOString(),tags:[]});
  // Archive first, then create a vendor restore point before any effect/calendar mutation.
  const id=uuid();await persist(env,'rolling-backup-'+id,{at:new Date().toISOString(),device:before});
  const t=zonedParts(new Date(),s.settings.timezone);const zone=new Intl.DateTimeFormat('en-US',{timeZone:s.settings.timezone,timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value;
  await trim(env,'data/backup',{backupTime:`${t.year}-${t.month}-${t.day} ${t.hour}:${t.minute}:${t.second} ${zone}`});
  const backup=await trim(env,'data/backup/get');if(!backup.payload?.backupKey)throw new Error('Could not verify the controller restore point. Nothing was changed.');
  const ops=body.testKind==='calendar'?[{kind:'saveCalendar',row:p.rows[0],id:0}]:body.testMode?(p.missing.length?[{kind:'saveEffect',pattern:p.missing[0]}]:[]):[...before.calendar.map(c=>({kind:'deleteCalendar',id:c.id})),...p.removeEffects.map(e=>({kind:'deleteEffect',id:e.id})),...p.missing.map(e=>({kind:'saveEffect',pattern:e})),...p.rows.map((row,index)=>({kind:'saveCalendar',row,id:index})),{kind:'verify'}];
  if(!ops.length)throw new Error('All required designs already exist on the controller. No test upload is needed.');
  if(job)await persist(env,'rolling-archive-'+job.id,job);
  job={id,status:'running',uploaderVersion:2,testMode:!!body.testMode,testKind:body.testKind||'design',verifiedDevice:before,cursor:0,ops,plan:p,before,backupKey:backup.payload.backupKey,createdAt:new Date().toISOString()};await persist(env,'rolling-job',job);
  s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,`Two-month controller sync started: ${p.window.month}`);await writeState(env,s,revision);return {job:publicJob(job)};
 }
 if(body.action!=='step')throw new Error('Unknown rolling-sync action.');
 if(!job||job.status!=='running')return {job:publicJob(job)};
 if(body.jobId!==job.id)throw new Error('Sync job changed. Read status before continuing.');
 try{
  if(job.uploaderVersion!==2)throw new Error('This job was created by the old uploader and cannot be resumed. Verify recovery or accept a reset controller.');
  const op=job.ops[job.cursor];
  // An interrupted write is never sent again. The durable intent survives a lost response.
  if(job.pending?.phase==='sending')throw new Error('The previous write has an unknown outcome. No retry was sent. Inspect the controller before recovery.');
  if(job.pending&&!readOnlyRecheck){
   const wait=Math.max(0,Math.min(VERIFY_INTERVAL_MS,(job.pending.nextCheckAt||0)-uploadNow(env)));
   if(wait)await (env.UPLOAD_WAIT||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(wait);
  }
  await refreshShadow(env,s.settings.timezone);
  const device=await controllerRead(env,s.settings.timezone);
  job.lastRead={at:new Date().toISOString(),effects:device.effects.length,calendar:device.calendar.length};
  if(job.pending){
   job.pending.lastReadback=device;job.pending.attempts=(job.pending.attempts||0)+1;
   job.pending.verificationStartedAt??=uploadNow(env);
   job.pending.elapsedMs=Math.max(0,uploadNow(env)-job.pending.verificationStartedAt);
   if(!matchesExpected(device,job.pending)){
    if(readOnlyRecheck||job.pending.elapsedMs>=VERIFY_WINDOW_MS)throw new Error('Controller readback still does not match the acknowledged write'+(readOnlyRecheck?' on read-only recheck':' after the three-minute verification window')+'. The pending operation was preserved for another read-only recheck. No further changes were sent.');
    job.pending.nextCheckAt=uploadNow(env)+VERIFY_INTERVAL_MS;
    await persist(env,'rolling-job',job);return {job:publicJob(job)};
   }
   job.verifiedDevice=device;
   job.history=[...(job.history||[]),{step:job.cursor,path:job.pending.path,payload:job.pending.payload,responseId:job.pending.responseId,controllerName:job.pending.path==='effect/save'?device.effects.find(e=>e.id===job.pending.responseId)?.name:undefined,verifiedAt:new Date().toISOString()}];
   job.pending=null;job.cursor++;
  }else{
   if(fingerprint(device)!==fingerprint(job.verifiedDevice))throw new Error('Controller configuration changed outside this verified upload. No write was sent.');
   let path,payload;
   if(op.kind==='deleteCalendar'){path='calendar/delete';payload={id:op.id};}
   if(op.kind==='deleteEffect'){
    const e=device.effects.find(e=>e.id===op.id);
    if(!e)throw new Error('Expected design is missing.');
    if(s.patterns.some(p=>p.protected&&effectSignature(p.effect)===effectSignature(e))||device.calendar.some(c=>c.effectId===e.id)||(device.daily||[]).some(c=>c.effectId===e.id)||device.combinedEffect?.effectIds?.includes(e.id)||(device.overlayEffects||[]).some(x=>x.targetEffect===e.id))throw new Error('Pattern still referenced or protected; refusing removal.');
    path='effect/delete';payload={id:op.id};
   }
   if(op.kind==='saveEffect'){
    const existing=device.effects.find(e=>effectSignature(e)===effectSignature(op.pattern.effect));
    if(existing){job.plan.mapping[op.pattern.id]=existing.id;job.cursor++;}
    else{
     if(device.effects.length>=60)throw new Error('Controller pattern capacity changed.');
     const effect=effectPayload(op.pattern.effect);
     if(effect.category===1&&(effect.mode>16||effect.pixels.some(p=>p.count>60)))throw new Error('Design exceeds documented API limits. No write was sent.');
     path='effect/save';payload={id:-1,name:controllerName(op.pattern.name),...effect};
    }
   }
   if(op.kind==='saveCalendar'){
    payload=calendarPayload(op.row,job.plan.mapping[op.row.patternId],op.id);
    if(!Number.isInteger(payload.effectId)||!device.effects.some(e=>e.id===payload.effectId))throw new Error('Calendar references an unverified design.');
    if(device.calendar.some(c=>calendarSignature(c)===calendarSignature(payload))){payload=null;job.cursor++;}
    else{payload.id=Array.from({length:job.testKind==='calendar'?59:60},(_,i)=>job.testKind==='calendar'?i+1:i).find(id=>!device.calendar.some(c=>c.id===id));if(payload.id===undefined)throw new Error(job.testKind==='calendar'?'No unused positive calendar ID (1–59) is available. This test will not use ID 0.':'No free calendar slot.');path='calendar/save';}
   }
   if(op.kind==='verify'){
    const expected=job.plan.rows.map((row,i)=>calendarSignature(calendarPayload(row,job.plan.mapping[row.patternId],i))).sort();
    if(JSON.stringify(expected)!==JSON.stringify(device.calendar.map(calendarSignature).sort()))throw new Error('Final calendar does not match the plan.');
    for(const id of job.plan.wanted){const p=s.patterns.find(p=>p.id===id);if(!p||!device.effects.some(e=>e.id===job.plan.mapping[id]&&effectSignature(e)===effectSignature(p.effect)))throw new Error('Final design verification failed.');}
    path='update';payload={switchState:2};
   }
   if(path){
    job.pending={phase:'sending',path,payload,startedAt:new Date().toISOString(),attempts:0};
    // Persist intent BEFORE the network request. Never automatically replay an uncertain write.
    await persist(env,'rolling-job',job);
    const response=await trim(env,path,payload);
    const responseId=response.payload?.id;
    job.pending={...job.pending,phase:'verifying',responseId,verificationStartedAt:uploadNow(env),nextCheckAt:uploadNow(env)+VERIFY_INTERVAL_MS,expected:expectedAfter(device,path,payload,responseId)};
    if(path==='effect/save')job.plan.mapping[op.pattern.id]=responseId;
   }
  }
  if(job.cursor===job.ops.length){
   job.status='complete';job.completedAt=new Date().toISOString();s.device=job.verifiedDevice;s.snapshotAt=job.completedAt;
   s.snapshotSource='Verified controller upload';
   if(job.testMode){s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;}
   else s.runtime={...s.runtime,preview:false,lastApplied:null};
   addEvent(s,job.testKind==='calendar'?'Single calendar entry saved and verified. Existing entries and designs preserved; Timer Mode was not changed.':job.testMode?'Single design uploaded and readback verified. Check it in the Trimlight app before bulk sync.':'Two-month calendar and Timer Mode verified');
  }
  await persist(env,'rolling-job',job);s.rolling={...publicJob(job),roundMinutes:5};await writeState(env,s,revision);return {job:publicJob(job)};
 }catch(error){
  job.status='failed';job.error=error.message+' Sync paused. No automatic restore or write retry was attempted.';
  s.settings.rollingEnabled=false;s.settings.schedulerEnabled=false;
  job.failure={at:new Date().toISOString(),step:job.cursor,operation:job.ops[job.cursor]?.kind,phase:job.pending?.phase||'refresh-before-write',request:job.pending?{path:job.pending.path,payload:job.pending.payload}:null,code:error.code||null,lastRead:job.lastRead||null};
  await persist(env,'rolling-job',job);s.rolling={...publicJob(job),roundMinutes:5};addEvent(s,job.error,'error');await writeState(env,s,revision);return {job:publicJob(job)};
 }
});}
export async function rollingBackup(env){const job=await document(env,'rolling-job');if(!job)return null;return {at:job.createdAt,device:job.before,diagnostics:{jobId:job.id,status:job.status,error:job.error||null,failure:job.failure||{step:job.cursor,operation:job.ops[job.cursor]?.kind,previousOperation:job.ops[job.cursor-1]?.kind||null},restoreVerified:job.restored===true,uploaderVersion:job.uploaderVersion||1,verifiedWrites:job.history||[],pendingWrite:job.pending||null}};}
