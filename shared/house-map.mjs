export const HOUSE_SIDES=[['front','Front'],['right','Right side'],['rear','Rear'],['left','Left side'],['shed','Shed']];
export function houseViews(state){return Object.fromEntries(HOUSE_SIDES.map(([id])=>[id,state.houseViews?.[id]||{photo:id==='front'?state.photo||null:null,lines:[]}]))}
export function validateHouseViews(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid house views.');
 const views={};let bytes=0;
 for(const [id] of HOUSE_SIDES){const v=input[id]||{photo:null,lines:[]};if(v.photo!=null&&(typeof v.photo!=='string'||!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(v.photo)||v.photo.length>650000))throw new Error('Invalid house photo.');bytes+=(v.photo||'').length;
 if(!Array.isArray(v.lines)||v.lines.length>40)throw new Error('Use at most 40 roofline sections per view.');
 const ids=new Set();for(const l of v.lines){if(typeof l.id!=='string'||ids.has(l.id)||!['edge','ridge'].includes(l.kind)||!Array.isArray(l.points)||l.points.length<2||l.points.length>100)throw new Error('Invalid roofline section.');ids.add(l.id);for(const p of l.points)if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)||x<0||x>100))throw new Error('Roofline points must stay within the photo.');}
 views[id]={photo:v.photo||null,lines:v.lines};
 }if(bytes>1200000)throw new Error('House photos exceed the combined size limit. Upload smaller photos.');return views;
}
export function flatHouseSvg(state){const views=houseViews(state),w=400,h=300;
 const panels=HOUSE_SIDES.map(([id,label],i)=>{const v=views[id];return `<g transform="translate(${i*w},0)"><rect x="8" y="8" width="384" height="284" rx="12" fill="#141a17" stroke="#2d3831"/><text x="24" y="38" fill="#f4f7f5" font-family="sans-serif" font-size="18">${label}</text>${v.lines.length?v.lines.map(l=>`<polyline points="${l.points.map(([x,y])=>`${24+x*3.52},${56+y*1.9}`).join(' ')}" fill="none" stroke="${l.kind==='ridge'?'#c7b2ff':'#62d682'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${l.kind==='ridge'?'stroke-dasharray="7 5"':''}/>`).join(''):'<text x="200" y="150" text-anchor="middle" fill="#98a79d" font-family="sans-serif" font-size="14">No roofline traced yet</text>'}</g>`}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*5} ${h+40}" width="${w*5}" height="${h+40}" role="img" aria-label="Unfolded house and shed rooflines"><rect width="100%" height="100%" fill="#0b0e0d"/>${panels}<text x="24" y="325" fill="#98a79d" font-family="sans-serif" font-size="13">Front → right → rear → left · Shed shown separately · Green: roof edge · Purple dashed: ridge · Traced elevations, not to scale</text></svg>`;
}
