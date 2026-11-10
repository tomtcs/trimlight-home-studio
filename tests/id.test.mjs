import test from 'node:test';
import assert from 'node:assert/strict';
import {uuid} from '../shared/id.mjs';
import {validateHouseViews} from '../shared/house-map.mjs';
test('local HTTP crypto without randomUUID creates valid unique section IDs',()=>{
 const httpCrypto={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)};
 const ids=Array.from({length:1000},()=>uuid(httpCrypto));
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const views=validateHouseViews({right:{photo:null,lines:[{id:ids[0],kind:'edge',points:[[0,0],[10,10],[20,10]],wireSegments:[1]}]}});
 assert.equal(views.right.lines[0].id,ids[0]);
});
test('native UUID is retained and missing crypto reports an actionable error',()=>{
 assert.equal(uuid({randomUUID:()=> 'native-id'}),'native-id');
 assert.throws(()=>uuid({}),/browser.*HTTPS/);
});
