import test from 'node:test';import assert from 'node:assert/strict';
import {controllerName} from '../shared/upload-verification.mjs';
test('controller names use readable ASCII while library names remain untouched',()=>{
 assert.equal(controllerName('Chloes Birthday · API copy'),'Chloes Birthday - API copy');
 assert.equal(controllerName('Chloes Birthday Â· API copy'),'Chloes Birthday - API copy');
 assert.equal(controllerName('Courtney’s Birthday'),'Courtney\'s Birthday');
 assert.equal(controllerName('Noël'),'Noel');
});
