import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
let DB,schema,user={userId:'audit-fixture',displayName:'مسجل اختباري',email:'fixture@example.test'};
const modules=new Map(),environment={VISITOR_PORTAL_URL:'https://portal.test',VISITOR_ADMIN_KEY:'test-only-key'};let fetches=0,lastProxy;
function load(file){const absolute=path.resolve(file);if(modules.has(absolute))return modules.get(absolute);const exports={};modules.set(absolute,exports);const js=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','crypto','fetch',js)(name=>{if(name==='cloudflare:workers')return {env:{...environment,DB}};if(name.endsWith('chatgpt-auth'))return {getChatGPTUser:async()=>user};if(name==='../../../db')return {getDb:()=>require('drizzle-orm/d1').drizzle(DB,{schema})};if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name)+'.ts');return require(name);},exports,webcrypto,async(url,options)=>{fetches++;lastProxy={url,options};return Response.json({ok:true,visits:[]});});return exports;}
try{
 DB=await mf.getD1Database('DB');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint'))if(s.trim())await DB.prepare(s).run();
 schema=load('db/schema.ts');const api=load('app/api/data/route.ts'),backup=load('app/api/backup/route.ts'),proxy=load('app/api/visitors/route.ts');
 const request=(op,data,origin='https://audit.test',type='application/json')=>new Request('https://audit.test/api/data',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:JSON.stringify({op,data})});
 const post=(op,data)=>api.POST(request(op,data));const snapshot=async()=>await (await api.GET()).json();
 user=null;assert.equal((await api.GET()).status,401);assert.equal((await post('student',{})).status,401);assert.equal((await backup.GET(new Request('https://audit.test/api/backup'))).status,401);assert.equal((await proxy.POST(request('create',{}))).status,401);
 user={userId:'audit-fixture',displayName:'مسجل اختباري',email:'fixture@example.test'};
 assert.equal((await api.POST(request('student',{},'https://unrelated.test'))).status,403);assert.equal((await api.POST(request('student',{},'https://audit.test','text/plain'))).status,400);
 assert.equal((await proxy.POST(request('create',{},'https://unrelated.test'))).status,403);assert.equal((await proxy.POST(request('create',{},'https://audit.test','text/plain'))).status,400);assert.equal(fetches,0);
 assert.equal((await proxy.POST(new Request('https://audit.test/api/visitors',{method:'POST',headers:{Origin:'https://audit.test','Content-Type':'application/json'},body:JSON.stringify({op:'create',name:'تجريبي',actor:'fake'})}))).status,200);assert.equal(fetches,1);assert.equal(JSON.parse(lastProxy.options.body).actor,user.displayName);assert.equal(lastProxy.options.headers['X-Visitor-Key'],environment.VISITOR_ADMIN_KEY);
 const student={name:'طالب اختبار',grade:'الرابع',classroom:'أ',guardian:'ولي أمر اختبار',phone:'0500000000',notes:'ملاحظات أصلية'};assert.equal((await post('student',student)).status,200);const sid=(await snapshot()).students[0].id;
 const caseData={studentId:sid,type:'الملاحظات',occurredAt:'2026-10-01T04:00:00Z',details:'تفاصيل أصلية',action:'إجراء أصلي',extra:{},followStatus:'open'};
 const created=await post('case',caseData);assert.equal(created.status,200);const cid=(await created.json()).id;
 assert.equal((await post('case-edit',{...caseData,id:cid,revision:1,details:'تفاصيل معدلة'})).status,200);assert.equal((await post('case-edit',{...caseData,id:cid,revision:1})).status,409);
 assert.equal((await post('contact',{caseId:cid,status:'opened',message:'رسالة اختبار'})).status,200);assert.equal((await post('follow',{id:cid,status:'done',outcome:'تمت المتابعة'})).status,200);
 assert.equal((await post('case-delete',{id:cid,revision:3})).status,200);let data=await snapshot();assert.ok(data.cases[0].deletedAt);assert.equal(data.caseRevisions.length,2);assert.equal(JSON.parse(data.caseRevisions[0].snapshot).details,'تفاصيل أصلية');assert.equal((await post('contact',{caseId:cid,status:'sent',message:'رسالة اختبار'})).status,404);
 await DB.prepare("INSERT INTO absence_followups(student_id,status,total_count,last_absent,contact_status,notes,actor,updated_at) VALUES (?,'done',3,'2026-10-01','sent','ملاحظات مهمة محفوظة','fixture',?)").bind(sid,new Date().toISOString()).run();
 assert.equal((await post('absence-follow',{studentId:sid,status:'open',contactStatus:'opened',notes:'فتح واتساب',kind:'opened'})).status,200);const f=await DB.prepare('SELECT * FROM absence_followups WHERE student_id=?').bind(sid).first();assert.equal(f.notes,'ملاحظات مهمة محفوظة');assert.equal(f.status,'done');assert.equal(f.contact_status,'sent');assert.equal((await snapshot()).absenceEvents.length,1);
 const exported=await backup.GET(new Request('https://audit.test/api/backup'));assert.equal(exported.status,200);assert.equal(exported.headers.get('Cache-Control'),'no-store');const v=await exported.json();assert.equal(v.caseRevisions.length,2);assert.equal(v.contacts.length,1);assert.equal(v.followups.length,1);assert.equal(v.absenceEvents.length,1);
 const before=await snapshot();assert.equal((await post('restore',v)).status,200);assert.deepEqual(await snapshot(),before,'restore never replaces current rows');
 assert.equal((await post('restore',{...v,cases:[{...v.cases[0],studentId:'missing',id:webcrypto.randomUUID()}]})).status,400);assert.deepEqual(await snapshot(),before);

 const family=load('app/api/siblings/route.ts');
 const familyPost=(payload,origin='https://audit.test')=>family.POST(new Request('https://audit.test/api/siblings',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)}));
 const rows=async()=> (await (await family.GET()).json()).members;
 const savedUser=user;user=null;assert.equal((await family.GET()).status,401);assert.equal((await familyPost({op:'link',studentId:sid,siblingId:sid})).status,401);user=savedUser;
 assert.equal((await familyPost({op:'link',studentId:sid,siblingId:sid},'https://evil.test')).status,403);
 const ids=[];for(let i=0;i<4;i++){await post('student',{...student,name:'أخ اختبار '+i,phone:i%2?'0501111111':'0500000000'});ids.push((await snapshot()).students.find(s=>s.name==='أخ اختبار '+i).id);}
 const link=async(a,b)=>{const response=await familyPost({op:'link',studentId:a,siblingId:b,actor:'fake'});assert.equal(response.status,200,JSON.stringify(await response.json()));};
 const unchangedCases=JSON.stringify((await snapshot()).cases);
 assert.equal((await familyPost({op:'link',studentId:sid,siblingId:sid})).status,400);
 assert.equal((await familyPost({op:'link',studentId:sid,siblingId:'missing'})).status,400);
 await link(sid,ids[0]);await link(ids[0],ids[1]);let familyRows=await rows();assert.equal(new Set(familyRows.map(r=>r.familyId)).size,1);assert.equal(familyRows.length,3,'third sibling appears throughout the family');assert.ok(familyRows.every(r=>r.actor===user.displayName));
 await link(ids[2],ids[3]);await link(ids[1],ids[3]);familyRows=await rows();assert.equal(new Set(familyRows.map(r=>r.familyId)).size,1,'joining two families retains all siblings');assert.equal(familyRows.length,5);
 await link(sid,ids[0]);assert.equal((await rows()).length,5,'retry does not duplicate members');
 assert.equal((await familyPost({op:'unlink',studentId:ids[0]})).status,200);assert.equal((await rows()).find(r=>r.studentId===ids[0]).familyId,'');assert.equal(new Set((await rows()).filter(r=>r.familyId).map(r=>r.familyId)).size,1);assert.equal(JSON.stringify((await snapshot()).cases),unchangedCases,'linking and unlinking never modifies student case records');
 await post('archive',{id:ids[0],active:false});assert.equal((await familyPost({op:'link',studentId:sid,siblingId:ids[0]})).status,400);await post('archive',{id:ids[0],active:true});
 const familyBackup=await (await backup.GET(new Request('https://audit.test/api/backup'))).json();assert.equal(familyBackup.studentFamilies.length,5,'family rows are included in full backup');
 const familyBefore=JSON.stringify(await rows());assert.equal((await post('restore',familyBackup)).status,200);assert.equal(JSON.stringify(await rows()),familyBefore,'restore preserves current family decisions');
 await DB.prepare('DELETE FROM student_families').run();assert.equal((await post('restore',familyBackup)).status,200);assert.equal(JSON.stringify(await rows()),familyBefore,'family links can be restored from backup');
 assert.equal((await post('restore',{...familyBackup,studentFamilies:[{studentId:'missing',familyId:'f',actor:'test',updatedAt:new Date().toISOString()}]})).status,400);
 console.log('Family D1 passed: authorized confirmed links, self/missing/archive checks, group merge, retry, unlink, independent records, backup export/restore and invalid reference rejection.');
 const names=load('lib/registrar-name.ts');assert.equal(names.registrarName(' abu   noof '),'مسؤول المدرسة');assert.equal(names.registrarName('زميل آخر'),'زميل آخر');assert.equal(names.registrarName('حساب سابق','ayed6992@gmail.com'),'مسؤول المدرسة');
 user={...user,displayName:'ABU NOOF'};const renamed=await post('case',{...caseData,followStatus:'none'});assert.equal(renamed.status,200);const renamedId=(await renamed.json()).id;assert.equal((await DB.prepare('SELECT actor FROM cases WHERE id=?').bind(renamedId).first()).actor,'مسؤول المدرسة');
 await DB.prepare('UPDATE cases SET actor=? WHERE id=?').bind('ABU NOOF',renamedId).run();const displayed=(await snapshot()).cases.find(c=>c.id===renamedId);assert.equal(displayed.actor,'مسؤول المدرسة');assert.equal(displayed.details,caseData.details);assert.equal((await DB.prepare('SELECT actor FROM cases WHERE id=?').bind(renamedId).first()).actor,'ABU NOOF');const rawBackup=await (await backup.GET(new Request('https://audit.test/api/backup'))).json();assert.equal(rawBackup.cases.find(c=>c.id===renamedId).actor,'ABU NOOF');
 assert.equal((await proxy.POST(request('create',{name:'تجريبي',actor:'fake'}))).status,200);assert.equal(JSON.parse(lastProxy.options.body).actor,'مسؤول المدرسة');
 console.log('Audit D1 passed: authentication, cross-origin guards, server actor, case edit/delete history, stale revision rejection, follow/contact, preserved absence notes/status, full backup, non-destructive restore and invalid-reference rejection.');
}finally{await mf.dispose();}
