import {lease,readState,writeState,trim,json} from './service.mjs';
const fields={clientId:'TRIMLIGHT_CLIENT_ID',clientSecret:'TRIMLIGHT_CLIENT_SECRET',deviceId:'TRIMLIGHT_DEVICE_ID'};
export async function credentialsApi(request,env,store){
 const status=()=>({configured:!!(env.TRIMLIGHT_CLIENT_ID&&env.TRIMLIGHT_CLIENT_SECRET&&env.TRIMLIGHT_DEVICE_ID),clientId:env.TRIMLIGHT_CLIENT_ID||'',deviceId:env.TRIMLIGHT_DEVICE_ID||'',hasSecret:!!env.TRIMLIGHT_CLIENT_SECRET});
 if(request.method==='GET')return json(status());
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{const b=await request.json();return await lease(env,async()=>{
 const {state,revision}=await readState(env);if(state.settings.schedulerEnabled||state.runtime.preview||state.rolling?.status==='running')throw new Error('Pause scheduling, resume Timer Mode, and finish any active sync before changing the connection.');
 if(b.action==='disconnect'){await store.write({});for(const v of Object.values(fields))env[v]='';return json({...status(),connected:false});}
 if(!['test','save'].includes(b.action))throw new Error('Unknown connection action.');
 const clientId=String(b.clientId||'').trim(),deviceId=String(b.deviceId||'').trim();const clientSecret=b.clientSecret||((clientId===env.TRIMLIGHT_CLIENT_ID)?env.TRIMLIGHT_CLIENT_SECRET:'');
 if(!clientId||!clientSecret||!deviceId||[clientId,clientSecret,deviceId].some(v=>typeof v!=='string'||v.length>256||/[\r\n]/.test(v)))throw new Error('Enter a valid client ID, client secret, and controller device ID.');
 const bound=state.connectionDeviceId||env.TRIMLIGHT_DEVICE_ID;if(bound&&bound!==deviceId)throw new Error('This workspace belongs to another controller. Use a separate installation/data volume for a different system.');
 const trial={...env,TRIMLIGHT_CLIENT_ID:clientId,TRIMLIGHT_CLIENT_SECRET:clientSecret,TRIMLIGHT_DEVICE_ID:deviceId};let response;try{response=await trim(trial,'get')}catch{throw new Error('Connection test failed. Check the credentials, controller ID, and network connection.');}
 const device=response.payload;if(!device||!Array.isArray(device.effects)||!Array.isArray(device.calendar))throw new Error('The controller did not return a valid configuration.');
 if(b.action==='test')return json({ok:true,online:device.connectivity===1,message:device.connectivity===1?'Credentials accepted; controller online.':'Credentials accepted; controller currently offline.'});
 state.connectionDeviceId=deviceId;
 if(!state.patterns.length&&!state.rules.length){state.device=device;state.patterns=device.effects.map(e=>({id:'device-'+e.id,name:e.name,effect:e,protected:false,source:'Controller import',updatedAt:new Date().toISOString(),tags:[]}));const max=Math.max(1,...(device.ports||[]).map(p=>p.end));state.settings.maxAddress=Math.min(2048,max);state.snapshotAt=new Date().toISOString();state.snapshotSource='Connection setup readback';}
 await writeState(env,state,revision);await store.write({clientId,clientSecret,deviceId});Object.assign(env,trial);return json({...status(),connected:true,message:'Credentials saved securely on this server.'});
 });}catch(e){return json({error:e.message},e.status||400)}
}
