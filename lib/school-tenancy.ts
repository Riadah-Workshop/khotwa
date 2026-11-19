/** Request-scoped school database partitioning for the existing D1 schema.
 *
 * Existing school data remains in the original tables (school id: default).
 * New schools get their own *physical* copies of every application table.
 * Every Drizzle statement and raw D1 statement is rewritten on the server to
 * refer to the active school's tables. Never select a school using client input.
 * The trusted school id is set only by the signed-session gateway.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {env} from 'cloudflare:workers';

import {LEGACY_SCHOOL_ID,tenantPrefix,tableName,rewriteSchoolSql,SCHOOL_TABLES} from './school-sql';
export {LEGACY_SCHOOL_ID,tenantPrefix,tableName,rewriteSchoolSql,SCHOOL_TABLES} from './school-sql';
export type SchoolRole='main_admin'|'deputy'|'parent';
export type SchoolContext={schoolId:string;role:SchoolRole;identity:string};
const context=new AsyncLocalStorage<SchoolContext>();
export function runWithSchool<T>(school:SchoolContext,fn:()=>T):T {
 tenantPrefix(school.schoolId);
 return context.run(school,fn);
}
export function getSchoolContext():SchoolContext {
 const school=context.getStore();
 if(!school)throw new Error('No authenticated school request context');
 return school;
}
// Apply only to SQL tokens; values inside quoted SQL strings and comments are untouched.
// Drizzle quotes identifiers, whereas older raw SQL mostly uses bare identifiers.
export function getTenantDb():D1Database {
 const school=getSchoolContext(),database=env.DB;
 if(!database)throw new Error('DB binding unavailable');
 if(school.schoolId===LEGACY_SCHOOL_ID)return database;
 // Return real prepared statements so D1 batch() and Drizzle continue working.
 return {
  prepare(query:string){return database.prepare(rewriteSchoolSql(query,school.schoolId));},
  batch(statements:D1PreparedStatement[]){return database.batch(statements);},
  exec(query:string){return database.exec(rewriteSchoolSql(query,school.schoolId));},
  dump(){throw new Error('Full database export not permitted for school accounts');},
 } as unknown as D1Database;
}

/** Clone *schema only*, never records. Includes foreign keys and indexes.
 * Run when creating a school, after standard migrations have been applied.
 * DB access remains server-side; school id never comes from a route parameter.
 */
export async function provisionSchool(database:D1Database,schoolId:string):Promise<void>{
 if(schoolId===LEGACY_SCHOOL_ID)throw new Error('Default school already provisioned');
 const prefix=tenantPrefix(schoolId);
 const schema=await database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all<{type:string;name:string;tbl_name:string;sql:string}>();
 const tables=schema.results.filter(r=>r.type==='table'&&SCHOOL_TABLES.includes(r.name));
 if(tables.length!==SCHOOL_TABLES.length)throw new Error(`Incomplete base schema: expected ${SCHOOL_TABLES.length}, found ${tables.length}. Apply migrations first.`);
 const sqls=tables.map(t=>rewriteSchoolSql(t.sql,schoolId));
 for(const idx of schema.results.filter(r=>r.type==='index'&&SCHOOL_TABLES.includes(r.tbl_name))){
  // SQLite index names are database-wide. Rename while retaining original index definition.
  const withIndex=idx.sql.replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?)(["`\[]?)([\w]+)(["`\]]?)/i,(_all:string,head:string,open:string,name:string,close:string)=>head+open+prefix+name+close);
  sqls.push(rewriteSchoolSql(withIndex,schoolId));
 }
 // Execute one at a time because SQLite DDL may invalidate prepared statements.
 // If one statement fails, the school is not made active by the calling admin API.
 for(const sql of sqls)await database.prepare(sql).run();
}

