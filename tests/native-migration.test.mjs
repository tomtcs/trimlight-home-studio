import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../standalone/database.mjs';
import {readState,writeState} from '../shared/service.mjs';
import {migrateNativeOnly} from '../standalone/native-migration.mjs';
test('native migration pauses control, preserves credentials and originals, archives incompatible looks without network access',async()=>{
 const env={DB:openDatabase(':memory:'),LOCAL_RUNNER:true,FETCH:()=>{throw new Error('Must not access controller')}};
 let saved={controllerType:'wled',wledUrl:'http://192.168.1.5',clientId:'id',clientSecret:'secret',deviceId:'device'};const store={read:()=>saved,write:x=>{saved=x}};
 let {state,revision}=await readState(env);const native=structuredClone(state.device);
 state.controllerSnapshots={trimlight:native};state.device={wled:{}};state.settings.schedulerEnabled=true;state.settings.rollingEnabled=true;state.runtime={preview:true};state.rolling={status:'failed'};
 state.patterns=[{id:'a',name:'Original',protected:true,effect:{mode:6},wledPreset:1},{id:'b',name:'Preset',wledOnly:true,wledPreset:2}];state.rules=[{id:'r',patternId:'b',enabled:true}];await writeState(env,state,revision);
 assert.equal(await migrateNativeOnly(env,store),true);({state}=await readState(env));assert.equal(state.settings.schedulerEnabled,false);assert.equal(state.settings.rollingEnabled,false);assert.deepEqual(state.runtime,{});assert.deepEqual(state.device,native);assert.equal(state.rolling.status,'failed');assert.deepEqual(state.patterns,[{id:'a',name:'Original',protected:true,effect:{mode:6}}]);assert.equal(state.retiredControllerLooks[0].id,'b');assert.equal(state.rules.length,0);assert.equal(state.retiredControllerRules[0].enabled,false);assert.deepEqual(saved,{clientId:'id',clientSecret:'secret',deviceId:'device'});assert.equal(await migrateNativeOnly(env,store),false);
});
test('native installations require no migration',async()=>{assert.equal(await migrateNativeOnly({}, {read:()=>({clientId:'id'}),write:()=>assert.fail()}),false)});
