import {getKhotwaAccess} from '../../../chatgpt-auth';
import {getTenantDb} from '../../../../lib/school-tenancy';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const date=/^\d{4}-\d{2}-\d{2}$/;
export async function GET(req:Request){
 const access=await getKhotwaAccess();
 if(!access||!['manager','main_admin'].includes(access.role))return json({error:'Access denied'},403);
 const params=new URL(req.url).searchParams;
 const to=params.get('to')||new Date().toISOString().slice(0,10);
 const from=params.get('from')||new Date(Date.now()-29*86400000).toISOString().slice(0,10);
 if(!date.test(from)||!date.test(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return json({error:'Select a valid reporting period (up to one year)'},400);
 try{
  const db=getTenantDb();
  const [school,students,grades,attendance,categories,trend,followups]=await Promise.all([
   env.DB!.prepare('SELECT name,code FROM khotwa_schools WHERE id=?').bind(access.schoolId).first<{name:string;code:string}>(),
   db.prepare('SELECT COUNT(*) AS count FROM students WHERE active=1').first<{count:number}>(),
   db.prepare('SELECT grade AS name,COUNT(*) AS value FROM students WHERE active=1 GROUP BY grade ORDER BY value DESC LIMIT 20').all(),
   db.prepare('SELECT status AS name,COUNT(*) AS value FROM attendance WHERE date BETWEEN ? AND ? GROUP BY status ORDER BY value DESC').bind(from,to).all(),
   db.prepare("SELECT type AS name,COUNT(*) AS value FROM cases WHERE deleted_at='' AND substr(occurred_at,1,10) BETWEEN ? AND ? GROUP BY type ORDER BY value DESC").bind(from,to).all(),
   db.prepare("SELECT substr(occurred_at,1,7) AS month,COUNT(*) AS value FROM cases WHERE deleted_at='' AND substr(occurred_at,1,10) BETWEEN ? AND ? GROUP BY substr(occurred_at,1,7) ORDER BY month").bind(from,to).all(),
   db.prepare("SELECT COUNT(*) AS count FROM cases WHERE deleted_at='' AND follow_status='open'").first<{count:number}>(),
  ]);
  return json({schoolName:school?.name||'',schoolCode:school?.code||'',from,to,students:students?.count||0,openFollowups:followups?.count||0,grades:grades.results,attendance:attendance.results,categories:categories.results,trend:trend.results});
 }catch(e){console.error('khotwa_manager_overview_failed',e instanceof Error?e.name:'unknown');return json({error:'Unable to load school reports'},503);}
}
