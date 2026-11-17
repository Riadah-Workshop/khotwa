import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const modules=new Map();let DB,schema;const user={userId:'fixture-user',displayName:'المسجل التجريبي',email:'fixture@example.test'};
function load(file){const absolute=path.resolve(file);if(modules.has(absolute))return modules.get(absolute);const exports={};modules.set(absolute,exports);const js=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','crypto',js)(name=>{if(name==='cloudflare:workers')return {env:{DB}};if(name.endsWith('chatgpt-auth'))return {getChatGPTUser:async()=>user};if(name==='../../../db')return {getDb:()=>require('drizzle-orm/d1').drizzle(DB,{schema})};if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name)+'.ts');return require(name);},exports,webcrypto);return exports;}
try{
 DB=await mf.getD1Database('DB');
 const apply=async(file)=>{for(const statement of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(statement.trim())await DB.prepare(statement).run();};
 const files=fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort();
 for(const f of files.filter(f=>f<'0011'))await apply(f);
 const now=new Date().toISOString();
 await DB.prepare('INSERT INTO students(id,name,grade,classroom,guardian,phone,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('fixture-student','طالب اختبار','الرابع','أ','ولي أمر','0500000000','ملاحظة محفوظة',1,now,now).run();
 await DB.prepare('INSERT INTO student_identities VALUES(?,?,?,?)').bind('fixture-student','1234567890','تجربة',now).run();
 await DB.prepare('INSERT INTO student_identity_reviews(id,source_name,source_grade,source_classroom,source_number,reason,updated_at) VALUES(?,?,?,?,?,?,?)').bind('fixture-review','طالب اختبار','الرابع','أ','1234567890','تجربة',now).run();
 const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'student_identit%' AND name NOT LIKE '_cf_%'").all()).results.map(x=>x.name);
 const snapshot=async()=>{const rows={};for(const n of names)rows[n]=(await DB.prepare('SELECT * FROM '+n).all()).results;return rows;};
 const before=await snapshot();for(const f of files.filter(f=>f>='0011'))await apply(f);
 assert.deepEqual(await snapshot(),before,'removal touches no other student, phone, case or attendance table');
 assert.equal((await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('student_identities','student_identity_reviews')").all()).results.length,0);
 schema=load('db/schema.ts');const route=load('app/api/data/route.ts'),backup=load('app/api/backup/route.ts');
 for(const name of ['student-identities','identity-reviews','identity-import'])for(const method of ['GET','POST'])assert.equal((await load('app/api/'+name+'/route.ts')[method]()).status,410);
 const exported=await (await backup.GET(new Request('https://local.test/api/backup'))).json();
 assert.ok(!('studentIdentities' in exported)&&!('identityReviews' in exported));
 const oldBackup={...exported,studentIdentities:[{studentId:'fixture-student',identityNumber:'1234567890'}],identityReviews:[{sourceNumber:'1234567890'}]};
 const response=await route.POST(new Request('https://local.test/api/data',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://local.test'},body:JSON.stringify({op:'restore',data:oldBackup})}));
 assert.equal(response.status,200,await response.text());assert.deepEqual(await snapshot(),before,'old backup does not restore removed IDs or modify existing data');
 assert.equal((await route.GET()).status,200);assert.equal((await backup.GET(new Request('https://local.test/api/backup'))).status,200);
 console.log('Passed: identity tables removed; all other tables preserved; old endpoints permanently closed; backup excludes IDs; old backup restores safely without reintroducing IDs.');
}finally{await mf.dispose();}
