import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {SCHOOL_TABLES,tableName,rewriteSchoolSql,tenantPrefix} from '../lib/school-sql.ts';
const sql=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));
sql.exec('PRAGMA foreign_keys=ON');
const id='aa112233bb44',prefix=tenantPrefix(id);
const schema=sql.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all();
const tables=schema.filter(r=>r.type==='table'&&SCHOOL_TABLES.includes(r.name));
assert.equal(tables.length,SCHOOL_TABLES.length);
for(const row of tables)sql.exec(rewriteSchoolSql(row.sql,id));
for(const row of schema.filter(r=>r.type==='index'&&SCHOOL_TABLES.includes(r.tbl_name))){
 const renamed=row.sql.replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?)(["`\[]?)([\w]+)(["`\]]?)/i,(_a,head,open,name,close)=>head+open+prefix+name+close);
 sql.exec(rewriteSchoolSql(renamed,id));
}
sql.prepare("INSERT INTO khotwa_schools(id,code,name,active,created_at) VALUES(?,?,?,?,?)").run(id,'SCH-TEST','Test school',1,new Date().toISOString());
sql.prepare(`INSERT INTO "${tableName(id,'students')}"(id,name,grade,classroom,guardian,phone,notes,created_at,updated_at) VALUES('st1','Test Student','G5','A','','','','2026-11-22','2026-11-22')`).run();
sql.prepare(`INSERT INTO "${tableName(id,'cases')}"(id,student_id,type,occurred_at,details,action,actor,actor_id,created_at) VALUES('c1','st1','Test case','2026-11-22T01:00:00Z','Test','Test','Test','Test','2026-11-22')`).run();
const parents=new Map();
for(const name of SCHOOL_TABLES)parents.set(name,sql.prepare(`PRAGMA foreign_key_list("${tableName(id,name)}")`).all().map(r=>r.table.replace(prefix,'')));
const visited=new Set(),order=[];
function visit(name){if(visited.has(name))return;visited.add(name);for(const dep of parents.get(name)||[])if(parents.has(dep))visit(dep);order.push(name);}
for(const name of SCHOOL_TABLES)visit(name);
for(const name of [...order].reverse())sql.exec(`DROP TABLE IF EXISTS "${tableName(id,name)}"`);
sql.prepare('DELETE FROM khotwa_schools WHERE id=?').run(id);
assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM students').get().total,0);
assert.equal(sql.prepare("SELECT COUNT(*) AS total FROM khotwa_schools WHERE id='default'").get().total,1);
assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM sqlite_master WHERE name LIKE ?').get(prefix+'%').total,0);
sql.close();console.log('School deletion schema test passed: 23 isolated tables, foreign-key-aware deletion and legacy MAIN preservation');
