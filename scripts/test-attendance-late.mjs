import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const modules=new Map();let DB,schema;const user={userId:'fixture-user',displayName:'المسجل التجريبي',email:'fixture@example.test'};
function load(file){const absolute=path.resolve(file);if(modules.has(absolute))return modules.get(absolute);const exports={};modules.set(absolute,exports);const js=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','crypto',js)(name=>{if(name==='cloudflare:workers')return {env:{DB}};if(name.endsWith('chatgpt-auth'))return {getChatGPTUser:async()=>user,getKhotwaAccess:async()=>user?{role:'main_admin',schoolId:'default'}:null,denyReadOnlyWrite:async()=>null};if(name==='../../../db')return {getDb:()=>require('drizzle-orm/d1').drizzle(DB,{schema})};if(name.endsWith('school-tenancy'))return {...load(path.resolve(path.dirname(absolute),name)+'.ts'),getSchoolContext:()=>({schoolId:'default',role:'main_admin',identity:'test'}),getTenantDb:()=>DB};if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name)+'.ts');return require(name);},exports,webcrypto);return exports;}
try{
 DB=await mf.getD1Database('DB');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){const sql=fs.readFileSync('drizzle/'+file,'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await DB.prepare(statement).run();}
 schema=load('db/schema.ts');const helpers=load('lib/attendance.ts'),route=load('app/api/data/route.ts');
 const db=require('drizzle-orm/d1').drizzle(DB,{schema});const ids=[webcrypto.randomUUID(),webcrypto.randomUUID()],now=new Date().toISOString();
 await db.insert(schema.students).values(ids.map((id,i)=>({id,name:'طالب تجريبي '+i,grade:'الرابع',classroom:'أ',guardian:'',phone:'',notes:'',active:1,createdAt:now,updatedAt:now})));
 const post=(op,data)=>route.POST(new Request('https://local.test/api/data',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://local.test'},body:JSON.stringify({op,data})}));
 const dates=['2026-10-06','2026-10-07','2026-10-08'];
 for(const date of dates){const r=await post('attendance',{date,grade:'الرابع',classroom:'أ',revision:0,records:[{studentId:ids[0],status:'absent',notes:'ملاحظة محفوظة'},{studentId:ids[1],status:'present',notes:'ملاحظة زميله'}]});assert.equal(r.status,200,await r.text());}
 let follow=await DB.prepare('SELECT * FROM absence_followups WHERE student_id=?').bind(ids[0]).first();assert.equal(follow.total_count,3);assert.equal(follow.status,'open');
 const rid=helpers.roundId(dates[2],'الرابع','أ');const correction={roundId:rid,studentId:ids[0],revision:1};let response=await post('attendance-late',correction);assert.equal(response.status,200);let result=await response.json();assert.equal(result.present,2);assert.equal(result.late,1);assert.equal(result.absent,0);
 let rows=(await DB.prepare('SELECT * FROM attendance WHERE round_id=?').bind(rid).all()).results;assert.equal(rows.find(x=>x.student_id===ids[0]).status,'late');assert.equal(rows.find(x=>x.student_id===ids[0]).notes,'ملاحظة محفوظة');assert.equal(rows.find(x=>x.student_id===ids[1]).status,'present');assert.equal(rows.find(x=>x.student_id===ids[1]).notes,'ملاحظة زميله');
 follow=await DB.prepare('SELECT * FROM absence_followups WHERE student_id=?').bind(ids[0]).first();assert.equal(follow.total_count,2);assert.equal(follow.status,'done');assert.equal(follow.last_absent,dates[1]);
 const audit=(await DB.prepare('SELECT * FROM attendance_audit WHERE round_id=? ORDER BY revision').bind(rid).all()).results;assert.equal(audit.length,2);assert.equal(JSON.parse(audit[0].summary)[0].status,'absent');assert.equal(JSON.parse(audit[1].summary)[0].status,'late');
 assert.equal((await post('attendance-late',correction)).status,409);assert.equal((await post('attendance-late',{...correction,revision:2,studentId:ids[1]})).status,400);
 response=await post('attendance-late',{...correction,revision:2});assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);
 response=await post('attendance-scan',{date:dates[2],code:helpers.barcodeForStudent(ids[0])});assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);
 assert.equal((await post('attendance',{date:dates[2],grade:'الرابع',classroom:'أ',revision:2,records:rows.map(r=>({studentId:r.student_id,status:r.status,notes:r.notes}))})).status,200);
 assert.equal((await DB.prepare('SELECT status FROM attendance WHERE student_id=? AND date=?').bind(ids[0],dates[2]).first()).status,'late');
 const snapshot=await (await route.GET()).json();assert.equal((await post('restore',{...snapshot,format:'shuoon-independent-v1'})).status,200,'restore accepts late attendance');
 assert.equal(helpers.isPresent('late'),true);assert.equal(helpers.isPresent('absent'),false);assert.equal(helpers.attendanceLabel('late'),'حضر متأخرًا');
 assert.equal(helpers.attendanceInput.safeParse({date:dates[2],grade:'الرابع',classroom:'أ',revision:2,records:[{studentId:ids[0],status:'late',notes:''}]}).success,true);
 for(let i=0;i<10;i++){const date=new Date(Date.UTC(2026,5,7+i*7)).toISOString().slice(0,10);const response=await post('attendance',{date,grade:'الرابع',classroom:'أ',revision:0,records:[{studentId:ids[0],status:'present',notes:''},{studentId:ids[1],status:'absent',notes:'غياب متفرق'}]});assert.equal(response.status,200,await response.text());const scattered=await DB.prepare('SELECT * FROM absence_followups WHERE student_id=?').bind(ids[1]).first();if(i<9)assert.equal(scattered,null,'scattered absence below ten does not create follow-up');else assert.equal(scattered.total_count,10);}
 console.log('D1 route passed: absent-to-late correction, presence totals, preserved notes and other students, absence follow-up correction, audit history, revision conflict, idempotence, barcode preservation and backup restore.');
}finally{await mf.dispose();}
