import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const source=ts.createSourceFile('batch-late.ts',readFileSync(new URL('../lib/batch-late.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const functions='const BATCH_CASE_GROUP_SIZE=2;\n'+source.statements.filter(n=>ts.isFunctionDeclaration(n)&&['batchCaseInsertSql','batchCaseGroupSql'].includes(n.name?.text)).map(n=>n.getText(source)).join('\n');
const js=ts.transpile(functions,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}).replace(/export /g,'');
const {batchCaseGroupSql}=new Function('exports',js+';return {batchCaseGroupSql};')({});
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE students(id TEXT PRIMARY KEY); CREATE TABLE cases(id TEXT PRIMARY KEY,student_id TEXT NOT NULL REFERENCES students(id),type TEXT NOT NULL,occurred_at TEXT NOT NULL,details TEXT NOT NULL,action TEXT NOT NULL,extra TEXT NOT NULL,actor TEXT NOT NULL,actor_id TEXT NOT NULL,follow_status TEXT NOT NULL,created_at TEXT NOT NULL,outcome TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,deleted_at TEXT NOT NULL,deleted_by TEXT NOT NULL); PRAGMA foreign_keys=ON;");
for(let i=0;i<12;i++)db.prepare('INSERT INTO students VALUES(?)').run('student-'+i);
const late='التأخر الصباحي';
function params(id,student,type=late,date='2026-10-10T04:03:00.000Z'){return [id,student,type,date,'تفاصيل','إجراء','{}','مدخل تجريبي','actor','none',date,id,student,type,type,date];}
function save(prefix,type=late,date='2026-10-10T04:03:00.000Z'){
 db.exec('BEGIN');try{for(let i=0;i<12;i+=2){const args=Array.from({length:2},(_,j)=>params(prefix+(i+j),'student-'+(i+j),type,date)).flat();assert.equal(args.length,32);db.prepare(batchCaseGroupSql(2)).all(...args);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
save('first-');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,12);
save('first-');save('new-request-');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,12);
// Riyadh date boundary: different UTC dates can be the same local training/school day.
save('same-local-day-',late,'2026-10-09T21:15:00.000Z');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,12);
save('next-day-',late,'2026-10-11T04:00:00.000Z');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,24);
for(const type of ['الاستئذان','المخالفات السلوكية','السلوك الإيجابي','الملاحظات','التواصل مع ولي الأمر','زيارة ولي الأمر']){save(type+'-',type);save(type+'-',type);}
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases').get().n,96);
const before=db.prepare('SELECT * FROM cases ORDER BY id').all();
assert.throws(()=>db.prepare(batchCaseGroupSql(1)).all(...params('invalid','missing-student','الملاحظات')));
assert.deepEqual(db.prepare('SELECT * FROM cases ORDER BY id').all(),before);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cases WHERE outcome IS NULL OR revision IS NULL OR deleted_at IS NULL').get().n,0);
console.log('Passed: 12-person batches, all seven types, retries, duplicates, Riyadh date boundaries, required fields and existing-record preservation.');
