import {readWled,wledSnapshot,wledUrl} from './wled.mjs';
import {lease,readState,writeState,trim,json} from './service.mjs';
const fields={clientId:'TRIMLIGHT_CLIENT_ID',clientSecret:'TRIMLIGHT_CLIENT_SECRET',deviceId:'TRIMLIGHT_DEVICE_ID'};
export async function credentialsApi(request,env,store){
 const status=()=>({controllerType:env.CONTROLLER_TYPE||'trimlight',wledUrl:env.WLED_URL||'',configured:env.CONTROLLER_TYPE==='wled'?!!env.WLED_URL:!!(env.TRIMLIGHT_CLIENT_ID&&env.TRIMLIGHT_CLIENT_SECRET&&env.TRIMLIGHT_DEVICE_ID),clientId:env.TRIMLIGHT_CLIENT_ID||'',deviceId:env.TRIMLIGHT_DEVICE_ID||'',hasSecret:!!env.TRIMLIGHT_CLIENT_SECRET});
 if(request.method==='GET')return json(status());
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{const b=await request.json();if(b.controllerType&&!['trimlight','wled'].includes(b.controllerType))throw new Error('Unknown controller type.');if(b.action==='discover')return json({devices:await discoverControllers(b,env)});return await lease(env,async()=>{
 const {state,revision}=await readState(env);if(state.settings.schedulerEnabled||state.runtime.preview||state.rolling?.status==='running')throw new Error('Pause scheduling, resume Timer Mode, and finish any active sync before changing the connection.');
 if(b.action==='disconnect'){const saved=store.read()||{};if(env.CONTROLLER_TYPE==='wled'){saved.wledUrl='';env.WLED_URL='';}else{for(const k of Object.keys(fields))delete saved[k];for(const v of Object.values(fields))env[v]='';}await store.write(saved);return json({...status(),connected:false});}
 if(!['test','save'].includes(b.action))throw new Error('Unknown connection action.');
 const selected=b.controllerType||'trimlight';
 if(selected==='wled'){
  if(!env.LOCAL_RUNNER)throw new Error('WLED is available in the local Docker server only.');
  const url=wledUrl(b.wledUrl),trial={...env,CONTROLLER_TYPE:'wled',WLED_URL:url};const device=await readWled(trial);
  if(b.action==='test')return json({ok:true,message:`Connected to ${device.info.name||'WLED'} · ${device.info.leds.count} LEDs · firmware ${device.info.ver}. No lights changed.`});
  state.controllerSnapshots={...state.controllerSnapshots,[env.CONTROLLER_TYPE||'trimlight']:state.device};state.device=wledSnapshot(device);
  state.settings.schedulerEnabled=false;state.settings.rollingEnabled=false;state.runtime={};state.snapshotAt=new Date().toISOString();state.snapshotSource='WLED connection test';
  await writeState(env,state,revision);await store.write({...store.read(),controllerType:'wled',wledUrl:url});env.CONTROLLER_TYPE='wled';env.WLED_URL=url;
  return json({...status(),connected:true,message:'WLED selected. Scheduling is paused. Set the logical address count to '+device.info.leds.count+', assign WLED presets to animated looks, then enable the home-server scheduler.'});
 }
 const clientId=String(b.clientId||'').trim(),deviceId=String(b.deviceId||'').trim();const clientSecret=b.clientSecret||((clientId===env.TRIMLIGHT_CLIENT_ID)?env.TRIMLIGHT_CLIENT_SECRET:'');
 if(!clientId||!clientSecret||!deviceId||[clientId,clientSecret,deviceId].some(v=>typeof v!=='string'||v.length>256||/[\r\n]/.test(v)))throw new Error('Enter a valid client ID, client secret, and controller device ID.');
 const bound=state.connectionDeviceId||env.TRIMLIGHT_DEVICE_ID;if(bound&&bound!==deviceId)throw new Error('This workspace belongs to another controller. Use a separate installation/data volume for a different system.');
 const trial={...env,CONTROLLER_TYPE:'trimlight',TRIMLIGHT_CLIENT_ID:clientId,TRIMLIGHT_CLIENT_SECRET:clientSecret,TRIMLIGHT_DEVICE_ID:deviceId};let response;try{response=await trim(trial,'get')}catch{throw new Error('Connection test failed. Check the credentials, controller ID, and network connection.');}
 const device=response.payload;if(!device||!Array.isArray(device.effects)||!Array.isArray(device.calendar))throw new Error('The controller did not return a valid configuration.');
 if(b.action==='test')return json({ok:true,online:device.connectivity===1,message:device.connectivity===1?'Credentials accepted; controller online.':'Credentials accepted; controller currently offline.'});
 state.connectionDeviceId=deviceId;if(env.CONTROLLER_TYPE==='wled'){state.controllerSnapshots={...state.controllerSnapshots,wled:state.device};state.device=device;state.runtime={};state.settings.schedulerEnabled=false;state.settings.rollingEnabled=false;}
 if(!state.patterns.length&&!state.rules.length){state.device=device;state.patterns=device.effects.map(e=>({id:'device-'+e.id,name:e.name,effect:e,protected:false,source:'Controller import',updatedAt:new Date().toISOString(),tags:[]}));const max=Math.max(1,...(device.ports||[]).map(p=>p.end));state.settings.maxAddress=Math.min(2048,max);state.snapshotAt=new Date().toISOString();state.snapshotSource='Connection setup readback';}
 await writeState(env,state,revision);await store.write({...store.read(),controllerType:'trimlight',clientId,clientSecret,deviceId});Object.assign(env,trial);return json({...status(),connected:true,message:'Credentials saved securely on this server.'});
 });}catch(e){return json({error:e.message},e.status||400)}
}

export async function discoverControllers(body,env){
 const clientId=typeof body.clientId==='string'?body.clientId.trim():'';
 const secret=body.clientSecret||(clientId===env.TRIMLIGHT_CLIENT_ID?env.TRIMLIGHT_CLIENT_SECRET:'');
 if(!clientId||!secret||[clientId,secret].some(v=>typeof v!=='string'||v.length>256||/[\r\n]/.test(v)))throw new Error('Enter a valid client ID and client secret before finding controllers.');
 try{
  const timestamp=String(Date.now()),encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`Trimlight|${clientId}|${timestamp}`)));
  const response=await (env.FETCH||fetch)('https://trimlight.ledhue.com/trimlight/v1/oauth/resources/devices?page=0',{method:'GET',headers:{'Authorization':btoa(String.fromCharCode(...bytes)),'S-ClientId':clientId,'S-Timestamp':timestamp},signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error();const result=await response.json();
  if(result.code!==0||!Array.isArray(result.payload?.data))throw new Error();
  const devices=result.payload.data;
  if(devices.some(d=>!d||typeof d.deviceId!=='string'||!d.deviceId||d.deviceId.length>256||/[\r\n]/.test(d.deviceId)))throw new Error();
  return devices.map(d=>({deviceId:d.deviceId,name:typeof d.name==='string'?d.name.slice(0,200):'Unnamed controller',online:d.connectivity===1}));
 }catch{throw new Error('Could not retrieve controllers. Check your API credentials and network connection, then try again.');}
}
