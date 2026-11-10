export function updateMapItem(state,type,draft){
 const field=type==='zone'?'zones':type==='landmark'?'landmarks':null;
 if(!field)throw new Error('Unknown map item type.');
 const original=state[field].find(x=>x.id===draft.id);
 if(!original)throw new Error('This item no longer exists. Refresh and try again.');
 const name=String(draft.name||'').trim(),max=state.settings.maxAddress;
 if(!name||name.length>80)throw new Error('Enter a name of 1–80 characters.');
 const address=(v,label)=>{if(!Number.isInteger(v)||v<1||v>max)throw new Error(`${label} must be a whole bulb address from 1 to ${max}.`);return v};
 let next;
 if(type==='zone'){
  const start=address(draft.start,'Start'),end=address(draft.end,'End');
  if(end<start)throw new Error('End must be at or after the start.');
  if(!Number.isInteger(draft.color)||draft.color<0||draft.color>0xffffff)throw new Error('Select a valid zone color.');
  next={...original,name,start,end,color:draft.color};
 }else{
  const view=draft.view||'front';if(!['front','right','rear','left','shed'].includes(view))throw new Error('Select a valid house side.');
  next={...original,name,address:address(draft.address,'Landmark address'),view};
  if(view!==(original.view||'front')){next.x=null;next.y=null;}
 }
 return {...state,[field]:state[field].map(x=>x.id===next.id?next:x)};
}
