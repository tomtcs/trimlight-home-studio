import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as animations from '../shared/animations.mjs';
import * as repair from '../shared/sync-repair.mjs';
const require=createRequire(import.meta.url);
// Render the actual TSX dialog; only the canvas preview is stubbed for Node.
const source=fs.readFileSync(new URL('../app/sync-repair.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',compiled)(name=>name==='./look-preview'?{default:()=>null}:name.endsWith('/animations.mjs')?animations:name.endsWith('/sync-repair.mjs')?repair:require(name),mod,mod.exports);
const Component=mod.exports.default;
test('legacy animation repair dialog renders all supported choices without iterating catalog objects',()=>{
 const html=renderToStaticMarkup(React.createElement(Component,{state:{patterns:[{id:'legacy',effect:{category:1,mode:20}}]},issue:{patternId:'legacy',name:'Birthday',requiresAnimation:true,dates:['2026-11-01'],rules:[]},busy:false}));
 for(const {mode,label} of animations.CUSTOM_ANIMATIONS){assert.ok(html.includes(`value="${mode}"`));assert.ok(html.includes(label))}
 assert.match(html,/Select an animation to review/);assert.match(html,/Create copy/);
});
