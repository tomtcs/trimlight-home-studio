import {protectedController,checkControllerRequest,recordRequest,diagnostics,protectionTest,protectionTick} from './controller-protection.mjs';
import {householdState,initialState,validateState,compile,selectionColors,effectPayload,dayPlan,dateKey,plusDay,zonedParts,uuid} from './domain.mjs';
import {upgradeCatalog} from './catalog-upgrade.mjs';
const JSON_HEADERS={'content-type':'application/json','cache-control':'no-store'};
export const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:JSON_HEADERS});
export async function readState(env){
 if(!env.DB)throw new Error('Workspace database is not configured.');
 let row=await env.DB.prepare('SELECT data,revision FROM documents WHERE id=?').bind('workspace').first();
 if(!row){await env.DB.prepare('INSERT OR IGNORE INTO documents (id,data,revision) VALUES (?,?,0)').bind('workspace',JSON.stringify(env.LOCAL_RUNNER?householdState():initialState())).run();row=await env.DB.prepare('SELECT data,revision FROM documents WHERE id=?').bind('workspace').first();}
 const state=JSON.parse(row.data);if(upgradeCatalog(state)){try{return {state,revision:await writeState(env,state,row.revision)}}catch(e){if(e.status===409)return readState(env);throw e}}return {state,revision:row.revision};
}
export async function writeState(env,state,revision){
 const r=await env.DB.prepare('UPDATE documents SET data=?, revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(state),'workspace',revision).run();
 if(!r.meta?.changes)throw Object.assign(new Error('This workspace changed in another tab. Refresh before saving.'),{status:409});return revision+1;
}
export async function lease(env,fn){
 const token=uuid(),now=Date.now();const r=await env.DB.prepare('INSERT INTO leases (id,token,expires) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token, expires=excluded.expires WHERE leases.expires<?').bind('controller',token,now+120000,now).run();
 if(!r.meta?.changes)throw Object.assign(new Error('A controller request is already running. Please wait.'),{status:409});
 try{return await fn()}finally{await env.DB.prepare('DELETE FROM leases WHERE id=? AND token=?').bind('controller',token).run();}
}
export function addEvent(state,label,status='success'){state.events=[{id:uuid(),at:new Date().toISOString(),label,status},...state.events].slice(0,100)}
export async function trim(env,path,payload,method='POST',extra={}){
 checkControllerRequest(env,path,payload);
 if(!env.TRIMLIGHT_CLIENT_ID||!env.TRIMLIGHT_CLIENT_SECRET||!env.TRIMLIGHT_DEVICE_ID)throw new Error('Trimlight credentials are not configured on this server.');
 const t=String(Date.now()),message=`Trimlight|${env.TRIMLIGHT_CLIENT_ID}|${t}`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TRIMLIGHT_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));const token=btoa(String.fromCharCode(...bytes));
 const body={deviceId:env.TRIMLIGHT_DEVICE_ID,...extra,...(payload===undefined?{}:{payload})};
 let url='https://trimlight.ledhue.com/trimlight/v1/oauth/resources/device/'+path;
 if(method==='GET')url+='?'+new URLSearchParams({deviceId:env.TRIMLIGHT_DEVICE_ID});

 await recordRequest(env,{path,method,payload:payload||null,status:'sending'});
 const res=await (env.FETCH||fetch)(url,{method,headers:{'Content-Type':'application/json','Authorization':token,'S-ClientId':env.TRIMLIGHT_CLIENT_ID,'S-Timestamp':t},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
 await recordRequest(env,{path,status:'http-response',httpStatus:res.status});
 if(!res.ok)throw new Error(`Trimlight returned HTTP ${res.status}. No automatic retry was made.`);const data=await res.json();await recordRequest(env,{path,status:'response',code:data.code,response:data.payload&&path==='get'?{effects:data.payload.effects?.length,calendar:data.payload.calendar?.length,firmware:data.payload.fwVersionName}:data.payload||null});
 if(data.code!==0)throw Object.assign(new Error(`Trimlight: ${String(data.desc||'request rejected').slice(0,200)} (${data.code}).`),{code:data.code});return data;
}
export async function syncSnapshot(env){
 return lease(env,async()=>{const {state,revision}=await readState(env);let refreshed=true;try{await trim(env,'notify-update-shadow',undefined,'POST')}catch{refreshed=false}
 const p=zonedParts(new Date(),state.settings.timezone);const currentDate={year:+p.year-2000,month:+p.month,day:+p.day,hours:+p.hour,minutes:+p.minute,seconds:+p.second,weekday:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay()+1};
 const r=await trim(env,'get',undefined,'POST',{currentDate});if(!r.payload||!Array.isArray(r.payload.effects)||!Array.isArray(r.payload.calendar)||!Array.isArray(r.payload.ports))throw new Error('Controller returned an incomplete configuration. The previous snapshot was preserved.');state.device=r.payload;state.snapshotAt=new Date().toISOString();state.snapshotSource=refreshed?'Trimlight cloud readback':'Trimlight cached cloud snapshot';
 addEvent(state,'Read controller configuration');return {state,revision:await writeState(env,state,revision)};});
}
async function preview(env,state,effect,label){
 const payload=effectPayload(effect);
 await trim(env,'update',{switchState:1});
 try{await trim(env,'effect/preview',payload)}catch(error){try{await trim(env,'update',{switchState:2})}catch{}throw error}
 state.runtime={...state.runtime,preview:true,holdUntil:Date.now()+120000};addEvent(state,`Preview requested: ${label}`);
}
export async function controllerAction(env,body){
 return lease(env,async()=>{const {state,revision}=await readState(env);
 if(body.action==='resume'){await trim(env,'update',{switchState:2});state.settings.schedulerEnabled=false;state.runtime={...state.runtime,preview:false,holdUntil:0,lastApplied:null};addEvent(state,'Timer Mode requested');}
 else if(body.action==='off'){await trim(env,'update',{switchState:0});state.runtime={...state.runtime,preview:false,holdUntil:Date.now()+300000,lastApplied:null};addEvent(state,'Lights off requested (scheduler paused for 5 minutes)');}
 else if(body.action==='finder'){const colors=selectionColors(state.settings.maxAddress,body.start,body.end,body.step,body.color);const e=compile(colors,{maxRun:state.settings.maxRun,brightness:80});await preview(env,state,e,`addresses ${body.start}–${body.end}`);}
 else if(body.action==='pattern'){const p=state.patterns.find(p=>p.id===body.patternId);if(!p)throw new Error('Pattern not found.');await preview(env,state,p.effect,p.name);}
 else throw new Error('Unknown controller action.');
 return {state,revision:await writeState(env,state,revision),message:'Controller request accepted. Verify the result at your house.'};});
}
export async function setScheduler(env,enabled){
 if(protectedController(env))throw new Error('Protection mode pauses automatic scheduling. Use the one-minute scheduled test on the Evening planner.');
 const existing=await readState(env);if(enabled&&existing.state.settings.rollingEnabled)throw new Error('Pause monthly controller sync before enabling the live home-server scheduler.');
 if(!env.LOCAL_RUNNER)throw new Error('Automatic scheduling runs in the home-server container. This hosted app provides the planner.');
 return lease(env,async()=>{const {state,revision}=await readState(env);await trim(env,'update',{switchState:enabled?0:2});state.settings.schedulerEnabled=!!enabled;state.runtime={...state.runtime,lastApplied:null,holdUntil:0,preview:false};addEvent(state,enabled?'Home-server scheduler enabled; native Timer Mode suspended':'Scheduler disabled; native Timer Mode requested');return {state,revision:await writeState(env,state,revision)};});
}
export async function tick(env,now=new Date()){
 if(!env.LOCAL_RUNNER)return;
 if(protectedController(env))return protectionTick(env);
 return lease(env,async()=>{const {state,revision}=await readState(env);
 if(!state.settings.schedulerEnabled){if(state.runtime.preview&&state.runtime.holdUntil<Date.now()){await trim(env,'update',{switchState:2});state.runtime.preview=false;addEvent(state,'Expired preview: Timer Mode requested');await writeState(env,state,revision)}return;}
 if(state.runtime.holdUntil>+now)return;
 const today=dateKey(now,state.settings.timezone);const plans=[dayPlan(state,plusDay(today,-1)),dayPlan(state,today)];
 const plan=plans.find(p=>p.start&&+new Date(p.start)<=+now&&+now<+new Date(p.end));
 if(plan?.conflict){state.runtime.lastError='Equal-priority rules conflict. Edit the planner.';await trim(env,'update',{switchState:0});await writeState(env,state,revision);return;}
 const pattern=plan&&state.patterns.find(p=>p.id===plan.rule.patternId);const id=pattern?`${plan.date}:${plan.rule.id}:${JSON.stringify(pattern.effect)}`:`off:${today}`;
 if(state.runtime.lastApplied!==id){
  if(pattern){const payload=effectPayload(pattern.effect);await trim(env,'update',{switchState:1});try{await trim(env,'effect/preview',payload)}catch(error){try{await trim(env,'update',{switchState:0})}catch{}throw error}addEvent(state,`Scheduled display requested: ${pattern.name}`)}
  else{await trim(env,'update',{switchState:0});addEvent(state,'Scheduled lights-off requested')}
  state.runtime={...state.runtime,lastApplied:id,lastTick:now.toISOString(),preview:false,lastError:null};await writeState(env,state,revision);
 }
 });
}
export async function handleApi(request,env){
 try{
 const path=new URL(request.url).pathname.replace(/^\/api\/?/,'');
 if(path==='controller-diagnostics'&&request.method==='GET')return json(await diagnostics(env));
 if(path==='controller-test'&&request.method==='POST')return json(await protectionTest(env,await request.json()));
 if(path==='rolling'&&request.method==='POST'&&protectedController(env))throw new Error('Controller-protection mode blocks controller sync and recovery operations. Your existing backups remain available.');
 if(path==='rolling'||path==='rolling-backup'){const rolling=await import('./rolling.mjs');if(request.method==='GET')return json(path==='rolling-backup'?await rolling.rollingBackup(env):await rolling.rollingStatus(env));if(request.method==='POST'&&path==='rolling'){const body=await request.json();return json(await rolling.rollingAction(env,body));}}

 if(request.method==='GET'&&path==='state'){const r=await readState(env);return json({...r,controllerProtected:protectedController(env),connected:!!env.TRIMLIGHT_CLIENT_SECRET,localRunner:!!env.LOCAL_RUNNER})}
 if(request.method==='GET'&&path==='export'){const r=await readState(env);return new Response(JSON.stringify(r.state,null,2),{headers:{...JSON_HEADERS,'content-disposition':'attachment; filename="roofline-studio-backup.json"'}})}
 if(request.method!=='POST')return json({error:'Not found'},404);
 const text=await request.text();if(text.length>1900000)return json({error:'Backup exceeds 1.9 MB. Resize the property photos.'},413);
 const body=JSON.parse(text||'{}');const current=await readState(env);if(current.state.rolling?.status==='running'&&['state','action','scheduler'].includes(path))throw new Error('A controller calendar sync is running. Finish it before editing or previewing.');
 if(path==='state'){return await lease(env,async()=>{const {state,revision}=await readState(env);if(body.revision!==revision)return json({error:'This workspace changed. Refresh before saving.'},409);const next=validateState(body.state,state);return json({state:next,revision:await writeState(env,next,revision)})})}
 if(path==='sync')return json(await syncSnapshot(env));
 if(path==='action')return json(await controllerAction(env,body));
 if(path==='scheduler')return json(await setScheduler(env,body.enabled));
 return json({error:'Not found'},404);
 }catch(e){return json({error:e.message||'Request failed',...(e.issue?{issue:e.issue}:{})},e.status||400)}
}
