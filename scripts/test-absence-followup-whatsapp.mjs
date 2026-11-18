import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helper={};new Function('exports',transpile('lib/absence-followup-whatsapp.ts'))(helper);
for(const p of ['0501234567','501234567','+966 50 123 4567','00966501234567','٠٥٠١٢٣٤٥٦٧','۰۵۰۱۲۳۴۵۶۷','+966 (0)50-123-4567'])assert.equal(helper.absenceFollowupPhone(p),'966501234567',p);
for(const p of ['', '050123', 'رقم غير مسجل','0501234567 إضافي 123','https://wa.me/123','0000000000'])assert.equal(helper.absenceFollowupPhone(p),'',p);
assert.equal(helper.absenceFollowupPhone('+1 (202) 555-0123'),'12025550123');
const student={id:'student-fixture',name:'طالب تجريبي',grade:'الخامس',classroom:'ب',phone:'٠٥٠١٢٣٤٥٦٧'},follow={studentId:student.id,status:'open',totalCount:4,lastAbsent:'2026-10-26',contactStatus:'none',notes:'ملاحظة محفوظة',actor:'مستخدم',updatedAt:'2026-10-26T05:00:00Z'};
const before=JSON.stringify({student,follow});
const message=helper.absenceFollowupMessage(student,follow,'مدرسة تجريبية');
const url=new URL(helper.absenceFollowupWhatsappUrl(student.phone,message));assert.equal(url.hostname,'wa.me');assert.equal(url.pathname,'/966501234567');assert.equal(url.searchParams.get('text'),message);assert.match(message,/4 أيام/);assert.match(message,/2026-10-26/);assert.match(message,/مدرسة تجريبية/);assert.equal(JSON.stringify({student,follow}),before);

// Exercise the actual component handlers. A native link remains usable while
// logging is pending or failed. No browser is opened and no real records change.
let states=[],refs=[],cursor=0,refCursor=0;
const React={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef(initial){const i=refCursor++;return refs[i]??= {current:initial};},useEffect(){}};
const out={},runtime=require('react/jsx-runtime');
new Function('exports','require',transpile('app/absence-followups.tsx'))(out,name=>{
 if(name==='react')return React;
 if(name==='react/jsx-runtime')return runtime;
 if(name==='./locale')return {useLocale:()=>({ui:text=>text,language:'ar'}),UiText:'ui-text'};
 if(name.endsWith('absence-followup-whatsapp'))return helper;
 if(name.endsWith('field-colors'))return {fieldTone:()=>''};
 if(name==='lucide-react')return {Phone:'phone-icon',Check:'check-icon',Search:'search-icon',Copy:'copy-icon',X:'close-icon'};
 throw Error('Unexpected import '+name);
});
let calls=[],resolveLog;const mutate=(op,payload)=>{calls.push({op,payload});return new Promise(resolve=>{resolveLog=resolve;});};
const props={students:[student],follows:[follow],events:[],school:'مدرسة تجريبية',mutate,busy:false,onProfile:()=>{}};
const render=()=>{cursor=0;refCursor=0;return out.default(props);};
function nodes(node,all=[]){if(!node||typeof node!=='object')return all;if(Array.isArray(node)){for(const n of node)nodes(n,all);return all;}if(node.props){all.push(node);nodes(node.props.children,all);}return all;}
const hasText=(node,text)=>nodes(node).some(n=>n.props.text===text);
const find=(tree,type,label)=>nodes(tree).find(n=>n.type===type&&hasText(n,label));
let tree=render();find(tree,'button','تجهيز واتساب').props.onClick();tree=render();assert.equal(calls.length,0,'Preparing a message does not require server logging');
let anchor=find(tree,'a','فتح واتساب بالرسالة');assert.equal(anchor.props.target,'_blank');assert.equal(new URL(anchor.props.href).searchParams.get('text'),message);
let prevented=false;anchor.props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(calls.length,1);assert.equal(calls[0].op,'absence-follow');assert.equal(calls[0].payload.kind,'opened');assert.equal(calls[0].payload.contactStatus,'opened');assert.equal(follow.contactStatus,'none');assert.equal(follow.notes,'ملاحظة محفوظة');
anchor.props.onClick({preventDefault(){throw Error('unexpected')}});assert.equal(calls.length,1,'Double click does not duplicate a pending log');
resolveLog(null);await new Promise(resolve=>setImmediate(resolve));tree=render();assert.ok(nodes(tree).some(n=>n.props.role==='status'));assert.equal(find(tree,'a','فتح واتساب بالرسالة').props.href,anchor.props.href,'Logging failure cannot disable the WhatsApp link');
anchor=find(tree,'a','فتح واتساب بالرسالة');anchor.props.onClick({preventDefault(){throw Error('unexpected')}});assert.equal(calls.length,2);resolveLog({ok:true});await new Promise(resolve=>setImmediate(resolve));tree=render();anchor=find(tree,'a','فتح واتساب بالرسالة');anchor.props.onClick({preventDefault(){throw Error('unexpected')}});assert.equal(calls.length,2,'Reopening does not duplicate a successful log');
let copied='';Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{copied=text;}}}});await find(tree,'button','نسخ الرسالة').props.onClick();assert.equal(copied,message);assert.equal(calls.length,2,'Copying alone never records sending');
props.busy=true;tree=render();prevented=false;find(tree,'a','فتح واتساب بالرسالة').props.onClick({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(calls.length,2);
// Invalid numbers now show a visible error rather than silently doing nothing.
states=[];refs=[];props.busy=false;props.students=[{...student,phone:'غير صالح'}];tree=render();find(tree,'button','تجهيز واتساب').props.onClick();tree=render();assert.ok(nodes(tree).some(n=>n.props.role==='alert'));assert.equal(find(tree,'a','فتح واتساب بالرسالة'),undefined);
assert.equal(JSON.stringify({student,follow}),before);
console.log('Absence WhatsApp passed: Arabic/Persian and international phone formats, visible invalid-number feedback, native handoff independent of slow/failed logging, retry/deduplication, copy fallback, busy guard, preserved notes and manual-only sending.');
