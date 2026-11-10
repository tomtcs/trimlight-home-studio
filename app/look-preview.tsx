'use client';
import {useEffect,useRef} from 'react';
// @ts-ignore portable preview functions
import {previewColors,roofPoints} from '../shared/look-preview.mjs';
// @ts-ignore portable mapping
import {houseViews} from '../shared/house-map.mjs';
const illustration=[{points:[[8,75],[8,48],[25,22],[42,48],[42,65],[52,65],[52,38],[70,15],[90,38],[90,75]]}];
export default function LookPreview({state,effect,side='front',playing=true}:any){
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null);
 const v=houseViews(state)[side],mapped=!!v.lines.length,unsupported=!effect||effect.category!==1||effect.mode>16;
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const ctx=el.getContext('2d');if(!ctx)return;
  let frame=0,visible=true,last=0;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const points=roofPoints(mapped?v.lines:illustration,100);
  const draw=(time:number)=>{
   frame=requestAnimationFrame(draw);
   if(!visible||document.hidden||time-last<65)return;last=time;
   const w=el.clientWidth,h=el.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
   if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr)}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const colors=previewColors(effect,points.length,playing&&!media.matches?time/1000:0);
   ctx.lineWidth=1;ctx.strokeStyle='#54675d';
   for(const line of mapped?v.lines:illustration){ctx.beginPath();line.points.forEach(([x,y]:number[],i:number)=>i?ctx.lineTo(x*w/100,y*h/100):ctx.moveTo(x*w/100,y*h/100));ctx.stroke()}
   points.forEach(([x,y]:number[],i:number)=>{const c=colors?.[i]??0;ctx.fillStyle='#'+c.toString(16).padStart(6,'0');ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=c?7:0;ctx.beginPath();ctx.arc(x*w/100,y*h/100,c?2:1.1,0,Math.PI*2);ctx.fill()});ctx.shadowBlur=0;
  };
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting});if(box.current)observer.observe(box.current);
  frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);observer.disconnect()};
 },[effect,v.lines,mapped,playing]);
 return <div className="look-preview" ref={box}>{v.photo&&mapped&&<img src={v.photo} alt="Your selected house elevation"/>}<canvas ref={canvas} aria-label={unsupported?'Animation preview unavailable':'Simulated roofline lighting'}/><span className="preview-caption">{unsupported?'Preview unavailable — original effect retained':effect.mode===15?'Strobe · still preview':mapped?'Simulation · approximate placement':'Illustrative roofline · simulation'}</span></div>;
}
