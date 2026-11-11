import {uuid} from './id.mjs';
import {dayPlan,plusDay,effectPayload} from './domain.mjs';
export function compatibleEffect(effect,mode){
 if(effect.category!==1)throw new Error('Only custom designs can be repaired here.');
 if(!Number.isInteger(mode)||mode<0||mode>16)throw new Error('Select a supported animation.');
 const pixels=[];for(const p of [...effect.pixels].sort((a,b)=>a.index-b.index)){let count=p.count;while(count>0){const n=Math.min(60,count);pixels.push({index:pixels.length,count:n,color:p.color,disable:!!p.disable});count-=n;}}
 if(pixels.length>30)throw new Error(`This design needs ${pixels.length} color slots after conversion; only 30 fit. Simplify a duplicate in the Looks library, then reassign its calendar dates.`);
 return effectPayload({...effect,mode,pixels});
}
export function legacyIssue(state,pattern,window){
 const dates=[];for(let key=window.start;key<=window.end;key=plusDay(key,1))if(dayPlan(state,key).rule?.patternId===pattern.id)dates.push(key);
 return {code:'legacy_effect',patternId:pattern.id,name:pattern.name,window,dates,rules:state.rules.filter(r=>r.patternId===pattern.id).map(r=>({id:r.id,name:r.name,startDate:r.startDate,endDate:r.endDate,year:r.year})),requiresAnimation:pattern.effect.mode>16,protected:!!pattern.protected};
}
export function repairState(state,id,mode,unlock){
 if(state.patterns.length>=5000)throw new Error('The library is full. Remove an unused design before making a copy.');
 const original=state.patterns.find(p=>p.id===id);if(!original)throw new Error('Design no longer exists. Recheck sync.');
 if(original.protected&&!unlock)throw new Error('Confirm transferring protection to the compatible copy.');
 const copy={...structuredClone(original),id:uuid(),name:original.name.slice(0,69)+' - API copy',effect:compatibleEffect(original.effect,mode),source:'Compatible copy',updatedAt:new Date().toISOString()};
 return {...state,patterns:[...state.patterns.map(p=>p.id===id&&unlock?{...p,protected:false}:p),copy],rules:state.rules.map(r=>r.patternId===id?{...r,patternId:copy.id}:r)};
}
