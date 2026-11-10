'use client';
import {useEffect,useState} from 'react';
import LookPreview from './look-preview';
// @ts-ignore shared planner
import {dateKey,dayPlan,plusDay} from '../shared/domain.mjs';
export default function NightOverview({state,edit,side}:any){
 const [now,setNow]=useState(()=>new Date());
 const [playback,setPlayback]=useState<boolean|null>(null),[reduced,setReduced]=useState(false);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer)},[]);
 const tz=state.settings.timezone,today=dateKey(now,tz);
 const nights=Array.from({length:21},(_,i)=>{const key=plusDay(today,i);try{return dayPlan(state,key)}catch(e:any){return {date:key,unavailable:e.message}}});
 const tonight=nights[0],pattern=state.patterns.find((p:any)=>p.id===tonight.rule?.patternId);
 const effect=pattern?.effect, supported=effect?.category===1&&effect.mode>=0&&effect.mode<=16, animated=supported&&effect.mode!==0&&effect.mode!==15;
 const playing=playback??!reduced;
 const status=tonight.conflict?'Resolve the rule conflict before previewing.':!pattern?'No look scheduled tonight.':!supported?'This controller effect does not yet have a browser simulation.':effect.mode===0?'Static look — these lights are meant to stay steady.':effect.mode===15?'Strobe — shown as a still preview.':playing?'Playing animation simulation':reduced&&playback===null?'Paused by your device’s Reduce Motion setting. Press Play to animate.':'Animation paused';
 const time=(value:string)=>value?new Date(value).toLocaleTimeString('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'}):'—';
 return <section className="night-overview"><div className="tonight panel"><div className="tonight-preview"><LookPreview state={state} effect={tonight.conflict?null:effect} side={side} playing={playing} allowMotion={playback===true}/><div className="tonight-playback"><span role="status">{status}</span>{animated&&!tonight.conflict&&<button className="outline" aria-label={playing?"Pause tonight animation":"Play tonight animation"} onClick={()=>setPlayback(!playing)}>{playing?"Pause animation":"Play animation"}</button>}</div></div><div className="tonight-copy"><span className="eyebrow">TONIGHT · {tz}</span><h2>{tonight.conflict?'Resolve overlapping rules':tonight.pattern||'No planned display'}</h2><p className="muted">App plan · {state.settings.schedulerEnabled?'home-server runner enabled':state.settings.rollingEnabled?'monthly controller sync enabled':'automatic scheduling paused'}</p>{tonight.unavailable?<p className="error">{tonight.unavailable}</p>:<ol className="night-timeline"><li><strong>{time(tonight.sunset)}</strong><span>Sunset</span></li><li><strong>{time(tonight.start)}</strong><span>Lights on{tonight.rule?' · '+tonight.rule.name:''}</span></li><li><strong>{time(tonight.end)}</strong><span>Lights off{tonight.end&&dateKey(new Date(tonight.end),tz)!==today?' · next day':''}</span></li></ol>}{tonight.conflict&&<p className="error">Equal-priority rules overlap. Automatic execution is blocked.</p>}{tonight.rule&&<button className="outline" onClick={()=>edit(structuredClone(tonight.rule))}>Edit tonight’s rule</button>}<p className="small muted">Planned times, not a live controller status. Controller sync may round sunset starts.</p></div></div></section>;
}
