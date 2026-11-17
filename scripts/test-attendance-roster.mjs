import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const modules=new Map();let DB,schema;const user={userId:'fixture-user',displayName:'المسجل التجريبي',email:'fixture@example.test'};
function load(file){const absolute=path.resolve(file);if(modules.has(absolute))return modules.get(absolute);const exports={};modules.set(absolute,exports);const js=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','crypto',js)(name=>{if(name==='cloudflare:workers')return {env:{DB}};if(name.endsWith('chatgpt-auth'))return {getChatGPTUser:async()=>user,denyReadOnlyWrite:async()=>null};if(name==='../../../db')return {getDb:()=>require('drizzle-orm/d1').drizzle(DB,{schema})};if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name)+'.ts');return require(name);},exports,webcrypto);return exports;}
try{
 DB=await mf.getD1Database('DB');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){const sql=fs.readFileSync('drizzle/'+file,'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await DB.prepare(statement).run();}
 schema=load('db/schema.ts');const helpers=load('lib/attendance.ts'),route=load('app/api/data/route.ts');
 const db=require('drizzle-orm/d1').drizzle(DB,{schema}),sync=load('lib/attendance-roster-sync.ts').syncTodayRosters;
 const a=webcrypto.randomUUID(),b=webcrypto.randomUUID(),newStudent=webcrypto.randomUUID(),now=new Date().toISOString();
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),past=new Date(new Date(day+'T00:00:00Z').getTime()-86400000).toISOString().slice(0,10);
 const student=(id,name,classroom)=>({id,name,grade:'الرابع',classroom,guardian:'',phone:'',notes:'',active:1,createdAt:now,updatedAt:now});
 await db.insert(schema.students).values([student(a,'طالب نقل تجريبي','أ'),student(b,'طالب باقٍ تجريبي','ب')]);
 const post=(op,data)=>route.POST(new Request('https://local.test/api/data',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://local.test'},body:JSON.stringify({op,data})}));
 for(const date of [past,day]){assert.equal((await post('attendance',{date,grade:'الرابع',classroom:'أ',revision:0,records:[{studentId:a,status:'absent',notes:'ملاحظة محفوظة'}]})).status,200);assert.equal((await post('attendance',{date,grade:'الرابع',classroom:'ب',revision:0,records:[{studentId:b,status:'late',notes:'حضر متأخرًا'}]})).status,200);}
 const oldPast=(await DB.prepare('SELECT * FROM attendance WHERE date=?').bind(past).all()).results;
 const oldToday=await DB.prepare('SELECT * FROM attendance WHERE student_id=? AND date=?').bind(a,day).first();
 assert.equal((await post('attendance-notification',{attendanceId:oldToday.id,status:'sent',message:'رسالة تجريبية مؤكدة'})).status,200);
 await DB.prepare('UPDATE students SET classroom=? WHERE id=?').bind('ب',a).run();await db.insert(schema.students).values(student(newStudent,'طالب أضيف اليوم','ب'));
 const r=await post('attendance-roster-sync',{});assert.equal(r.status,200,await r.text());
 const moved=await DB.prepare('SELECT * FROM attendance WHERE student_id=? AND date=?').bind(a,day).first();assert.equal(moved.classroom,'ب');assert.equal(moved.round_id,helpers.roundId(day,'الرابع','ب'));for(const key of ['id','status','notes','actor','updated_at'])assert.equal(moved[key],oldToday[key]);
 assert.deepEqual((await DB.prepare('SELECT * FROM attendance WHERE date=?').bind(past).all()).results,oldPast);
 assert.equal((await DB.prepare('SELECT * FROM attendance WHERE student_id=? AND date=?').bind(newStudent,day).first()).status,'unmarked');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM attendance WHERE student_id=? AND date=?').bind(a,day).first()).n,1);
 const rounds=(await DB.prepare('SELECT * FROM attendance_rounds WHERE date=?').bind(day).all()).results;assert.equal(rounds.find(r=>r.classroom==='أ').total,0);assert.equal(rounds.find(r=>r.classroom==='ب').total,3);assert.equal(rounds.find(r=>r.classroom==='ب').completed,0);
 const events=(await DB.prepare('SELECT * FROM absence_events').all()).results;assert.equal(events.length,1);assert.equal(JSON.parse(events[0].notes).attendanceId,moved.id);
 const after=(await DB.prepare('SELECT * FROM attendance').all()).results;assert.equal((await (await post('attendance-roster-sync',{})).json()).changed,0);assert.deepEqual((await DB.prepare('SELECT * FROM attendance').all()).results,after);
 const all=await (await route.GET()).json();assert.equal((await post('restore',{...all,format:'shuoon-independent-v1'})).status,200,'empty source rounds retained in backup restore');
 await DB.prepare('UPDATE students SET classroom=? WHERE id=?').bind('أ',a).run();
 // A concurrent claim on the destination must abort the entire reconciliation.
 const before=(await DB.prepare('SELECT * FROM attendance').all()).results;
 let injected=false;const raceDB={prepare:q=>DB.prepare(q),batch:async commands=>{if(!injected&&commands.length>3){injected=true;await DB.prepare('UPDATE attendance_rounds SET revision=revision+1 WHERE id=?').bind(helpers.roundId(day,'الرابع','أ')).run();}return DB.batch(commands);}};
 await assert.rejects(()=>sync(raceDB,day,'مسؤول','fixture-user'));assert.deepEqual((await DB.prepare('SELECT * FROM attendance').all()).results,before,'conflicting sync rolls back all row movements');
 assert.equal((await post('attendance-roster-sync',{})).status,200);assert.equal((await DB.prepare('SELECT classroom FROM attendance WHERE student_id=? AND date=?').bind(a,day).first()).classroom,'أ');
 console.log('Roster sync passed: transferred student visible in new class, empty source, preserved status/notes/IDs/history/notification, new pupils unmarked, idempotence, backup restore and atomic conflict rollback.');
}finally{await mf.dispose();}
