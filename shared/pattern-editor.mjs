import {compress,expand,effectPayload} from './domain.mjs';
export function sequenceCanvas(effect){
 if(effect.category!==1)return [];
 const ordered={...effect,pixels:[...effect.pixels].sort((a,b)=>a.index-b.index)};
 return expand(ordered,ordered.pixels.reduce((n,p)=>n+p.count,0));
}
export function unchangedSequence(effect,canvas){const original=sequenceCanvas(effect);return original.length===canvas.length&&original.every((c,i)=>c===canvas[i]);}
export function editorSlots(effect,canvas,wholeHouse,maxRun=60){
 if(!wholeHouse&&unchangedSequence(effect,canvas))return effect.category===0?0:effect.pixels.filter(p=>p.count>0).length;
 return compress(canvas,wholeHouse?maxRun:90).length;
}
export function saveEditorEffect(effect,canvas,wholeHouse,maxRun=60){
 if(!wholeHouse&&unchangedSequence(effect,canvas))return effectPayload(effect);
 if(!canvas.length)throw new Error('Choose at least one bulb.');
 return effectPayload({...effect,category:1,pixels:compress(canvas,wholeHouse?maxRun:90)});
}
