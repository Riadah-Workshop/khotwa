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
 new Function('require','exports','crypto','fetch',js)(name=>{if(name==='cloudflare:workers')return {env:{...environment,DB}};if(name.endsWith('chatgpt-auth'))return {getChatGPTUser:async()=>user,denyReadOnlyWrite:async()=>user?.email==='viewer@test.local'?Response.json({error:'read only'},{status:403}):null};if(name==='../../../db')return {getDb:()=>require('drizzle-orm/d1').drizzle(DB,{schema})};if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name)+'.ts');return require(name);},exports,webcrypto,async(url,options)=>{fetches++;lastProxy={url,options};return Response.json({ok:true,visits:[]});});return exports;}

try {
 DB=await mf.getD1Database('DB');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of fs.readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint'))if(s.trim())await DB.prepare(s).run();
 schema=load('db/schema.ts');const api=load('app/api/data/route.ts'),backup=load('app/api/backup/route.ts'),fields=load('lib/case-fields.ts');
 const post=(op,data)=>api.POST(new Request('https://test.local/api/data',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://test.local'},body:JSON.stringify({op,data})}));
 await post('student',{name:'طالب واقعة تجريبي',grade:'الرابع',classroom:'أ',guardian:'ولي أمر',phone:'0500000000',notes:''});
 let state=await (await api.GET()).json();const sid=state.students[0].id;
 const item={studentId:sid,type:fields.INCIDENT_TYPE,occurredAt:new Date(Date.now()-60000).toISOString(),details:'سقط الطالب في الساحة بحسب المشاهدة.',action:'نقل إلى غرفة المرشد الصحي واستُدعي الهلال الأحمر.',followStatus:'open',extra:{incidentKind:'سقوط',incidentLocation:'الساحة',parentContact:'تم التواصل',parentContactTime:'10:30',ambulanceStatus:'تم الاستدعاء',ambulanceTime:'10:35',transferStatus:'نقل للمستشفى',hospitalName:'مستشفى تجريبي',witnesses:'شاهد تجريبي'}};
 assert.equal((await post('case',{...item,extra:{}})).status,400);assert.equal((await post('case',{...item,extra:{...item.extra,ambulanceTime:'25:00'}})).status,400);
 const saved=await post('case',item);assert.equal(saved.status,200);const id=(await saved.json()).id;
 state=await (await api.GET()).json();let row=state.cases.find(c=>c.id===id);assert.equal(row.details,item.details);assert.equal(fields.readExtra(row.extra).studentName,'طالب واقعة تجريبي');assert.equal(fields.readExtra(row.extra).hospitalName,'مستشفى تجريبي');
 assert.equal((await post('case-edit',{...item,id,revision:row.revision,details:'وصف محدث'})).status,200);assert.equal((await post('case-edit',{...item,id,revision:row.revision})).status,409);
 assert.equal((await post('follow',{id,status:'done',outcome:'تمت متابعة ولي الأمر'})).status,200);state=await (await api.GET()).json();row=state.cases.find(c=>c.id===id);assert.equal(row.outcome,'تمت متابعة ولي الأمر');assert.equal(row.followStatus,'done');
 const b=await (await backup.GET(new Request('https://test.local/api/backup'))).json();assert.ok(b.cases.some(c=>c.id===id&&JSON.parse(c.extra).incidentKind==='سقوط'));assert.equal((await post('restore',b)).status,200);assert.equal((await (await api.GET()).json()).cases.filter(c=>c.id===id).length,1);
 user.email='viewer@test.local';assert.equal((await post('case',item)).status,403);
 assert.ok(!fields.extraRows(fields.INCIDENT_TYPE,{...item.extra,parentContact:'تعذر التواصل'}).some(([label])=>label==='وقت التواصل'));
 console.log('Incident D1 passed: required details, time validation, persistence, student snapshot, revision conflicts, follow-up, backup/restore without duplication, viewer write denial and conditional fields.');
}finally{await mf.dispose();}
