import test from 'node:test';
import {uuid} from '../shared/id.mjs';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
test('container server authenticates, serves the app, and persists landmarks',async()=>{
 const dir=await mkdtemp(tmpdir()+'/roofline-test-');const port=18000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,['standalone/server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,APP_USER:'tester',APP_PASSWORD:'testpass',TRIMLIGHT_CLIENT_ID:'',TRIMLIGHT_CLIENT_SECRET:'',TRIMLIGHT_DEVICE_ID:''},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Server did not start')),10000);child.stdout.on('data',c=>{if(c.toString().includes('listening')){clearTimeout(t);resolve()}});child.on('error',reject);child.on('exit',code=>{if(code)reject(new Error('Server exited '+code))})});
  const base=`http://127.0.0.1:${port}`,headers={Authorization:'Basic '+Buffer.from('tester:testpass').toString('base64')};
  assert.equal((await fetch(base+'/api/state')).status,401);
  assert.match(await (await fetch(base,{headers})).text(),/Trimlight Home Studio/);
  let a=await (await fetch(base+'/api/state',{headers})).json();assert.equal(a.localRunner,true);assert.equal(a.state.settings.schedulerEnabled,false);
  a.state.landmarks.push({id:'test-corner',name:'Test corner',address:37,x:12,y:23});
  assert.equal((await fetch(base+'/api/state',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({state:a.state,revision:a.revision})})).status,200);
  a=await (await fetch(base+'/api/state',{headers})).json();assert.equal(a.state.landmarks[0].name,'Test corner');
  const id=uuid({getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)});
  a.state.houseViews={right:{photo:null,lines:[{id,kind:'edge',points:[[10,10],[20,20],[30,20]],wireSegments:[1]}]}};
  let saved=await fetch(base+'/api/state',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({state:a.state,revision:a.revision})});
  assert.equal(saved.status,200);a=await saved.json();
  a.state.houseViews.right.lines[0].points[1]=[25,25];
  saved=await fetch(base+'/api/state',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({state:a.state,revision:a.revision})});
  assert.equal(saved.status,200);
  a=await (await fetch(base+'/api/state',{headers})).json();
  assert.deepEqual(a.state.houseViews.right.lines[0],{id,kind:'edge',points:[[10,10],[25,25],[30,20]],wireSegments:[1]});
  assert.equal((await fetch(base+'/api/state',{method:'POST',headers:{...headers,Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true})}
});

test('server rejects missing and fewer than eight password characters',async()=>{
 const dir=await mkdtemp(tmpdir()+'/roofline-password-test-');
 try{for(const password of ['', '1234567']){const r=spawnSync(process.execPath,['standalone/server.mjs'],{env:{...process.env,DATA_DIR:dir,APP_PASSWORD:password},encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.match(r.stderr,/at least 8 characters/);}}finally{await rm(dir,{recursive:true,force:true})}
});
