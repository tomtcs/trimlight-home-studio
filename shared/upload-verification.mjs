import {signature,calendarSignature} from './rolling-plan.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function fingerprint(d){return JSON.stringify(canonical({effects:[...d.effects].sort((a,b)=>a.id-b.id).map(e=>[e.id,signature(e)]),calendar:[...d.calendar].sort((a,b)=>a.id-b.id).map(c=>[c.id,calendarSignature(c)]),daily:d.daily,combinedEffect:d.combinedEffect,overlayEffects:d.overlayEffects,ports:d.ports,colorOrder:d.colorOrder,ic:d.ic}));}
export function expectedAfter(device,path,payload,id){
 const next=structuredClone(device);
 if(path==='effect/save'){if(!Number.isInteger(id)||device.effects.some(e=>e.id===id))throw new Error('New design ID missing or already occupied. Upload stopped.');next.effects.push({...payload,id});}
 else if(path==='effect/delete')next.effects=next.effects.filter(e=>e.id!==payload.id);
 else if(path==='calendar/delete')next.calendar=next.calendar.filter(c=>c.id!==payload.id);
 else if(path==='calendar/save'){const key=Number.isInteger(id)?id:payload.id;if(device.calendar.some(c=>c.id===key))throw new Error('Calendar response ID is already occupied. Upload stopped.');next.calendar.push({...payload,id:key});}
 else if(path==='update')next.switchState=payload.switchState;
 else throw new Error('Unsupported upload operation');
 return next;
}
export function controllerName(name){return String(name).replace(/\u00c2(?=\u00b7)/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u00b7\u2013\u2014]/g,'-').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'').trim()||'Studio design';}
export function matchesExpected(current,pending){
 const expected=structuredClone(pending.expected);
 // A newly saved name is display metadata. Keep strict comparisons for all
 // effect parameters, IDs, existing names, and every other configuration field.
 if(pending.path==='effect/save'){
  const saved=current.effects.find(e=>e.id===pending.responseId);
  const target=expected.effects.find(e=>e.id===pending.responseId);
  if(!saved||!target)return false;
  target.name=saved.name;
 }
 return fingerprint(current)===fingerprint(expected)&&(pending.path!=='update'||current.switchState===expected.switchState);
}
