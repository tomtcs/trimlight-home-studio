import test from 'node:test';
import assert from 'node:assert/strict';
import {lookCategory,groupLooks} from '../shared/look-categories.mjs';
test('existing looks gain non-destructive categories and explicit choices win',()=>{
 const p={name:'Christmas birthday',protected:true,effect:{mode:20}};
 const before=JSON.stringify(p);
 assert.equal(lookCategory(p),'Birthdays');assert.equal(JSON.stringify(p),before);
 assert.equal(lookCategory({...p,libraryCategory:'Sports'}),'Sports');
 assert.equal(lookCategory({name:'Veterans Day'}),'Patriotic & Military');
 assert.equal(lookCategory({name:'Unknown effect'}),'Uncategorized');
});
test('grouping preserves sort order and category filtering',()=>{
 const ps=[{name:'Joy birthday'},{name:'Chloe birthday'},{name:'Christmas'}];
 assert.deepEqual(groupLooks(ps,'Birthdays')[0].patterns,ps.slice(0,2));
 assert.equal(groupLooks(ps).reduce((n,g)=>n+g.patterns.length,0),3);
 assert.deepEqual(groupLooks([], 'Sports'),[]);
});
