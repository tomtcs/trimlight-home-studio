// Browser-local outline suggestion. Pure image-data input keeps photos on-device.
export function simplify(points,tolerance=1.5){
 if(points.length<3)return points;
 const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;let max=0,index=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0,d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>max){max=d;index=i}}
 return max>tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b];
}
export function detectRoofline({data,width:w,height:h},{top=8,bottom=78}={}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<20||h<20||w>640||h>640||data.length!==w*h*4)throw new Error('Unsupported detection image.');
 if(!Number.isFinite(top)||!Number.isFinite(bottom)||top<0||bottom>100||bottom-top<10)throw new Error('Choose a search band at least 10% tall.');
 const y0=Math.max(2,Math.round(h*top/100)),y1=Math.min(h-3,Math.round(h*bottom/100)),n=y1-y0+1;
 const gray=new Float32Array(w*h);for(let i=0;i<gray.length;i++)gray[i]=.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2];
 const edge=new Float32Array(w*n);let peak=0;
 for(let x=2;x<w-2;x++)for(let y=y0;y<=y1;y++){
 let above=0,below=0;for(let k=-1;k<=1;k++){above+=gray[(y-2)*w+x+k]+gray[(y-1)*w+x+k];below+=gray[(y+1)*w+x+k]+gray[(y+2)*w+x+k]}
 const strength=Math.abs(below-above)/6;edge[x*n+y-y0]=strength;peak=Math.max(peak,strength);
 }
 if(peak<18)return {points:[],quality:'low',message:'No clear roof boundary found. Try a daylight photo or trace manually.'};
 // Track a coherent left-to-right boundary, penalizing jumps across unrelated edges.
 let prev=new Float32Array(n);const parents=new Int16Array(w*n);prev.fill(0);
 for(let x=2;x<w-2;x++){const next=new Float32Array(n);for(let j=0;j<n;j++){let best=-Infinity,from=j;for(let d=-3;d<=3;d++){const k=j+d;if(k<0||k>=n)continue;const score=prev[k]-Math.abs(d)*7;if(score>best){best=score;from=k}}
 next[j]=best+edge[x*n+j]-(j/n)*.7;parents[x*n+j]=from;}prev=next;}
 let j=prev.indexOf(Math.max(...prev));const points=[];let support=0;for(let x=w-3;x>=2;x--){if(edge[x*n+j]>Math.max(16,peak*.13))support++;points.push([x,y0+j]);j=parents[x*n+j]}
 points.reverse();const ratio=support/points.length;if(ratio<.30)return {points:[],quality:'low',message:'The outline is too interrupted to suggest reliably. Narrow the search band or trace manually.'};
 let reduced=simplify(points,2);for(let tolerance=3;reduced.length>60;tolerance++)reduced=simplify(points,tolerance);
 return {points:reduced.map(([x,y])=>[x/(w-1)*100,y/(h-1)*100]),quality:ratio>.7?'strong':'review',message:'Suggested outer outline only. Check trees, gutters and peaks; add hidden or interior ridges manually.'};
}
