import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {credentialsApi} from '../shared/connection.mjs';
const request=b=>new Request('http://localhost/api/credentials',{method:'POST',body:JSON.stringify({action:'discover',...b})});
test('discovery signs a read-only request without requiring or saving a device ID',async()=>{
 const env={FETCH:async(url,opts)=>{assert.equal(url,'https://trimlight.ledhue.com/trimlight/v1/oauth/resources/devices?page=0');assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.headers.Authorization,createHmac('sha256','secret').update(`Trimlight|client|${opts.headers['S-Timestamp']}`).digest('base64'));return Response.json({code:0,payload:{data:[{name:'House',deviceId:'one',connectivity:1,secret:'excluded'},{name:'Shed',deviceId:'two',connectivity:0}]}})}};
 const r=await credentialsApi(request({clientId:'client',clientSecret:'secret'}),env,{write(){assert.fail('must not save')}});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{devices:[{name:'House',deviceId:'one',online:true},{name:'Shed',deviceId:'two',online:false}]});assert.equal(env.TRIMLIGHT_DEVICE_ID,undefined);
});
test('discovery permits empty results and only reuses a secret for the same client',async()=>{
 const env={TRIMLIGHT_CLIENT_ID:'client',TRIMLIGHT_CLIENT_SECRET:'secret',FETCH:async()=>Response.json({code:0,payload:{data:[]}})};
 assert.deepEqual(await (await credentialsApi(request({clientId:'client'}),env,{})).json(),{devices:[]});
 assert.equal((await credentialsApi(request({clientId:'other'}),env,{})).status,400);
});
test('upstream errors are sanitized',async()=>{
 const r=await credentialsApi(request({clientId:'client',clientSecret:'secret'}),{FETCH:async()=>Response.json({code:9,desc:'private-token-value'})},{});
 assert.equal(r.status,400);assert.doesNotMatch(await r.text(),/private-token-value/);
});
