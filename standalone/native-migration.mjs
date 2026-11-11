import {readState,writeState} from '../shared/service.mjs';
// Retire connection metadata from the experimental dual-controller release.
// This migration performs no network requests or controller writes.
export async function migrateNativeOnly(env,store){
 const saved=store.read();if(!saved||!('controllerType' in saved)&&!('wledUrl' in saved))return false;
 const {state,revision}=await readState(env);
 state.settings.schedulerEnabled=false;state.settings.rollingEnabled=false;state.runtime={};
 const retired=state.patterns.filter(p=>p.wledOnly),ids=new Set(retired.map(p=>p.id));
 state.retiredControllerLooks=[...(state.retiredControllerLooks||[]),...retired.filter(p=>!(state.retiredControllerLooks||[]).some(x=>x.id===p.id))];
 state.patterns=state.patterns.filter(p=>!p.wledOnly).map(p=>{const next={...p};delete next.wledPreset;delete next.wledOnly;return next});
 state.retiredControllerRules=[...(state.retiredControllerRules||[]),...state.rules.filter(r=>ids.has(r.patternId)&&!(state.retiredControllerRules||[]).some(x=>x.id===r.id)).map(r=>({...r,enabled:false}))];
 state.rules=state.rules.filter(r=>!ids.has(r.patternId));
 if(saved.controllerType==='wled'){
  state.device=state.controllerSnapshots?.trimlight||{effects:[],calendar:[],daily:[],ports:[],connectivity:0,switchState:2};
  state.snapshotAt=null;state.snapshotSource='Native Trimlight restored; refresh required';
 }
 delete state.controllerSnapshots;
 await writeState(env,state,revision);
 const native={...saved};delete native.controllerType;delete native.wledUrl;await store.write(native);
 return true;
}
