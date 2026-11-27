import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {createRequire} from 'node:module';
const nodeRequire=createRequire(import.meta.url),cache={};
function load(path){if(cache[path])return cache[path];const exports={};cache[path]=exports;new Function('exports','require',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>name==='./case-fields'?load('lib/case-fields.ts'):nodeRequire(name));return exports;}
const {draftKey,parseDraft,DRAFT_TTL}=load('lib/case-draft.ts'),{CASE_TYPES,CLASS_LATE_TYPE}=load('lib/case-fields.ts');
const now=Date.now(),form={studentId:'student-1',type:CASE_TYPES[0],occurredAt:'2026-10-15T08:30',details:'ملاحظة مسودة',action:'إجراء',extra:{reason:'أخرى',arrivalTime:'08:30'},followStatus:'none'},wrap=(over={})=>JSON.stringify({version:1,savedAt:now,form,...over});
assert.deepEqual(parseDraft(wrap(),'case',now).form,form);
assert.equal(parseDraft(wrap(),'class-late',now),null);
assert.equal(parseDraft(wrap({savedAt:now-DRAFT_TTL}),'case',now),null);
assert.equal(parseDraft(wrap({savedAt:now+120000}),'case',now),null);
assert.equal(parseDraft('{invalid','case'),null);
assert.equal(parseDraft(wrap({version:2}),'case'),null);
assert.equal(parseDraft(wrap({form:{...form,type:'unsupported'}}),'case'),null);
assert.equal(parseDraft(wrap({form:{...form,occurredAt:'not a date'}}),'case'),null);
assert.equal(parseDraft(wrap({form:{...form,details:'x'.repeat(3001)}}),'case'),null);
assert.equal(parseDraft(wrap({form:{...form,extra:{arrivalTime:'28:00'}}}),'case'),null);
assert.ok(parseDraft(wrap({form:{...form,type:CLASS_LATE_TYPE}}),'class-late',now));
assert.notEqual(draftKey('one@example.com','case'),draftKey('two@example.com','case'));
assert.notEqual(draftKey('one@example.com','case'),draftKey('one@example.com','class-late'));
assert.equal(draftKey('ONE@example.com ','case'),draftKey('one@example.com','case'));
const source=ts.createSourceFile('dashboard.tsx',fs.readFileSync('app/dashboard.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),dashboard=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Dashboard');
const functionCode=name=>ts.transpile(dashboard.body.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(source),{target:ts.ScriptTarget.ES2022});
new Function('assert','TYPES','CLASS_LATE_TYPE',`let route='',form=null,allowed=true,work=false,agree=false,cleared=0;const location={hash:''},caseDraft={get hasWork(){return work},clear(){cleared++}},asked=[],ask=r=>{asked.push(r)},canLeaveAttendance=()=>allowed,datetimeLocal=()=> '2026-10-15T08:30',blankCase=()=>({type:TYPES[0],extra:{arrivalTime:'08:30'},action:'دخول',studentId:''}),blankClassLate=()=>({type:CLASS_LATE_TYPE,extra:{entryTime:'08:30'},action:'دخول الحصة'}),setClassLateGroup=()=>{},setCaseEditing=()=>{},setViewCase=()=>{},setProfile=()=>{},setCaseForm=v=>form=v,setTab=v=>route=v;
const INCIDENT_TYPE='الوقائع والإسعافات',ui=s=>s;
${functionCode('newCase')}
${functionCode('startCase')}
newCase('s',TYPES[1]);assert.equal(form.studentId,'s');assert.equal(form.type,TYPES[1]);assert.deepEqual(form.extra,{exitTime:'08:30'});assert.equal(route,'case');
newCase('s',CLASS_LATE_TYPE);assert.equal(route,'class-late');assert.equal(form.type,CLASS_LATE_TYPE);
newCase('s',TYPES[5]);assert.equal(form.type,TYPES[5]);assert.equal(form.action,'');assert.deepEqual(form.extra,{});
allowed=false;form=null;newCase('s');assert.equal(form,null);allowed=true;work=true;newCase('s');assert.equal(form,null,'a draft in progress is asked about first, in the page');assert.equal(cleared,0);assert.equal(asked.length,1);assert.equal(asked[0].yes,'متابعة');asked[0].run();assert.equal(cleared,1,'answering yes clears the draft');assert.equal(form.studentId,'s','and starts the new case');work=false;form=null;newCase('s');assert.equal(asked.length,1,'no question without a draft');assert.equal(form.studentId,'s');
`)(assert,CASE_TYPES,CLASS_LATE_TYPE);
const run=new Function('assert','CLASS_LATE_TYPE',`return (async()=>{let cleared=0,reset=0,success=false;const caseForm={...${JSON.stringify(form)},occurredAt:'2026-10-15T08:30'},caseEditing=null,caseDraft={pending:null,clear(){cleared++}},caseExtraError=()=>'',summarizeExtra=()=>'',mutate=async()=>success?{id:'saved'}:null,student=()=>({name:'طالب',grade:'رابع',classroom:'أ'}),data={user:{name:'مستخدم'}},setError=()=>{},setCaseForm=()=>reset++,setCaseEditing=()=>{},setTab=()=>{},blankCase=()=>({}),blankClassLate=()=>({}),openPrint=()=>{},setContactEdit=()=>{},contacts=[];
const INCIDENT_TYPE='الوقائع والإسعافات',ui=s=>s;
${functionCode('submitCase')}
await submitCase();assert.equal(cleared,0,'failed save keeps the draft');assert.equal(reset,0);success=true;await submitCase();assert.equal(cleared,1,'only a successful case save removes the draft');assert.equal(reset,1);
})()`);await run(assert,CLASS_LATE_TYPE);
console.log('Draft validation/expiry/account isolation; quick actions and guarded replacement; failed save preserves draft and successful save clears it: passed');
// Exercise the real hook across rerenders/reloads with an in-memory browser store.
const store=new Map();let unavailable=false;globalThis.localStorage={getItem:k=>{if(unavailable)throw Error();return store.get(k)||null},setItem:(k,v)=>{if(unavailable)throw Error();store.set(k,v)},removeItem:k=>{if(unavailable)throw Error();store.delete(k)}};
function mount(owner='first@example.com'){
 const values=[],effects=[];let cursor=0,queued=[],changed=false,input={...form},editing=false,output;
 const react={useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],next=>{next=typeof next==='function'?next(values[i]):next;if(!Object.is(next,values[i])){values[i]=next;changed=true}}]},useRef(initial){const i=cursor++;return values[i]??(values[i]={current:initial})},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>!Object.is(v,effects[i][j]))){effects[i]=deps;queued.push(fn)}}};
 const hookExports={};new Function('exports','require',ts.transpileModule(fs.readFileSync('app/use-case-draft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(hookExports,name=>name==='react'?react:load('lib/case-draft.ts'));
 function render(){let cycles=0;do{if(++cycles>20)throw Error('render loop');changed=false;cursor=0;queued=[];output=hookExports.useCaseDraft(owner,input.type===CLASS_LATE_TYPE?'class-late':'case',input,editing);const pending=queued;queued=[];for(const effect of pending)effect();}while(changed);return output}
 render();return {read:()=>output,render,change(next){input={...input,...next};output.markChanged();render()},setEditing(v){editing=v;render()},restore(){const value=output.take();if(value)input=value;render();return value},clear(){output.clear();render()}};
}
const first=mount();assert.equal(store.size,0,'pristine form never makes a draft');first.change({details:'استعادة بعد إعادة التحميل'});assert.ok(first.read().savedAt);assert.equal(store.size,1);
const reloaded=mount();assert.equal(reloaded.read().pending.form.details,'استعادة بعد إعادة التحميل');assert.equal(reloaded.restore().studentId,'student-1');assert.equal(reloaded.read().pending,null);assert.ok(reloaded.read().savedAt);
const other=mount('other@example.com');assert.equal(other.read().pending,null,'another account must not see the first account draft');
reloaded.setEditing(true);reloaded.change({details:'تعديل حالة موجودة'});assert.equal(parseDraft(store.get(draftKey('first@example.com','case')),'case').form.details,'استعادة بعد إعادة التحميل','editing an existing case never overwrites an unrelated new draft');
reloaded.setEditing(false);assert.ok(reloaded.read().pending);reloaded.clear();assert.equal(store.size,0);assert.equal(reloaded.read().pending,null);assert.equal(reloaded.read().hasWork,false);
unavailable=true;const blocked=mount();assert.ok(blocked.read().warning);blocked.change({details:'لا تضيع'});assert.ok(blocked.read().warning);unavailable=false;
console.log('Real draft hook: reload recovery, explicit restore, untouched pristine forms, edit isolation, account isolation, successful clearing and storage failure notice passed');

const editOnly=mount('edit-only@example.com');editOnly.setEditing(true);editOnly.change({details:'existing record edit'});editOnly.setEditing(false);assert.equal(store.has(draftKey('edit-only@example.com','case')),false,'finishing or canceling an edit cannot create a new draft');
