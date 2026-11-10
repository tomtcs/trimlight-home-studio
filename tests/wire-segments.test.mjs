import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHouseViews,flatHouseSvg,insertWirePoint,deleteWirePoint} from '../shared/house-map.mjs';
import {roofPoints} from '../shared/look-preview.mjs';
test('wire segments persist, render distinctly and consume no preview positions',()=>{
 const line={id:'roof',kind:'edge',points:[[0,0],[10,0],[90,100],[100,100]],wireSegments:[1]};
 const views=validateHouseViews({front:{photo:null,lines:[line]}});
 assert.deepEqual(views.front.lines[0].wireSegments,[1]);
 assert.deepEqual(roofPoints([line],5),[[0,0],[5,0],[10,0],[95,100],[100,100]]);
 assert.deepEqual(roofPoints([{...line,wireSegments:[0,1,2]}],100),[]);
 assert.match(flatHouseSvg({houseViews:views}),/Gray dotted: wire only/);
 assert.throws(()=>validateHouseViews({front:{lines:[{...line,wireSegments:[3]}]}}));
 assert.throws(()=>validateHouseViews({front:{lines:[{...line,wireSegments:[1,1]}]}}));
});
test('point edits preserve wire gaps, splitting wires and merging conservatively',()=>{
 assert.deepEqual(insertWirePoint([1],2,4),[1,2]);
 assert.deepEqual(insertWirePoint([1],1,4),[2]);
 assert.deepEqual(insertWirePoint([1],4,4),[1]);
 assert.deepEqual(deleteWirePoint([1,2],2,5),[1]);
 assert.deepEqual(deleteWirePoint([0],0,3),[]);
 assert.deepEqual(deleteWirePoint([1],2,3),[]);
});
