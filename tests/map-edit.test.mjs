import test from 'node:test';
import assert from 'node:assert/strict';
import {updateMapItem} from '../shared/map-edit.mjs';
const state={settings:{maxAddress:300},zones:[{id:'z',name:'Garage',start:1,end:50,color:255}],landmarks:[{id:'l',name:'Peak',address:20,x:30,y:40,view:'front'}]};
test('zone edits retain identity, update range/color and do not mutate prior state',()=>{
 const next=updateMapItem(state,'zone',{id:'z',name:' Garage roof ',start:10,end:60,color:0xff0000});
 assert.deepEqual(next.zones[0],{id:'z',name:'Garage roof',start:10,end:60,color:0xff0000});assert.equal(state.zones[0].start,1);
 assert.throws(()=>updateMapItem(state,'zone',{...state.zones[0],start:60,end:10}));
 assert.throws(()=>updateMapItem(state,'zone',{...state.zones[0],end:301}));
});
test('landmark edits retain placement unless side changes; invalid edits fail',()=>{
 let next=updateMapItem(state,'landmark',{...state.landmarks[0],name:'Front peak',address:21});assert.equal(next.landmarks[0].x,30);assert.equal(next.landmarks[0].address,21);
 next=updateMapItem(state,'landmark',{...state.landmarks[0],view:'shed'});assert.equal(next.landmarks[0].x,null);assert.equal(next.landmarks[0].y,null);
 assert.throws(()=>updateMapItem(state,'landmark',{...state.landmarks[0],address:1.5}));assert.throws(()=>updateMapItem(state,'zone',{id:'deleted'}));
});
