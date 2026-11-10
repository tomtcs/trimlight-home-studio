// Browser-only visual approximations; never used to construct controller commands.
// Mode 19 is inferred from the owner's native-app animation ordering, not an API
// authoring capability. Keep this estimate isolated from controller serialization.
export function previewInfo(effect){
 const estimated=effect?.category===1&&effect.mode===19;
 const supported=effect?.category===1&&Number.isInteger(effect.mode)&&((effect.mode>=0&&effect.mode<=16)||estimated);
 return {supported,estimated,animated:supported&&![0,15].includes(effect.mode)};
}
export function previewColors(effect, count, seconds=0) {
 if(!previewInfo(effect).supported)return null;
 const cycle=[...(effect.pixels||[])].sort((a,b)=>a.index-b.index).flatMap(p=>Array(Math.max(0,p.count)).fill(p.disable?0:p.color));
 if(!cycle.length)return Array(count).fill(0);
 const mode=effect.mode, phase=seconds*(.4+(effect.speed||0)/255*4), shift=Math.floor(phase*4);
 const scale=(color,v)=>{const f=Math.max(0,Math.min(1,v))*(effect.brightness??255)/255;return (Math.round((color>>16&255)*f)<<16)|(Math.round((color>>8&255)*f)<<8)|Math.round((color&255)*f)};
 return Array.from({length:count},(_,i)=>{
  let position=i;
  if([1,7,11].includes(mode))position=i-shift;
  if([2,8,12].includes(mode))position=i+shift;
  if([3,9,13].includes(mode))position=Math.floor(Math.abs(i-(count-1)/2))-shift;
  if([4,10,14].includes(mode))position=Math.floor(Math.abs(i-(count-1)/2))+shift;
  let c=cycle[((position%cycle.length)+cycle.length)%cycle.length],v=1;
  if(mode===5)v=.15+.85*Math.pow((1+Math.sin(phase*2+i*2.399))/2,4);
  if(mode===6)v=.12+.88*(1+Math.sin(phase*2))/2;
  if(mode>=7&&mode<=10)v=.15+.85*(1-((position%12+12)%12)/12);
  if(mode>=11&&mode<=14)v=.2+.8*(1+Math.sin(position*.45-phase))/2;
  // Strobe stays still in the gallery; deliberate preview should not flash unexpectedly.
  if(mode===16){c=cycle[Math.floor(phase)%cycle.length];v=.15+.85*(1+Math.sin(phase*Math.PI*2))/2}
  if(mode===19){
   // Repeating expanding bursts, smoothly fading rather than flashing.
   const beat=phase*.55, burst=Math.floor(beat), age=beat-burst;
   const center=(burst*37+Math.floor(count*.3))%count;
   const distance=Math.abs(i-center), radius=age*count*.55;
   v=Math.max(0,1-Math.abs(distance-radius)/Math.max(2,count*.06))*(1-age);
   c=cycle[(i+burst)%cycle.length];
  }
  return scale(c,v);
 });
}
export function roofPoints(lines, count=100){
 const segments=lines.flatMap(l=>l.points.slice(1).map((b,i)=>({a:l.points[i],b,len:Math.hypot(b[0]-l.points[i][0],b[1]-l.points[i][1])}))).filter(s=>s.len>0);
 const total=segments.reduce((n,s)=>n+s.len,0);
 if(!total)return [];
 return Array.from({length:count},(_,i)=>{let d=i/Math.max(1,count-1)*total;for(const s of segments){if(d<=s.len)return [s.a[0]+(s.b[0]-s.a[0])*d/s.len,s.a[1]+(s.b[1]-s.a[1])*d/s.len];d-=s.len}return segments.at(-1).b});
}
