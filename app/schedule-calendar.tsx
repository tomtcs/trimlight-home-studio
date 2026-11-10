'use client';
// @ts-ignore portable local-HTTP record IDs
import {uuid} from '../shared/id.mjs';
import {useState} from 'react';
import CalendarDayEditor from './calendar-day-editor';
// @ts-ignore portable calendar helpers
import {calendarDays,moveMonth} from '../shared/calendar.mjs';
// @ts-ignore shared planner
import {dateKey,dayPlan} from '../shared/domain.mjs';
export default function ScheduleCalendar({state,edit,save,busy,ready}:any){
 const [open,setOpen]=useState(false);
 const tz=state.settings.timezone,today=dateKey(new Date(),tz);
 const [month,setMonth]=useState(today.slice(0,7)),[selected,setSelected]=useState(today);
 const plan=(key:string)=>{try{return dayPlan(state,key)}catch(e:any){return {date:key,unavailable:e.message}}};
 const current=plan(selected);
 const time=(v:string)=>v?new Date(v).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'}):'—';
 const label=(key:string)=>new Date(key+'T12:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'});
 function navigate(next:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(next))return;setMonth(next);setSelected(next===today.slice(0,7)?today:next+'-01')}
 function add(){edit({id:uuid(),name:'Evening look · '+selected,patternId:state.patterns[0]?.id||'',startDate:selected.slice(5),endDate:selected.slice(5),year:+selected.slice(0,4),kind:'sunset',offset:-15,fixedStart:'17:00',end:'23:00',priority:Math.min(1000,Math.max(100,(current.rule?.priority??0)+1)),enabled:true})}
 return <section className="panel month-calendar"><div className="calendar-heading"><div><span className="eyebrow">YOUR LIGHTING CALENDAR</span><h2>{new Date(month+'-01T12:00Z').toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'})}</h2><p className="small muted">Select a day to plan its look · {tz}</p></div><div className="calendar-nav"><button className="outline" aria-label="Previous month" onClick={()=>navigate(moveMonth(month,-1))}>‹</button><button className="outline" onClick={()=>navigate(today.slice(0,7))}>Today</button><button className="outline" aria-label="Next month" onClick={()=>navigate(moveMonth(month,1))}>›</button><input aria-label="Calendar month" type="month" value={month} onChange={e=>navigate(e.target.value)}/></div></div>
 <div className="calendar-scroll"><div className="calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-days">{calendarDays(month).map((key:string)=>{const p=plan(key),pattern=state.patterns.find((x:any)=>x.id===p.rule?.patternId),colors=(pattern?.effect.pixels||[]).filter((x:any)=>x.count&&!x.disable).slice(0,5);return <button key={key} className={'calendar-day '+(key.slice(0,7)!==month?'outside ':'')+(selected===key?'chosen ':'')+(p.conflict||p.unavailable?'has-conflict':'')} aria-pressed={selected===key} aria-current={key===today?'date':undefined} aria-label={label(key)+': '+(p.conflict?'Priority conflict':p.pattern||'No planned display')} onClick={()=>{setSelected(key);setOpen(true)}} disabled={!ready||busy}><span className="calendar-date">{+key.slice(8)}{key===today&&<small>Today</small>}</span><strong>{p.conflict?'Priority conflict':p.unavailable?'Timing unavailable':p.pattern||'No display'}</strong><span className="calendar-swatches">{colors.map((c:any,i:number)=><i key={i} style={{background:'#'+c.color.toString(16).padStart(6,'0')}}/>)}</span>{p.rule&&<small>{time(p.start)} → {time(p.end)}{p.end&&dateKey(new Date(p.end),tz)!==key?' +1d':''}</small>}{p.candidates?.length>1&&<small>{p.candidates.length} matching rules</small>}</button>})}</div></div>
 {open&&<CalendarDayEditor key={selected} state={state} day={selected} plan={current} save={save} edit={edit} close={()=>setOpen(false)} busy={busy}/>}
 </section>;
}
