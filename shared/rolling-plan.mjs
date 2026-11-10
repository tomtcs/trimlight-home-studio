import {dayPlan,dateKey,plusDay,zonedParts,effectPayload} from './domain.mjs';
export const effectSignature=e=>JSON.stringify(effectPayload(e));
export const signature=e=>JSON.stringify({name:e.name,...effectPayload(e)});
export const calendarSignature=c=>JSON.stringify({effectId:c.effectId,startDate:c.startDate,endDate:c.endDate,startTime:c.startTime,endTime:c.endTime});
export function windowFor(now,tz){const today=dateKey(now,tz),[y,m]=today.split('-').map(Number);return {month:today.slice(0,7),start:today.slice(0,8)+'01',end:new Date(Date.UTC(y,m+1,0,12)).toISOString().slice(0,10)};}
export function rollingPlan(state,now=new Date(),device=state.device){
 const window=windowFor(now,state.settings.timezone),rows=[];
 for(let key=window.start;key<=window.end;key=plusDay(key,1)){
  const p=dayPlan(state,key);if(p.conflict)throw new Error(`Conflicting highest-priority rules on ${key}.`);if(!p.rule)throw new Error(`No lighting rule covers ${key}. Add a rule before syncing.`);if(!p.start||!p.end)throw new Error(`No usable lighting time for ${key}.`);
  const local=zonedParts(new Date(p.start),state.settings.timezone),off=zonedParts(new Date(p.end),state.settings.timezone);
  if(dateKey(new Date(p.start),state.settings.timezone)!==key||dateKey(new Date(p.end),state.settings.timezone)!==key)throw new Error(`Controller sync requires same-day on/off times (${key}). Use an end time before midnight.`);
  const minute=p.rule.kind==='sunset'?Math.round((+local.hour*60+ +local.minute+ +local.second/60)/5)*5:+local.hour*60+ +local.minute;
  if(minute>=+off.hour*60+ +off.minute)throw new Error(`Start must precede shutoff on ${key}.`);
  const row={start:key,end:key,patternId:p.rule.patternId,startTime:{hours:Math.floor(minute/60),minutes:minute%60},endTime:{hours:+off.hour,minutes:+off.minute}};
  const last=rows.at(-1);if(last&&last.patternId===row.patternId&&JSON.stringify(last.startTime)===JSON.stringify(row.startTime)&&JSON.stringify(last.endTime)===JSON.stringify(row.endTime))last.end=key;else rows.push(row);
 }
 if(rows.length>60)throw new Error(`This window needs ${rows.length} calendar slots; only 60 are available. Combine designs or use fixed start times. Nothing was changed.`);
 const wanted=[...new Set([...rows.map(r=>r.patternId),...state.patterns.filter(p=>p.protected).map(p=>p.id)])].map(id=>{const p=state.patterns.find(p=>p.id===id);if(!p)throw new Error('Missing library pattern');effectPayload(p.effect);return p});
 const keep=new Set(device.effects.filter(e=>(e.category===1&&(e.mode>16||e.pixels.some(p=>p.count>60)))||state.patterns.some(p=>p.protected&&effectSignature(p.effect)===effectSignature(e))).map(e=>e.id));
 // Keep all references, even disabled daily timers, so no dangling controller links are introduced.
 for(const d of device.daily||[])if(d.effectId!==200)keep.add(d.effectId);
 for(const id of device.combinedEffect?.effectIds||[])keep.add(id);for(const x of device.overlayEffects||[])if(x.targetEffect!==200)keep.add(x.targetEffect);
 const mapping={},missing=[];
 for(const p of wanted){const e=device.effects.find(e=>effectSignature(e)===effectSignature(p.effect));if(e){mapping[p.id]=e.id;keep.add(e.id)}else {if(p.effect.category===1&&(p.effect.mode>16||p.effect.pixels.some(x=>x.count>60)))throw new Error(`${p.name} uses a legacy mode or run length that cannot be safely re-saved through the API. Keep its original on the controller or make an API-compatible copy.`);missing.push(p);}}
 const retained=device.effects.filter(e=>keep.has(e.id));if(retained.length+missing.length>60)throw new Error('Required and protected patterns exceed the 60 controller slots. Nothing was changed.');
 return {window,rows,wanted: wanted.map(p=>p.id),mapping,missing,removeEffects:device.effects.filter(e=>!keep.has(e.id)),calendarSlots:rows.length,patternSlots:retained.length+missing.length,roundMinutes:5};
}
export function calendarPayload(row,effectId,id){const md=k=>({month:+k.slice(5,7),day:+k.slice(8,10)});return {id,effectId,startDate:md(row.start),endDate:md(row.end),startTime:row.startTime,endTime:row.endTime};}

export function protectionUsage(state){
 const selected=state.patterns.filter(p=>p.protected);
 const keys=new Set(selected.map(p=>effectSignature(p.effect)));
 const onController=state.device.effects.filter(e=>keys.has(effectSignature(e))).length;
 return {selected:selected.length,reserved:keys.size,onController,capacity:60};
}
