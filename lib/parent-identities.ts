import {tableName} from './school-sql.ts';
import {parentPhone} from './parent-view.ts';

/** Global credentials + indexed membership; school-local enabled grant remains
 * the final authorization check, so a membership alone never reveals students.
 */
export async function parentLinkedSchools(db:D1Database,rawPhone:string){
 const phone=parentPhone(rawPhone);
 if(!phone)return [];
 const memberships=(await db.prepare('SELECT s.id,s.name FROM khotwa_parent_memberships m JOIN khotwa_schools s ON s.id=m.school_id WHERE m.phone=? AND m.enabled=1 AND s.active=1 ORDER BY s.name').bind(phone).all<{id:string;name:string}>()).results;
 const linked:{id:string;name:string}[]=[];
 for(const school of memberships){
  const grant=await db.prepare(`SELECT enabled FROM "${tableName(school.id,'parent_grants')}" WHERE phone=?`).bind(phone).first<{enabled:number}>();
  if(grant?.enabled===1)linked.push(school);
 }
 return linked;
}
