import {lease,readState,writeState,addEvent} from './service.mjs';
import {expand,selectionColors,dayPlan,dateKey,plusDay} from './domain.mjs';
export const isWled=env=>env.CONTROLLER_TYPE==='wled';
export function wledUrl(value){
 let u;try{u=new URL(String(value))}catch{throw new Error('Enter a WLED URL such as http://192.168.1.50');}
 // A household administrator may connect only to a literal private IPv4 address.
 const p=u.hostname.split('.').map(Number),privateIP=p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168));
 if(!privateIP||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Use a private LAN IPv4 address with http:// or https:// and no path, credentials, or query. Reserve this address in your router.');
 return u.origin;
}
export async function wledRequest(env,path,body){
 if(!env.LOCAL_RUNNER)throw new Error('WLED requires the home-server container on your local network.');
 const url=wledUrl(env.WLED_URL);
 const r=await(env.FETCH||fetch)(url+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error(`WLED returned HTTP ${r.status}. No write retry was made.`);
 const d=await r.json();if(d.error)throw new Error(`WLED rejected the request (${d.error}).`);return d;
}
export async function readWled(env){
 const d=await wledRequest(env,'/json');
 if(!d.info?.ver||!Number.isInteger(d.info?.leds?.count)||d.info.leds.count<1||!Array.isArray(d.state?.seg)||typeof d.state.on!=='boolean')throw new Error('The address did not return a valid WLED device.');
 return d;
}
export async function wledPresets(env){
 const d=await wledRequest(env,'/presets.json');
 return Object.entries(d).filter(([id,v])=>/^\d+$/.test(id)&&+id>=1&&+id<=250&&v&&typeof v==='object').map(([id,v])=>({id:+id,name:String(v.n||`Preset ${id}`).slice(0,80)}));
}
export function wledSnapshot(d){return {effects:[],calendar:[],daily:[],ports:[{id:0,start:1,end:d.info.leds.count}],connectivity:1,switchState:d.state.on?1:0,wled:{name:d.info.name,version:d.info.ver,count:d.info.leds.count,segments:d.state.seg,preset:d.state.ps}};}
export async function wledSync(env){return lease(env,async()=>{const {state,revision}=await readState(env);state.device=wledSnapshot(await readWled(env));state.snapshotAt=new Date().toISOString();state.snapshotSource='WLED local readback';return {state,revision:await writeState(env,state,revision)}})}
export function checkWledPattern(p){if(p.wledOnly&&p.wledPreset===undefined)throw new Error(`${p.name}: choose a WLED preset before playback.`);if(p.wledPreset!==undefined){if(!Number.isInteger(p.wledPreset)||p.wledPreset<1||p.wledPreset>250)throw new Error('Choose a WLED preset from 1 through 250.');}else if(p.effect.category!==1||p.effect.mode!==0)throw new Error(`${p.name}: assign a WLED preset in the Looks library. Trimlight animations cannot be translated automatically.`);}
export async function sendColors(env,colors,brightness){
 const d=await readWled(env),count=d.info.leds.count;
 if(colors.length!==count||count>2048)throw new Error(`Set the logical address count to WLED’s ${count} LEDs (Home Studio supports up to 2048).`);
 // Explicitly replace runtime segment geometry, never hardware outputs or stored presets.
 await wledRequest(env,'/json/state',{on:true,bri:brightness,transition:0,mainseg:0,seg:[{id:0,start:0,stop:count,grp:1,spc:0,of:0,rev:false,mi:false,on:true,bri:255,fx:0,pal:0,frz:false,col:[[0,0,0]]},...d.state.seg.filter(s=>s.id!==0).map(s=>({id:s.id,stop:0}))]});
 for(let i=0;i<count;i+=256)await wledRequest(env,'/json/state',{seg:{id:0,i:[i,...colors.slice(i,i+256).map(c=>c.toString(16).padStart(6,'0'))]}});
}
export async function playWled(env,state,p){
 checkWledPattern(p);
 if(p.wledPreset!==undefined){const presets=await wledPresets(env);if(!presets.some(x=>x.id===p.wledPreset))throw new Error(`${p.name}: WLED preset ${p.wledPreset} is missing. Refresh presets and select a replacement.`);await wledRequest(env,'/json/state',{ps:p.wledPreset});}
 else await sendColors(env,expand(p.effect,state.settings.maxAddress),p.effect.brightness);
}
export async function wledAction(env,b){return lease(env,async()=>{const {state,revision}=await readState(env);
 if(b.action==='pattern'){const p=state.patterns.find(x=>x.id===b.patternId);if(!p)throw new Error('Look not found.');await playWled(env,state,p);state.runtime={...state.runtime,preview:true,holdUntil:Date.now()+120000,lastApplied:null};}
 else if(b.action==='finder'){await sendColors(env,selectionColors(state.settings.maxAddress,b.start,b.end,b.step,b.color),80);state.runtime={...state.runtime,preview:true,holdUntil:Date.now()+120000,lastApplied:null};}
 else if(b.action==='off'||b.action==='resume'){await wledRequest(env,'/json/state',{on:false});state.runtime={...state.runtime,preview:false,holdUntil:b.action==='off'?Date.now()+300000:0,lastApplied:null};}
 else throw new Error('Unknown controller action.');
 addEvent(state,'WLED '+b.action+' requested');return {state,revision:await writeState(env,state,revision),message:'WLED request accepted. Preview ends after two minutes; Resume releases the preview to the home-server scheduler.'};});}
export async function wledScheduler(env,enabled){return lease(env,async()=>{const {state,revision}=await readState(env);
 if(enabled){const presets=await wledPresets(env);for(const r of state.rules.filter(r=>r.enabled)){const p=state.patterns.find(p=>p.id===r.patternId);if(!p)throw new Error('A scheduled look is missing.');checkWledPattern(p);if(p.wledPreset!==undefined&&!presets.some(x=>x.id===p.wledPreset))throw new Error(`${p.name}: preset ${p.wledPreset} is missing from WLED.`);}}
 await wledRequest(env,'/json/state',{on:false});state.settings.schedulerEnabled=!!enabled;state.settings.rollingEnabled=false;state.runtime={};return {state,revision:await writeState(env,state,revision)};});}
export async function wledTick(env,now){return lease(env,async()=>{const {state,revision}=await readState(env);if(state.runtime.holdUntil>+now)return;
 if(!state.settings.schedulerEnabled){if(state.runtime.preview){await wledRequest(env,'/json/state',{on:false});state.runtime={};await writeState(env,state,revision)}return;}
 const today=dateKey(now,state.settings.timezone),p=[dayPlan(state,plusDay(today,-1)),dayPlan(state,today)].find(p=>p.start&&+new Date(p.start)<=+now&&+now<+new Date(p.end));
 const look=p&&!p.conflict&&state.patterns.find(x=>x.id===p.rule.patternId),key=look?`${p.date}:${p.rule.id}:${JSON.stringify(look)}`:`off:${today}`;
 if(state.runtime.lastApplied===key)return;
 try{if(p?.conflict)throw new Error('Equal-priority calendar rules conflict.');if(look)await playWled(env,state,look);else await wledRequest(env,'/json/state',{on:false});state.runtime={lastApplied:key,lastTick:now.toISOString()};}
 catch(e){state.settings.schedulerEnabled=false;state.runtime={lastError:e.message};addEvent(state,'WLED scheduler paused: '+e.message,'error');}
 await writeState(env,state,revision);
 });}
