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

 const notifications=load('lib/attendance-notifications.ts');
 const sid=webcrypto.randomUUID(),now=new Date().toISOString();
 await DB.prepare("INSERT INTO students(id,name,grade,classroom,phone,created_at,updated_at) VALUES (?,'طالب اختباري','الرابع','أ','0500000000',?,?)").bind(sid,now,now).run();
 const dates=['2026-10-01','2026-10-02'];
 for(const date of dates)assert.equal((await post('attendance',{date,grade:'الرابع',classroom:'أ',revision:0,records:[{studentId:sid,status:'absent',notes:'ملاحظة محفوظة'}]})).status,200);
 let data=await snapshot();const [a,b]=data.attendance.sort((x,y)=>x.date.localeCompare(y.date));
 assert.equal(notifications.attendanceNotification(a,[]).status,'none');
 assert.equal((await post('attendance-notification',{attendanceId:'missing',status:'sent',message:'اختبار'})).status,409);
 assert.equal((await post('attendance-notification',{attendanceId:a.id,status:'opened',message:'رسالة اختبار'})).status,200);
 data=await snapshot();assert.equal(notifications.attendanceNotification(a,data.absenceEvents).status,'opened');assert.equal(notifications.attendanceNotification(b,data.absenceEvents).status,'none');
 assert.equal((await post('attendance-notification',{attendanceId:a.id,status:'sent',message:'رسالة اختبار',actor:'spoof'})).status,200);
 assert.equal((await post('attendance-notification',{attendanceId:a.id,status:'opened',message:'رسالة اختبار'})).status,200);
 data=await snapshot();assert.equal(notifications.attendanceNotification(a,data.absenceEvents).status,'sent');assert.equal(notifications.attendanceNotification(b,data.absenceEvents).status,'none');assert.ok(data.absenceEvents.every(e=>e.actor===user.displayName));assert.ok(data.attendance.every(r=>r.notes==='ملاحظة محفوظة'));
 const saved=await (await backup.GET(new Request('https://audit.test/api/backup'))).json();assert.equal(saved.absenceEvents.length,3);assert.equal((await post('restore',saved)).status,200);
 const r=data.attendanceRounds.find(r=>r.id===b.roundId);assert.equal((await post('attendance-late',{roundId:b.roundId,studentId:sid,revision:r.revision})).status,200);
 assert.equal((await post('attendance-notification',{attendanceId:b.id,status:'sent',message:'رسالة اختبار'})).status,409);
 assert.equal(notifications.attendanceNotification(a,[{studentId:sid,kind:'attendance-notification-sent',notes:'broken',createdAt:now,actor:'x'}]).status,'none');
 console.log('Attendance notifications passed: per-date tracking, opened remains pending, manual sent confirmation, no downgrade, server actor, absence-only guards, preserved records and backup/restore.');
}finally{await mf.dispose();}
