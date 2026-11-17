import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react');
const rows=[{id:'s1',name:'طالب أول',grade:'الرابع',classroom:'أ',total:3,longest:2,dates:['2026-10-01']},{id:'s2',name:'طالب ثان',grade:'الخامس',classroom:'ب',total:1,longest:1,dates:['2026-10-02']}];
let cursor=0,states=[],fail=false;const printed=[];
const react={...React,useMemo:f=>f(),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}};
globalThis.window={print(){printed.push(states[0]);if(fail)throw Error('print unavailable')}};
const exports={};const result=ts.transpileModule(fs.readFileSync('app/absence-student-report.tsx','utf8'),{fileName:'report.tsx',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});assert.equal(result.diagnostics.length,0);
new Function('require','exports',result.outputText)(id=>id==='react'?react:id==='react-dom'?{flushSync:f=>f()}:id==='./locale'?{useLocale:()=>({ui:s=>s,language:'ar'}),UiText:()=>null}:id==='./school-identity'?{}:id==='../lib/repeated-absence'?{absencePatterns:()=>rows,sortAbsencePatterns:r=>r}:require(id),exports);
const render=()=>{cursor=0;return exports.default({students:[],attendance:[],rounds:[],school:'مدرسة تجريبية',deputy:'مسجل تجربة'})};
function nodes(x,type){if(!x||typeof x!=='object')return [];if(Array.isArray(x))return x.flatMap(v=>nodes(v,type));return [...(x.type===type?[x]:[]),...nodes(x.props?.children,type)]}
let tree=render();let buttons=nodes(tree,'button');buttons[2].props.onClick();assert.deepEqual(printed,['s1']);tree=render();assert.ok(nodes(tree,'tr').some(r=>r.key==='s2'&&r.props.className==='exclude-from-print'));
// Print cancellation/no afterprint event must not prevent retry of the same student.
buttons[2].props.onClick();assert.deepEqual(printed,['s1','s1']);
// Whole-report printing synchronously clears the prior student selection.
nodes(render(),'button')[0].props.onClick();assert.deepEqual(printed,['s1','s1','']);assert.equal(states[0],'');
fail=true;nodes(render(),'button')[0].props.onClick();assert.ok(nodes(render(),'p').some(p=>p.props.role==='alert'));fail=false;nodes(render(),'button')[0].props.onClick();assert.ok(!nodes(render(),'p').some(p=>p.props.role==='alert'));
console.log('Absence print: selected student set before print, others excluded, repeated print after cancellation, whole-report reset, failure feedback and retry.');
