import {matches} from './domain.mjs';
import {uuid} from './id.mjs';
export function calendarAssignment(state,{start,end,patternId,kind,offset,fixedStart,off}){
 const valid=k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&new Date(k+'T12:00Z').toISOString().slice(0,10)===k&&+k.slice(0,4)>=2020&&+k.slice(0,4)<=2100;
 if(!valid(start)||!valid(end)||end<start)throw new Error('Choose a valid end date on or after the start date.');
 const pattern=state.patterns.find(p=>p.id===patternId);if(!pattern)throw new Error('Choose a look from the library.');
 let highest=-1;for(let key=start;key<=end;){for(const r of state.rules)if(matches(r,key))highest=Math.max(highest,r.priority);const d=new Date(key+'T12:00Z');d.setUTCDate(d.getUTCDate()+1);key=d.toISOString().slice(0,10)}
 if(highest>=1000)throw new Error('An existing rule already has maximum priority. Edit that rule before adding an override.');
 const rules=[];for(let year=+start.slice(0,4);year<=+end.slice(0,4);year++)rules.push({id:uuid(),name:pattern.name,patternId,year,startDate:year===+start.slice(0,4)?start.slice(5):'01-01',endDate:year===+end.slice(0,4)?end.slice(5):'12-31',kind,offset,fixedStart,end:off,priority:Math.max(100,highest+1),enabled:true});
 return [...state.rules,...rules];
}
