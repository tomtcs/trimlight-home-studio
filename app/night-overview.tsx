'use client';
import {useEffect,useState} from 'react';
import LookPreview from './look-preview';
// @ts-ignore shared planner
import {dateKey,dayPlan,plusDay} from '../shared/domain.mjs';
export default function NightOverview({state,edit,side}:any){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[]);
 const tz=state.settings.timezone,today=dateKey(now,tz);
 const nights=Array.from({length:21},(_,i)=>{const key=plusDay(today,i);try{return dayPlan(state,key)}catch(e:any){return {date:key,unavailable:e.message}}});
 const tonight=nights[0],pattern=state.patterns.find((p:any)=>p.id===tonight.rule?.patternId);
 const time=(value:string)=>value?new Date(value).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'}):'—';
 return <section className="night-overview"><div className="tonight panel"><LookPreview state={state} effect={pattern?.effect} side={side}/><div className="tonight-copy"><span className="eyebrow">TONIGHT · {tz}</span><h2>{tonight.conflict?'Resolve overlapping rules':tonight.pattern||'No planned display'}</h2><p className="muted">App plan · {state.settings.schedulerEnabled?'home-server runner enabled':state.settings.rollingEnabled?'monthly controller sync enabled':'automatic scheduling paused'}</p>{tonight.unavailable?<p className="error">{tonight.unavailable}</p>:<ol className="night-timeline"><li><strong>{time(tonight.sunset)}</strong><span>Sunset</span></li><li><strong>{time(tonight.start)}</strong><span>Lights on{tonight.rule?' · '+tonight.rule.name:''}</span></li><li><strong>{time(tonight.end)}</strong><span>Lights off{tonight.end&&dateKey(new Date(tonight.end),tz)!==today?' · next day':''}</span></li></ol>}{tonight.conflict&&<p className="error">Equal-priority rules overlap. Automatic execution is blocked.</p>}{tonight.rule&&<button className="outline" onClick={()=>edit(structuredClone(tonight.rule))}>Edit tonight’s rule</button>}<p className="small muted">Planned times, not a live controller status. Controller sync may round sunset starts.</p></div></div></section>;
}
