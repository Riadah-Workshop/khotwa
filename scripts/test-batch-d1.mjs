import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const source=ts.createSourceFile('batch-late.ts',readFileSync(new URL('../lib/batch-late.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declarations=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&['batchCaseInsertSql','batchCaseGroupSql'].includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(source)==='BATCH_CASE_GROUP_SIZE')).map(n=>n.getText(source)).join('\n');
const js=ts.transpile(declarations,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
const {batchCaseGroupSql,BATCH_CASE_GROUP_SIZE}=new Function('exports',js+';return {batchCaseGroupSql,BATCH_CASE_GROUP_SIZE:exports.BATCH_CASE_GROUP_SIZE};')({});
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'batch-regression-test'},d1Persist:false});
try{
 const db=await mf.getD1Database('DB');
 await db.prepare('CREATE TABLE cases(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,type TEXT NOT NULL,occurred_at TEXT NOT NULL,details TEXT NOT NULL,action TEXT NOT NULL,extra TEXT NOT NULL,actor TEXT NOT NULL,actor_id TEXT NOT NULL,follow_status TEXT NOT NULL,created_at TEXT NOT NULL,outcome TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,deleted_at TEXT NOT NULL,deleted_by TEXT NOT NULL)').run();
 async function save(prefix,count,type='التأخر الصباحي',date='2026-10-10T12:03:00Z'){
  const commands=[];
  for(let i=0;i<count;i+=BATCH_CASE_GROUP_SIZE){const length=Math.min(BATCH_CASE_GROUP_SIZE,count-i),args=[];for(let j=i;j<i+length;j++)args.push(prefix+j,'student-'+j,type,date,'تفاصيل اختبار','إجراء اختبار','{}','مدخل تجريبي','actor-id','none',date,prefix+j,'student-'+j,type,type,date);commands.push(db.prepare(batchCaseGroupSql(length)).bind(...args));}
  return db.batch(commands);
 }
 const count=async()=>Number(await db.prepare('SELECT COUNT(*) FROM cases').first('COUNT(*)'));
 await save('first-',12);assert.equal(await count(),12);
 await save('first-',12);await save('same-day-',12);assert.equal(await count(),12);
 await save('full-',200);assert.equal(await count(),200);
 await save('full-',200);assert.equal(await count(),200);
 await save('boundary-',200,'التأخر الصباحي','2026-10-09T21:15:00Z');assert.equal(await count(),200);
 for(const type of ['الاستئذان','المخالفات السلوكية','السلوك الإيجابي','الملاحظات','التواصل مع ولي الأمر','زيارة ولي الأمر']){await save(type+'-',12,type);await save(type+'-',12,type);}
 assert.equal(await count(),272);
 const before=await db.prepare('SELECT * FROM cases ORDER BY id').all();
 await assert.rejects(()=>db.batch([db.prepare(batchCaseGroupSql(1)).bind('rollback','student-0','الملاحظات','2026-10-10T12:03:00Z','test','test','{}','actor','actor','none','2026-10-10T12:03:00Z','rollback','student-0','الملاحظات','الملاحظات','2026-10-10T12:03:00Z'),db.prepare('INSERT INTO cases(id) VALUES (?)').bind('invalid')]));
 assert.deepEqual((await db.prepare('SELECT * FROM cases ORDER BY id').all()).results,before.results);
 console.log('D1 passed: 12 and 200 students, seven case types, retry and daily duplicate protection, Riyadh dates, transactional rollback.');
}finally{await mf.dispose();}
