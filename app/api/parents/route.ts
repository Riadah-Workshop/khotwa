import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {denyReadOnlyWrite,getChatGPTUser,getKhotwaAccess} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {getTenantDb} from '../../../lib/school-tenancy';
import {hashPassword,temporaryPassword} from '../../../lib/account-security';
import {parentPhone} from '../../../lib/parent-view';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
// The original external parent portal remains an optional legacy integration,
// but new Khotwa parent accounts are always managed locally per school.
export async function GET(){
 const user=await getChatGPTUser(),access=await getKhotwaAccess();
 if(!user||!access||access.role==='parent')return json({error:'يرجى تسجيل الدخول'},401);
 try{
  const db=getTenantDb(),school=await env.DB!.prepare('SELECT code,name FROM khotwa_schools WHERE id=?').bind(access.schoolId).first<{code:string;name:string}>();
  const grants=await db.prepare('SELECT phone,student_ids,enabled,updated_at FROM parent_grants ORDER BY updated_at DESC').all();
  return json({grants:grants.results,schoolCode:school?.code||'',schoolName:school?.name||'',portalUrl:'/parent-login'});
 }catch{return json({error:'تعذر تحميل حسابات أولياء الأمور'},503);}
}
export async function POST(req:Request){
 const denied=await denyReadOnlyWrite();if(denied)return denied;
 const user=await getChatGPTUser(),access=await getKhotwaAccess();
 if(!user||!access||access.role==='parent')return json({error:'يرجى تسجيل الدخول'},401);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{
  const raw=await req.text();if(raw.length>5000)return json({error:'الطلب كبير'},413);
  const v=JSON.parse(raw),phone=parentPhone(v.phone);
  if(!phone||!['activate','reset','disable'].includes(v.op))return json({error:'راجع رقم الجوال'},400);
  const db=getTenantDb(),global=env.DB!,now=new Date().toISOString();
  const old=await db.prepare('SELECT enabled,student_ids FROM parent_grants WHERE phone=?').bind(phone).first<{enabled:number;student_ids:string}>();
  const parent=await global.prepare('SELECT id FROM khotwa_parent_users WHERE school_id=? AND phone=?').bind(access.schoolId,phone).first<{id:string}>();
  if(v.op==='activate'){
   if(!Array.isArray(v.studentIds)||!v.studentIds.length||v.studentIds.length>20||v.studentIds.some((x:unknown)=>typeof x!=='string'||x.length>100))return json({error:'اختر أبناء ولي الأمر'},400);
   const ids=[...new Set<string>(v.studentIds)];
   for(const id of ids){const student=await db.prepare('SELECT active,phone FROM students WHERE id=?').bind(id).first<{active:number;phone:string}>();if(!student?.active||parentPhone(student.phone)!==phone)return json({error:'الطالب غير موجود في المدرسة أو رقم جواله لا يطابق ولي الأمر'},409);}
   const password=temporaryPassword(),hash=await hashPassword(password);
   const cmds=[
    db.prepare('INSERT INTO parent_grants(phone,student_ids,enabled,updated_at,actor) VALUES(?,?,1,?,?) ON CONFLICT(phone) DO UPDATE SET student_ids=excluded.student_ids,enabled=1,updated_at=excluded.updated_at,actor=excluded.actor').bind(phone,JSON.stringify(ids),now,user.email),
    global.prepare('INSERT INTO khotwa_parent_users(id,school_id,phone,password_hash,active,session_version,created_at) VALUES(?,?,?,?,1,1,?) ON CONFLICT(school_id,phone) DO UPDATE SET password_hash=excluded.password_hash,active=1,session_version=khotwa_parent_users.session_version+1').bind(parent?.id||crypto.randomUUID(),access.schoolId,phone,hash,now),
   ];
   await global.batch(cmds);
   return json({ok:true,temporaryPassword:password});
  }
  if(!old)return json({error:'الحساب غير موجود'},404);
  if(v.op==='disable'){
   await global.batch([db.prepare('UPDATE parent_grants SET enabled=0,updated_at=?,actor=? WHERE phone=?').bind(now,user.email,phone),global.prepare('UPDATE khotwa_parent_users SET active=0,session_version=session_version+1 WHERE school_id=? AND phone=?').bind(access.schoolId,phone)]);
   return json({ok:true});
  }
  if(!old.enabled)return json({error:'فعّل الحساب أولاً'},400);
  const password=temporaryPassword(),hash=await hashPassword(password);
  const updated=await global.prepare('UPDATE khotwa_parent_users SET password_hash=?,active=1,session_version=session_version+1 WHERE school_id=? AND phone=?').bind(hash,access.schoolId,phone).run();
  if(!updated.meta.changes)return json({error:'فعّل الحساب مجدداً'},409);
  return json({ok:true,temporaryPassword:password});
 }catch(error){console.error('khotwa_parent_management_failed',error instanceof Error?error.name:'unknown');return json({error:'تعذر حفظ حساب ولي الأمر. تأكد من البيانات وحاول مرة أخرى.'},503);}
}
