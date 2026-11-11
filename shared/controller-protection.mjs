import {lease,readState,writeState,trim} from './service.mjs';
export const LIVE_TEST=Symbol('explicit live test');
export const protectedController=env=>env.CONTROLLER_PROTECTION!=='off';
export function checkControllerRequest(env,path,payload){
 if(!protectedController(env))return;
 if(['get','notify-update-shadow'].includes(path))return;
 if(env[LIVE_TEST]===true&&path==='update'&&Object.keys(payload||{}).length===1&&[0,1,2].includes(payload.switchState))return;
 if(env[LIVE_TEST]===true&&path==='effect/preview'&&JSON.stringify(payload)===JSON.stringify(staticTest()))return;
 throw new Error('Controller-protection mode blocks this request. Use the controlled tests on the Evening planner. Stored designs, calendars and restores are disabled.');
}
export function staticTest(){return {category:1,mode:0,brightness:40,speed:0,pixels:[{index:0,count:1,color:0xffffff,disable:false}]};}
export async function recordRequest(env,record){
 if(!env.DB)return;const row=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('controller-diagnostics').first();const log=row?JSON.parse(row.data):[];
 log.push({at:new Date().toISOString(),...record});await env.DB.prepare('INSERT INTO documents (id,data,revision) VALUES (?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=documents.revision+1').bind('controller-diagnostics',JSON.stringify(log.slice(-60))).run();
}
export async function diagnostics(env){const row=await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('controller-diagnostics').first();return {protected:protectedController(env),log:row?JSON.parse(row.data):[]};}
export async function protectionTest(env,body){
 if(!protectedController(env))throw new Error('Enable controller protection before running these tests.');
 return lease(env,async()=>{let {state,revision}=await readState(env);state.settings.schedulerEnabled=false;state.settings.rollingEnabled=false;
 const trial={...env,[LIVE_TEST]:true};
 if(body.action==='baseline'){
  await trim(env,'notify-update-shadow');const result=await trim(env,'get');
  if(!Array.isArray(result.payload?.effects)||!Array.isArray(result.payload?.calendar))throw new Error('Invalid controller snapshot. Baseline was not replaced.');
  state.protectionBaseline={at:new Date().toISOString(),device:result.payload};state.device=result.payload;state.snapshotAt=new Date().toISOString();state.snapshotSource='Protection-mode baseline readback';
 }else{
  if(body.confirm!==true)throw new Error('Confirm this live controller test.');
  if(!['off','resume','static','schedule'].includes(body.action))throw new Error('Unknown test.');
  if(['static','schedule'].includes(body.action)&&!state.protectionBaseline)throw new Error('Capture a baseline first.');
  if(['static','schedule'].includes(body.action)&&['waiting','cleanup'].includes(state.protectionTest?.phase))throw new Error('A test is already pending. Return to Timer Mode before starting another.');
  if(body.action==='schedule'){
   state.protectionTest={phase:'waiting',due:Date.now()+60000};
  }else if(body.action==='static'){
   // Persist cleanup intent before the first write. Never automatically retry a preview.
   state.protectionTest={phase:'cleanup',due:Date.now()+60000};revision=await writeState(env,state,revision);
   await trim(trial,'update',{switchState:1});await trim(trial,'effect/preview',staticTest());
  }else{state.protectionTest=null;state.runtime={};revision=await writeState(env,state,revision);await trim(trial,'update',{switchState:body.action==='off'?0:2});}
 }
 return {state,revision:await writeState(env,state,revision),message:'Test recorded. Confirm the lights and iOS access before proceeding.'};
 });
}
export async function protectionTick(env){return lease(env,async()=>{
 let {state,revision}=await readState(env);const test=state.protectionTest;
 if(state.settings.schedulerEnabled||state.settings.rollingEnabled){state.settings.schedulerEnabled=false;state.settings.rollingEnabled=false;revision=await writeState(env,state,revision);}
 if(!test||test.due>Date.now()||!['waiting','cleanup'].includes(test.phase))return;
 const trial={...env,[LIVE_TEST]:true};
 if(test.phase==='waiting'&&Date.now()-test.due>90000){state.protectionTest={phase:'expired',due:test.due};await writeState(env,state,revision);return;}
 if(test.phase==='waiting'){
  state.protectionTest={phase:'cleanup',due:Date.now()+60000};revision=await writeState(env,state,revision);
  try{await trim(trial,'update',{switchState:1});await trim(trial,'effect/preview',staticTest())}catch(e){state.protectionTest.error=e.message;await writeState(env,state,revision)}
 }else{
  state.protectionTest={phase:'cleanup-attempted',due:test.due};revision=await writeState(env,state,revision);
  try{await trim(trial,'update',{switchState:2});state.protectionTest.phase='complete'}catch(e){state.protectionTest.error=e.message}
  await writeState(env,state,revision);
 }
 });}
