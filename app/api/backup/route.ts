import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {canAccessCare} from '../../../lib/care-access';
export const dynamic='force-dynamic';
const TABLES=['students','cases','contacts','followups','settings','attendance','attendance_rounds','attendance_audit','absence_followups','absence_events','case_revisions','student_families','school_trips','school_trip_students','school_tasks','school_evidence','desk_closures','student_movements'] as const;
const KEYS=['students','cases','contacts','followups','settings','attendance','attendanceRounds','attendanceAudit','absenceFollowups','absenceEvents','caseRevisions','studentFamilies','schoolTrips','schoolTripStudents','schoolTasks','schoolEvidence','deskClosures','studentMovements'];
function equalSecret(a:string,b:string){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export async function GET(req:Request){
 const privateEnv=env as unknown as {BACKUP_EXPORT_KEY?:string;BACKUP_EXPORT_EXPIRES_AT?:string};
 const supplied=req.headers.get('X-Backup-Export-Key')||'';
 const serviceAllowed=!!privateEnv.BACKUP_EXPORT_KEY&&Date.parse(privateEnv.BACKUP_EXPORT_EXPIRES_AT||'')>Date.now()&&equalSecret(supplied,privateEnv.BACKUP_EXPORT_KEY);
 const user=await getChatGPTUser();if(!serviceAllowed&&!user)return Response.json({error:'يرجى تسجيل الدخول'},{status:401});
 try{
  // D1 batch provides one transactional read of all tables, including complete audit summaries.
  const tables:string[]=[...TABLES,...(canAccessCare(user?.email)?['student_care','care_intake']:[])],keys=[...KEYS,...(canAccessCare(user?.email)?['studentCare','careIntake']:[])];
  const result=await env.DB!.batch(tables.map(table=>env.DB!.prepare(`SELECT * FROM ${table}`)));
  const data:Record<string,unknown>={format:'shuoon-independent-v1',exportedAt:new Date().toISOString()};
  for(let i=0;i<tables.length;i++){
   const rows=result[i].results as Record<string,unknown>[];
   data[keys[i]]=tables[i]==='settings'?Object.fromEntries(rows.map(row=>[row.id,row.value])):rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value])));
  }
  return Response.json(data,{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="sijillati-backup.json"','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'تعذر إنشاء النسخة الاحتياطية. حاول مجددًا.'},{status:500,headers:{'Cache-Control':'no-store'}});}
}
