import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../standalone/database.mjs';
import {readState,writeState,handleApi,tick,trim,controllerAction,setScheduler} from '../shared/service.mjs';
import {credentialsApi} from '../shared/connection.mjs';
import {wledUrl,sendColors} from '../shared/wled.mjs';
import {configureCredentials} from '../standalone/credentials.mjs';
function fixture(){
 const calls=[],device={info:{ver:'0.15.1',name:'Test WLED',leds:{count:300}},state:{on:true,seg:[{id:0,start:0,stop:150},{id:1,start:150,stop:300}],ps:1}};
 const env={DB:openDatabase(':memory:'),LOCAL_RUNNER:true,CONTROLLER_TYPE:'wled',WLED_URL:'http://192.168.1.50',TRIMLIGHT_CLIENT_ID:'old-id',TRIMLIGHT_CLIENT_SECRET:'old-secret',TRIMLIGHT_DEVICE_ID:'old-device',FETCH:async(url,init)=>{calls.push({url,body:init.body&&JSON.parse(init.body),method:init.method});if(url.endsWith('/json'))return Response.json(device);if(url.endsWith('/presets.json'))return Response.json({'0':{},'1':{n:'Christmas'},'251':{n:'Invalid'}});return Response.json({success:true});}};
 return {env,calls,device};
}
test('WLED URL accepts private IPv4 only and forbids redirect targets/credential-bearing URLs',()=>{
 assert.equal(wledUrl('http://10.1.51.140:80'),'http://10.1.51.140');
 for(const u of ['http://127.0.0.1','http://169.254.169.254','http://example.com','http://192.168.1.1/admin','http://x:y@10.0.0.1','file:///etc/passwd'])assert.throws(()=>wledUrl(u));
});
test('WLED blocks every Trimlight request and rolling mutation before network access',async()=>{
 const {env,calls}=fixture();await assert.rejects(trim(env,'effect/save',{}),/disabled/);
 const r=await handleApi(new Request('http://studio/api/rolling',{method:'POST',body:JSON.stringify({action:'enable'})}),env);assert.equal(r.status,400);assert.equal(calls.length,0);
});
test('switch to WLED tests read-only, preserves Trimlight credentials and library, pauses schedules, persists restart provider',async()=>{
 const {env,calls}=fixture();env.CONTROLLER_TYPE='trimlight';let saved={clientId:'old-id',clientSecret:'old-secret',deviceId:'old-device'},store={read:()=>saved,write:v=>{saved=v}};
 let {state,revision}=await readState(env);state.settings.rollingEnabled=true;state.patterns=[{id:'x',name:'Keep',effect:{}}];state.rolling={status:'failed',id:'old-job'};await writeState(env,state,revision);
 const r=await credentialsApi(new Request('http://studio/api/credentials',{method:'POST',body:JSON.stringify({action:'save',controllerType:'wled',wledUrl:env.WLED_URL})}),env,store);assert.equal(r.status,200);assert.equal(saved.clientSecret,'old-secret');assert.equal(env.CONTROLLER_TYPE,'wled');
 const after=(await readState(env)).state;assert.equal(after.patterns[0].name,'Keep');assert.equal(after.settings.rollingEnabled,false);assert.equal(after.rolling.id,'old-job');assert.ok(calls.every(c=>c.method==='GET'));
 const restarted={};configureCredentials(restarted,store);assert.equal(restarted.CONTROLLER_TYPE,'wled');assert.equal(restarted.TRIMLIGHT_CLIENT_SECRET,'old-secret');
});
test('individual pixel painting configures brightness first and uses sequential chunks without saving presets or hardware',async()=>{
 const {env,calls}=fixture();await sendColors(env,Array(300).fill(0xff0000),80);
 assert.equal(calls.length,4);assert.equal(calls[1].body.bri,80);assert.equal(calls[1].body.seg[1].stop,0);assert.equal(calls[2].body.seg.i[0],0);assert.equal(calls[2].body.seg.i.length,257);assert.equal(calls[3].body.seg.i[0],256);assert.equal(calls[3].body.seg.i[1],'ff0000');
 assert.ok(calls.slice(1).every(c=>c.url.endsWith('/json/state')&&!('psave'in c.body)));
});
test('animated Trimlight look without mapping fails before writes; preset preview sends native ID and expires',async()=>{
 const {env,calls}=fixture();let {state,revision}=await readState(env);state.patterns=[{id:'x',name:'Animated',effect:{category:1,mode:6}}];await writeState(env,state,revision);
 await assert.rejects(controllerAction(env,{action:'pattern',patternId:'x'}),/assign a WLED preset/);assert.equal(calls.length,0);
 ({state,revision}=await readState(env));state.patterns[0].wledPreset=1;await writeState(env,state,revision);await controllerAction(env,{action:'pattern',patternId:'x'});assert.deepEqual(calls.at(-1).body,{ps:1});
 await tick(env,new Date(Date.now()+130000));assert.deepEqual(calls.at(-1).body,{on:false});
});
test('calendar runner plays once and turns off at end; missing preset pauses without repeated writes',async()=>{
 const {env,calls}=fixture();let {state,revision}=await readState(env);state.patterns=[{id:'x',name:'Christmas',wledPreset:1,effect:{category:1,mode:6}}];state.rules=[{id:'r',name:'Evening',patternId:'x',startDate:'01-01',endDate:'12-31',year:null,enabled:true,priority:1,kind:'fixed',fixedStart:'17:00',end:'23:00',offset:0}];await writeState(env,state,revision);await setScheduler(env,true);
 await tick(env,new Date('2026-11-11T18:00:00Z'));assert.deepEqual(calls.at(-1).body,{ps:1});const n=calls.length;await tick(env,new Date('2026-11-11T18:01:00Z'));assert.equal(calls.length,n);
 await tick(env,new Date('2026-11-11T23:01:00Z'));assert.deepEqual(calls.at(-1).body,{on:false});
 ({state,revision}=await readState(env));state.patterns[0].wledPreset=2;await writeState(env,state,revision);await tick(env,new Date('2026-11-12T18:01:00Z'));assert.equal((await readState(env)).state.settings.schedulerEnabled,false);const k=calls.length;await tick(env,new Date('2026-11-12T18:02:00Z'));assert.equal(calls.length,k);
});
test('switch back to Trimlight reuses saved credentials, reads only and leaves scheduler paused',async()=>{
 const {env,calls}=fixture();let saved={controllerType:'wled',wledUrl:env.WLED_URL,clientId:env.TRIMLIGHT_CLIENT_ID,clientSecret:env.TRIMLIGHT_CLIENT_SECRET,deviceId:env.TRIMLIGHT_DEVICE_ID},store={read:()=>saved,write:v=>{saved=v}};
 env.FETCH=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({code:0,payload:{effects:[],calendar:[],ports:[],connectivity:1}})};
 const r=await credentialsApi(new Request('http://studio/api/credentials',{method:'POST',body:JSON.stringify({action:'save',controllerType:'trimlight',clientId:'old-id',deviceId:'old-device',clientSecret:''})}),env,store);
 assert.equal(r.status,200);assert.equal(env.CONTROLLER_TYPE,'trimlight');assert.equal(saved.wledUrl,'http://192.168.1.50');assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/get'));assert.equal((await readState(env)).state.settings.schedulerEnabled,false);
});
test('mismatched LED count refuses painting before any write',async()=>{
 const {env,calls}=fixture();await assert.rejects(sendColors(env,[255],80),/300 LEDs/);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
});
