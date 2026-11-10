import seed from './seed.mjs';
import {HOUSE_SIDES,validateHouseViews} from './house-map.mjs';
import {upgradeCatalog} from './catalog-upgrade.mjs';
import SunCalc from 'suncalc';
const INITIAL_PROTECTED_NAMES=[];
export const uuid=()=>crypto.randomUUID();
export function initialState(){
 const state={version:1,device:seed,snapshotAt:null,snapshotSource:'New household',patterns:seed.effects.map(e=>({id:'device-'+e.id,name:e.name,protected:INITIAL_PROTECTED_NAMES.includes(e.name.toLowerCase()),effect:e,source:'Controller import',updatedAt:new Date().toISOString(),tags:[]})),landmarks:[],zones:[],photo:null,
 settings:{lat:0,lon:0,location:'Set your location',timezone:'UTC',maxAddress:300,maxRun:60,schedulerEnabled:false},
 rules:seed.calendar.map(e=>({id:'rule-'+e.id,name:seed.effects.find(x=>x.id===e.effectId)?.name||'Imported schedule',patternId:'device-'+e.effectId,startDate:`${String(e.startDate.month).padStart(2,'0')}-${String(e.startDate.day).padStart(2,'0')}`,endDate:`${String(e.endDate.month).padStart(2,'0')}-${String(e.endDate.day).padStart(2,'0')}`,year:null,kind:'sunset',offset:-15,fixedStart:`${String(e.startTime.hours).padStart(2,'0')}:${String(e.startTime.minutes).padStart(2,'0')}`,end:`${String(e.endTime.hours).padStart(2,'0')}:${String(e.endTime.minutes).padStart(2,'0')}`,priority:10,enabled:true})),events:[],runtime:{}};upgradeCatalog(state);return state;
}
export function requireInt(n,min,max,label='Value'){if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be an integer from ${min} to ${max}.`);return n}
export function compress(colors,maxRun=60){
 requireInt(maxRun,1,90,'Run length');const runs=[];
 for(const c of colors){requireInt(c,0,0xffffff,'Color');const last=runs.at(-1);if(last&&last.color===c&&last.count<maxRun)last.count++;else runs.push({index:runs.length,count:1,color:c,disable:false});}return runs;
}
export function compile(colors,{maxRun=60,mode=0,brightness=100,speed=35}={}){
 if(!Array.isArray(colors)||!colors.length||colors.length>2048)throw new Error('Choose between 1 and 2,048 addresses.');
 const pixels=compress(colors,maxRun);if(pixels.length>30)throw new Error(`This design needs ${pixels.length} sequence slots; this controller supports 30. Reduce the color changes or selected groups.`);
 requireInt(mode,0,16,'Animation');requireInt(brightness,0,255,'Brightness');requireInt(speed,0,255,'Speed');
 while(pixels.length<30)pixels.push({index:pixels.length,count:0,color:0,disable:false});return {category:1,mode,speed,brightness,pixels};
}
export function selectionColors(max,start,end,step,color=0xffffff){
 requireInt(max,1,2048,'Address count');requireInt(start,1,max,'Start');requireInt(end,start,max,'End');requireInt(step,1,max,'Increment');requireInt(color,0,0xffffff,'Color');
 const a=Array(max).fill(0);for(let i=start;i<=end;i+=step)a[i-1]=color;return a;
}
export function expand(effect,length){
 if(effect.category!==1)return Array(length).fill(0);const cycle=(effect.pixels||[]).flatMap(p=>Array(p.count).fill(p.disable?0:p.color));
 if(!cycle.length)return Array(length).fill(0);return Array.from({length},(_,i)=>cycle[i%cycle.length]);
}
export function effectPayload(e){
 const {category,mode,brightness,speed}=e;requireInt(category,0,1,'Pattern type');requireInt(mode,0,category===0?179:20,'Mode');requireInt(brightness,0,255,'Brightness');requireInt(speed,0,255,'Speed');
 if(category===0)return {category,mode,brightness,speed,pixelLen:requireInt(e.pixelLen,1,90,'Pixel length'),reverse:!!e.reverse};
 if(!Array.isArray(e.pixels)||e.pixels.length>30)throw new Error('At most 30 color runs are supported.');
 const seen=new Set();const pixels=e.pixels.map(p=>{requireInt(p.index,0,29,'Run index');if(seen.has(p.index))throw new Error('Duplicate run index.');seen.add(p.index);return {index:p.index,count:requireInt(p.count,0,90,'Run count'),color:requireInt(p.color,0,0xffffff,'Color'),disable:!!p.disable}});
 if(!pixels.some(p=>p.count>0))throw new Error('A custom pattern must contain at least one bulb.');
 for(let i=0;i<30;i++)if(!seen.has(i))pixels.push({index:i,count:0,color:0,disable:false});pixels.sort((a,b)=>a.index-b.index);return {category,mode,brightness,speed,pixels};
}
export function zonedParts(date,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
export function dateKey(d,tz){const p=zonedParts(d,tz);return `${p.year}-${p.month}-${p.day}`;}
export function localInstant(key,hhmm,tz){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm))throw new Error('Invalid date or time.');
 const [y,m,d]=key.split('-').map(Number),[h,min]=hhmm.split(':').map(Number);const target=Date.UTC(y,m-1,d,h,min);let guess=target;
 for(let i=0;i<4;i++){const p=zonedParts(new Date(guess),tz);const represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const delta=target-represented;guess+=delta;if(!delta)break;}
 const p=zonedParts(new Date(guess),tz);if(`${p.year}-${p.month}-${p.day}`!==key||`${p.hour}:${p.minute}`!==hhmm)throw new Error('This time does not exist because of a clock change.');return new Date(guess);
}
export function plusDay(key,n){return new Date(Date.parse(key+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function matches(rule,key){if(rule.recurrence){const {month,weekday,ordinal}=rule.recurrence;const d=new Date(key+'T12:00:00Z');if(d.getUTCMonth()+1!==month||d.getUTCDay()!==weekday)return false;if(ordinal===-1){if(new Date(+d+7*86400000).getUTCMonth()===d.getUTCMonth())return false;}else if(Math.floor((d.getUTCDate()-1)/7)+1!==ordinal)return false;}if(!rule.enabled||rule.year&&Number(key.slice(0,4))!==Number(rule.year))return false;const d=key.slice(5);return rule.startDate<=rule.endDate?d>=rule.startDate&&d<=rule.endDate:d>=rule.startDate||d<=rule.endDate;}
export function dayPlan(state,key){
 const s=state.settings;const times=SunCalc.getTimes(localInstant(key,'12:00',s.timezone),s.lat,s.lon);const sunset=times.sunset&&Number.isFinite(+times.sunset)?new Date(times.sunset):null;
 const candidates=state.rules.filter(r=>matches(r,key)).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));const rule=candidates[0];if(!rule)return {date:key,sunset:sunset?.toISOString()||null,rule:null,conflict:false};
 const start=rule.kind==='sunset'?(sunset?new Date(+sunset+rule.offset*60000):null):localInstant(key,rule.fixedStart,s.timezone);
 if(!start)return {date:key,sunset:null,rule,unavailable:'The sun does not set at this location on this date.',conflict:false};
 let end=localInstant(key,rule.end,s.timezone);if(end<=start)end=localInstant(plusDay(key,1),rule.end,s.timezone);
 return {date:key,sunset:sunset?.toISOString()||null,start:start.toISOString(),end:end.toISOString(),rule,pattern:state.patterns.find(p=>p.id===rule.patternId)?.name||'Missing pattern',conflict:candidates.length>1&&candidates[1].priority===rule.priority,candidates:candidates.map(r=>r.name)};
}
export function validateState(next,previous){
 if(!next||next.version!==1)throw new Error('Unsupported backup format.');
 for(const field of ['patterns','landmarks','zones','rules'])if(!Array.isArray(next[field]))throw new Error(`Missing ${field}.`);
 if(next.patterns.length>5000||next.rules.length>1000||next.landmarks.length>2048||next.zones.length>500)throw new Error('Workspace is too large.');
 for(const old of previous.patterns.filter(p=>p.protected)){const p=next.patterns.find(p=>p.id===old.id);if(!p||JSON.stringify({...p,protected:old.protected})!==JSON.stringify(old))throw new Error(`${old.name} is protected. Unlock it before editing or deleting.`);}
 const s=next.settings;if(!s||!Number.isFinite(s.lat)||Math.abs(s.lat)>90||!Number.isFinite(s.lon)||Math.abs(s.lon)>180)throw new Error('Enter valid latitude and longitude.');
 new Intl.DateTimeFormat('en',{timeZone:s.timezone});requireInt(s.maxAddress,1,2048,'Address count');requireInt(s.maxRun,1,90,'Maximum run');
 const ids=new Set();for(const p of next.patterns){if(typeof p.protected!=='boolean')throw new Error('Protection must be on or off.');if(!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)throw new Error('Patterns need unique IDs and names up to 80 characters.');ids.add(p.id);effectPayload(p.effect);}
 for(const l of next.landmarks){if(l.view!=null&&!HOUSE_SIDES.some(([id])=>id===l.view))throw new Error('Invalid landmark side.');requireInt(l.address,1,s.maxAddress,'Landmark address');if(typeof l.name!=='string'||!l.name.trim()||l.name.length>80)throw new Error('Name each landmark.');if(l.x!=null&&(!Number.isFinite(l.x)||l.x<0||l.x>100||!Number.isFinite(l.y)||l.y<0||l.y>100))throw new Error('Invalid map position.');}
 for(const z of next.zones){requireInt(z.start,1,s.maxAddress,'Zone start');requireInt(z.end,z.start,s.maxAddress,'Zone end');requireInt(z.color,0,0xffffff,'Zone color');if(typeof z.name!=='string'||!z.name.trim())throw new Error('Name each zone.');}
 const validMD=v=>/^\d\d-\d\d$/.test(v)&&new Date('2000-'+v+'T12:00:00Z').toISOString().slice(5,10)===v;
 for(const r of next.rules){if(r.recurrence){requireInt(r.recurrence.month,1,12,'Holiday month');requireInt(r.recurrence.weekday,0,6,'Holiday weekday');if(![-1,1,2,3,4,5].includes(r.recurrence.ordinal))throw new Error('Invalid holiday occurrence.');}if(!ids.has(r.patternId))throw new Error(`Schedule ${r.name} references a missing pattern.`);if(!validMD(r.startDate)||!validMD(r.endDate))throw new Error('Use valid month-day dates for rules.');if(!['sunset','fixed'].includes(r.kind))throw new Error('Invalid schedule type.');requireInt(r.offset,-180,180,'Sunset offset');requireInt(r.priority,0,1000,'Priority');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.fixedStart))throw new Error('Use 24-hour times.');if(r.year!=null)requireInt(r.year,2020,2100,'Year');}
 if(next.photo!=null&&(!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(next.photo)||next.photo.length>650000))throw new Error('Use a JPEG, PNG or WebP photo under 480 KB.');
 const houseViews=next.houseViews===undefined?previous.houseViews:validateHouseViews(next.houseViews);
 return {...previous,houseViews,patterns:next.patterns,landmarks:next.landmarks,zones:next.zones,rules:next.rules,settings:{...s,schedulerEnabled:previous.settings.schedulerEnabled,rollingEnabled:previous.settings.rollingEnabled},photo:next.photo};
}

export function householdState(){const s=initialState();s.patterns=[];s.rules=[];s.landmarks=[];s.zones=[];s.photo=null;s.device={effects:[],calendar:[],daily:[],ports:[],connectivity:0,switchState:2};s.settings={...s.settings,lat:0,lon:0,timezone:'UTC',location:'Set your location',maxAddress:300,schedulerEnabled:false,rollingEnabled:false};s.snapshotAt=null;s.snapshotSource='Not connected';s.events=[];s.runtime={};return s;}
