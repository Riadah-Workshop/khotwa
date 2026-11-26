import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
function load(file){const exports={};new Function('exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,require);return exports;}
const w=load('lib/school-work.ts'),files=load('lib/evidence-files.ts');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'school-work-test'},d1Persist:false});
try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').filter(x=>x.trim()))await db.prepare(sql).run();
 const columns=(await db.prepare('PRAGMA table_info(students)').all()).results;
 const inserts=[];for(let i=0;i<500;i++){const values={id:'s'+i,name:'أحمد '+i,grade:'السادس',classroom:'أ',guardian:'محمد',phone:'0500000000',notes:'',active:1,updated_at:new Date().toISOString(),created_at:new Date().toISOString()};const entries=columns.filter(c=>c.name in values).map(c=>[c.name,values[c.name]]);inserts.push(db.prepare('INSERT INTO students('+entries.map(e=>e[0])+') VALUES('+entries.map(()=>'?')+')').bind(...entries.map(e=>e[1])));}
 for(let i=0;i<inserts.length;i+=50)await db.batch(inserts.slice(i,i+50));
 const call=(op,data)=>w.saveSchoolWork(db,'موظف اختبار',{op,data}),trip={id:crypto.randomUUID(),title:'زيارة تعليمية',destination:'المتحف',eventDate:'2026-11-01',meetingTime:'08:00',returnTime:'12:00',supervisor:'المعلم محمد',details:'إحضار الماء',studentIds:Array.from({length:500},(_,i)=>'s'+i)};
 await call('trip-create',trip);await call('trip-create',trip);let data=await w.schoolWorkData(db);assert.equal(data.trips.length,1);assert.equal(data.participants.length,500);assert.ok(data.participants.every(s=>s.response==='pending'));
 const row=data.participants[0];assert.match(w.tripMessage(data.trips[0],row,'مدرسة الحرمين'),/يرجى الرد/);assert.equal((await w.schoolWorkData(db)).participants[0].response,'pending');
 await assert.rejects(()=>call('trip-response',{...row,response:'approved',source:''}));await call('trip-response',{...row,response:'approved',source:'paper'});await assert.rejects(()=>call('trip-response',{...row,response:'declined',source:'whatsapp'}),e=>e.status===409);
 await call('trip-close',{id:trip.id,revision:1,status:'closed'});await assert.rejects(()=>call('trip-response',{...row,revision:2,response:'declined',source:'paper'}),e=>e.status===409);
 await assert.rejects(()=>call('trip-create',{...trip,id:crypto.randomUUID(),studentIds:['missing']}));assert.equal((await w.schoolWorkData(db)).trips.length,1);
 const task={id:crypto.randomUUID(),studentId:'s0',caseId:null,title:'متابعة الطالب',dueDate:'2026-10-28',responsible:'الوكيل',notes:'موعد اتصال'};await call('task-save',task);await assert.rejects(()=>call('task-status',{id:task.id,revision:1,status:'done',outcome:''}));await call('task-status',{id:task.id,revision:1,status:'done',outcome:'تم التواصل'});await assert.rejects(()=>call('task-save',{...task,revision:1}));
 assert.equal(w.scheduledGroup({status:'open',dueDate:'2026-10-26'},'2026-10-27'),'overdue');assert.equal(w.riyadhSchoolToday(new Date('2026-10-27T22:00:00Z')),'2026-10-28');assert.equal(w.schoolDate('2026-02-30'),false);
 const caseId='old-closed-case';await db.prepare('INSERT INTO cases(id,student_id,type,occurred_at,details,action,actor,actor_id,created_at,follow_status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(caseId,'s0','الملاحظات','2026-09-01T08:00:00Z','تفاصيل سابقة','إجراء سابق','موظف','tester','2026-09-01T08:00:00Z','done').run();
 const beforeCase=await db.prepare('SELECT * FROM cases WHERE id=?').bind(caseId).first();
 const linked={id:crypto.randomUUID(),studentId:'s0',caseId,title:'شاهد حالة قديمة',domain:'reports',evidenceDate:'2026-10-27',notes:'مستند مؤيد',url:''};await call('evidence-save',linked);await call('evidence-save',linked);
 assert.equal((await w.schoolWorkData(db)).evidence.filter(e=>e.caseId===caseId).length,1);assert.deepEqual(await db.prepare('SELECT * FROM cases WHERE id=?').bind(caseId).first(),beforeCase);
 for(const bad of [{studentId:'s1',caseId},{studentId:null,caseId},{studentId:'s0',caseId:'missing'}])await assert.rejects(()=>call('evidence-save',{...linked,...bad,id:crypto.randomUUID()}));
 await db.prepare("UPDATE cases SET deleted_at='2026-10-27' WHERE id=?").bind(caseId).run();await assert.rejects(()=>call('evidence-save',{...linked,id:crypto.randomUUID()}));await db.prepare("UPDATE cases SET deleted_at='' WHERE id=?").bind(caseId).run();
 const evidence={id:crypto.randomUUID(),studentId:'s0',title:'تقرير المتابعة',domain:'reports',evidenceDate:'2026-10-27',notes:'شاهد أصلي',url:'https://example.com/report'};await call('evidence-save',evidence);await assert.rejects(()=>call('evidence-save',{...evidence,id:crypto.randomUUID(),url:'javascript:alert(1)'}));await call('evidence-archive',{id:evidence.id,revision:1,archived:true});
 data=await w.schoolWorkData(db);const backup={schoolTrips:data.trips,schoolTripStudents:data.participants,schoolTasks:data.tasks,schoolEvidence:data.evidence};assert.equal((await w.restoreSchoolWork(db,backup)).added,0);
 const restoredEvidence={...data.evidence.find(e=>e.caseId===caseId),id:crypto.randomUUID()};assert.equal((await w.restoreSchoolWork(db,{schoolEvidence:[restoredEvidence]})).added,1);await assert.rejects(()=>w.restoreSchoolWork(db,{schoolEvidence:[{...restoredEvidence,id:crypto.randomUUID(),studentId:'s1'}]}));
 const legacyEvidence={...restoredEvidence,id:crypto.randomUUID()};delete legacyEvidence.caseId;assert.equal((await w.restoreSchoolWork(db,{schoolEvidence:[legacyEvidence]})).added,1);
 const newTask={...data.tasks[0],id:crypto.randomUUID(),studentId:'missing'};await assert.rejects(()=>w.restoreSchoolWork(db,{schoolTasks:[newTask]}));assert.equal((await w.schoolWorkData(db)).tasks.length,1);
 assert.equal((await w.restoreSchoolWork(db,{schoolTasks:[{...newTask,studentId:'s0'}]})).added,1);assert.equal(files.evidenceMime(new TextEncoder().encode('%PDF-1.7')),'application/pdf');assert.equal(files.evidenceMime(new TextEncoder().encode('<script>')),'');assert.ok(!files.evidenceFileName('../bad\nname.pdf').includes('/'));
 await assert.rejects(()=>call('activity-save',{}));await assert.rejects(()=>call('activity-complete',{}));await assert.rejects(()=>call('evidence-save',{...evidence,id:crypto.randomUUID(),tripId:trip.id}));
 const simple={...trip,id:crypto.randomUUID(),destination:'',departureTime:'08:30',studentIds:['s0']};await call('trip-create',simple);const saved=(await w.schoolWorkData(db)).trips.find(t=>t.id===simple.id);assert.equal(saved.departureTime,'08:30');assert.equal(saved.destination,'');assert.match(w.tripMessage(saved,row,'مدرسة'),/الانطلاق: [٨8]:[٣3][٠0] (صباحًا|AM)/);await assert.rejects(()=>call('trip-create',{...simple,id:crypto.randomUUID(),departureTime:'07:00'}));
 console.log('Simple consents passed: 500 students, consent independence, print data, notes, departure time and time-order validation; activity/evidence operations blocked; other schoolwork unchanged.');
}finally{await mf.dispose();}
