import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let now=1000000;const dateNow=Date.now;Date.now=()=>now;
const priorNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const listeners=new Map();const target={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type)}};
globalThis.window=target;globalThis.document={...target,visibilityState:'visible'};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
try{
const exports={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/refresh-activity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {canBackgroundRefresh,monitorRefreshActivity}=exports;let resumed=0;const stop=monitorRefreshActivity(()=>resumed++);
assert.ok(canBackgroundRefresh());now+=301000;assert.equal(canBackgroundRefresh(),false,'visible but idle page stops polling');listeners.get('pointerdown')();assert.equal(resumed,1);assert.ok(canBackgroundRefresh());
document.visibilityState='hidden';assert.equal(canBackgroundRefresh(),false);listeners.get('focus')();assert.equal(resumed,1);
now+=20000;document.visibilityState='visible';navigator.onLine=false;listeners.get('visibilitychange')();assert.equal(resumed,1);assert.equal(canBackgroundRefresh(),false);
navigator.onLine=true;listeners.get('online')();assert.equal(resumed,2);assert.ok(canBackgroundRefresh());listeners.get('focus')();assert.equal(resumed,2,'focus+online resumption is throttled');stop();assert.equal(listeners.size,0);
console.log('Idle, hidden page, offline pause, focus/online recovery, resume throttle and listener cleanup passed');
}finally{Date.now=dateNow;delete globalThis.window;delete globalThis.document;if(priorNav)Object.defineProperty(globalThis,'navigator',priorNav);else delete globalThis.navigator;}
