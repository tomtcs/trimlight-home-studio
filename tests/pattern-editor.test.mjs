import test from 'node:test';
import assert from 'node:assert/strict';
import {effectPayload,expand,householdState} from '../shared/domain.mjs';
import {sequenceCanvas,editorSlots,saveEditorEffect} from '../shared/pattern-editor.mjs';
test('repeating blue wave uses two slots and preserves its animation',()=>{
 const e=effectPayload({category:1,mode:11,brightness:255,speed:128,pixels:[{index:0,count:5,color:255},{index:1,count:2,color:0}]});
 const c=sequenceCanvas(e);assert.deepEqual(c,[255,255,255,255,255,0,0]);assert.equal(editorSlots(e,c,false),2);
 assert.deepEqual(saveEditorEffect(e,c,false),e);assert.equal(editorSlots(e,expand(e,724),true),207);
 assert.throws(()=>saveEditorEffect(e,expand(e,724),true),/30/);
});
test('new households have no personal patterns or calendar and scheduling starts disabled',()=>{
 const s=householdState();assert.equal(s.patterns.length,0);assert.equal(s.rules.length,0);assert.equal(s.settings.schedulerEnabled,false);assert.equal(s.settings.lat,0);assert.equal(s.settings.lon,0);
});
