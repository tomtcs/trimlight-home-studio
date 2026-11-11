import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../standalone/database.mjs';
import {readState,writeState} from '../shared/service.mjs';
import {rollingAction,rollingBackup} from '../shared/rolling.mjs';

async function fixture(){
 const calls=[];const env={DB:openDatabase(':memory:'),LOCAL_RUNNER:true,TRIMLIGHT_CLIENT_ID:'test',TRIMLIGHT_CLIENT_SECRET:'test',TRIMLIGHT_DEVICE_ID:'test'};
 const {state,revision}=await readState(env);
 const before={...state.device,connectivity:1};
 const job={id:'failed-job',status:'failed',cursor:0,ops:[{kind:'verify'}],plan:{window:{},calendarSlots:0,patternSlots:0},before,backupKey:'private',error:'old error'};
 state.rolling={id:job.id,status:'failed'};state.settings.rollingEnabled=true;
 const rev=await writeState(env,state,revision);
 await env.DB.prepare('INSERT INTO documents (id,data,revision) VALUES (?,?,0)').bind('rolling-job',JSON.stringify(job)).run();
 env.FETCH=async url=>{calls.push(url.split('/device/')[1]);return Response.json({code:0,payload:before})};
 return {env,calls,before,job,rev,state};
}
test('accept reset requires explicit current confirmation, preserves library and backup, only refreshes and reads',async()=>{
 const {env,calls,before,rev,state}=await fixture();
 await assert.rejects(rollingAction(env,{action:'acceptReset',revision:rev,jobId:'failed-job'}),/confirm/);assert.equal(calls.length,0);
 const r=await rollingAction(env,{action:'acceptReset',revision:rev,jobId:'failed-job',confirmReset:true});
 assert.deepEqual(calls,['notify-update-shadow','get']);assert.equal(r.job.status,'resetAccepted');assert.equal(r.state.settings.rollingEnabled,false);assert.equal(r.state.settings.schedulerEnabled,false);
 for(const k of ['patterns','rules','house'])assert.deepEqual(r.state[k],state[k]);
 assert.deepEqual((await rollingBackup(env)).device,before);
 assert.ok(await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('rolling-archive-failed-job').first());
});
test('unparseable snapshot does not clear the failed job or trigger a restore',async()=>{
 const {env,calls,rev,job}=await fixture();
 env.FETCH=async url=>{calls.push(url.split('/device/')[1]);return Response.json(url.endsWith('/get')?{code:12006,desc:'unparseable'}:{code:0})};
 await assert.rejects(rollingAction(env,{action:'acceptReset',revision:rev,jobId:job.id,confirmReset:true}),e=>e.code===12006);
 assert.equal(JSON.parse((await env.DB.prepare('SELECT data FROM documents WHERE id=?').bind('rolling-job').first()).data).status,'failed');
 job.status='running';job.ops=[{kind:'saveCalendar'}];
 await env.DB.prepare('UPDATE documents SET data=? WHERE id=?').bind(JSON.stringify(job),'rolling-job').run();
 const r=await rollingAction(env,{action:'step',jobId:job.id});
 assert.equal(r.job.status,'failed');assert.match(r.job.error,/No automatic restore/);assert.ok(!calls.includes('data/backup/restore'));
 assert.equal((await readState(env)).state.settings.rollingEnabled,false);
});
