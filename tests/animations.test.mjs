import test from 'node:test';
import assert from 'node:assert/strict';
import {CUSTOM_ANIMATIONS, animationOptions} from '../shared/animations.mjs';
import {sequenceCanvas, saveEditorEffect} from '../shared/pattern-editor.mjs';
import {effectPayload} from '../shared/domain.mjs';

test('all documented animation IDs survive editor save with original color runs', () => {
  assert.deepEqual(CUSTOM_ANIMATIONS.map(a => a.mode), Array.from({length:17}, (_,i) => i));
  assert.equal(CUSTOM_ANIMATIONS.find(a => a.label === 'Wave forward').mode, 11);
  for (const {mode} of CUSTOM_ANIMATIONS) {
    const effect = effectPayload({category:1, mode, speed:128, brightness:255,
      pixels:[{index:0,count:5,color:255},{index:1,count:2,color:0}]});
    assert.deepEqual(saveEditorEffect(effect, sequenceCanvas(effect), false), effect);
  }
});
test('imported and built-in IDs keep a selected option without being relabeled as custom', () => {
  const effect = effectPayload({category:1,mode:20,speed:128,brightness:255,pixels:[{index:0,count:5,color:255}]});
  assert.equal(animationOptions(effect)[0].mode,20);
  assert.match(animationOptions(effect)[0].label,/Imported/);
  assert.deepEqual(saveEditorEffect(effect,sequenceCanvas(effect),false),effect);
  assert.deepEqual(animationOptions({category:0,mode:11}),[{mode:11,label:'Built-in controller effect (11)'}]);
});
