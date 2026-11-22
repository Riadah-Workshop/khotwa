import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {denyReadOnlyWrite,getChatGPTUser,getKhotwaAccess} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {getTenantDb} from '../../../lib/school-tenancy';
import {hashPassword,temporaryPassword} from '../../../lib/account-security';
import {parentPhone} from '../../../lib/parent-view';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
/** Only an authenticated school's agent can manage this school's grants. */
export async function GET(req:Request){
 const access=await getKhotwaAccess();
 if(!access||!['main_admin','deputy'].includes(access.role))return json({error:'يرجى تسجيل الدخول'},401);
 try{
  const db=getTenantDb(),global=env.DB!;
  const school=await global.prepare('SELECT name FROM khotwa_schools WHERE id=?').bind(access.schoolId).first<{name:string}>();
  const grants=await db.prepare('SELECT phone,student_ids,enabled,updated_at FROM parent_grants ORDER BY updated_at DESC').all();
  const phone=parentPhone(new URL(req.url).searchParams.get('phone'));
  // Exact-number lookup only; never disclose other schools' names, students or grants.
  const existingParent=phone?!!await global.prepare('SELECT phone FROM khotwa_parent_identities WHERE phone=?').bind(phone).first():false;
  return json({grants:grants.results,schoolName:school?.name||'',portalUrl:'/parent-login',existingParent});
 }catch{return json({error:'تعذر تحميل حسابات أولياء الأمور'},503);}
}
export async function POST(req:Request){
 const denied=await denyReadOnlyWrite();if(denied)return denied;
 const user=await getChatGPTUser(),access=await getKhotwaAccess();
 if(!user||!access||!['main_admin','deputy'].includes(access.role))return json({error:'يرجى تسجيل الدخول'},401);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{
  const raw=await req.text();if(raw.length>5000)return json({error:'الطلب كبير'},413);
  const v=JSON.parse(raw),phone=parentPhone(v.phone);
  if(!phone||!['activate','reset','disable'].includes(v.op))return json({error:'راجع رقم الجوال'},400);
  const db=getTenantDb(),global=env.DB!,now=new Date().toISOString();
  const old=await db.prepare('SELECT enabled,student_ids FROM parent_grants WHERE phone=?').bind(phone).first<{enabled:number;student_ids:string}>();
  if(v.op==='activate'){
   if(!Array.isArray(v.studentIds)||!v.studentIds.length||v.studentIds.length>20||v.studentIds.some((x:unknown)=>typeof x!=='string'||x.length>100))return json({error:'اختر أبناء ولي الأمر'},400);
   const ids=[...new Set<string>(v.studentIds)];
   for(const id of ids){const student=await db.prepare('SELECT active,phone FROM students WHERE id=?').bind(id).first<{active:number;phone:string}>();if(!student?.active||parentPhone(student.phone)!==phone)return json({error:'الطالب غير موجود في المدرسة أو رقم جواله لا يطابق ولي الأمر'},409);}
   // Never alter another school's parent's password when adding a child here.
   const proposed=temporaryPassword(),hash=await hashPassword(proposed);
   // Atomic credential creation, school grant and membership. Concurrent school
   // activation cannot replace an established password or leave partial links.
   const results=await global.batch([
    global.prepare('INSERT INTO khotwa_parent_identities(phone,password_hash,session_version,created_at) VALUES(?,?,1,?) ON CONFLICT(phone) DO NOTHING').bind(phone,hash,now),
    db.prepare('INSERT INTO parent_grants(phone,student_ids,enabled,updated_at,actor) VALUES(?,?,1,?,?) ON CONFLICT(phone) DO UPDATE SET student_ids=excluded.student_ids,enabled=1,updated_at=excluded.updated_at,actor=excluded.actor').bind(phone,JSON.stringify(ids),now,user.email),
    global.prepare('INSERT INTO khotwa_parent_memberships(phone,school_id,enabled,updated_at) VALUES(?,?,1,?) ON CONFLICT(phone,school_id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at').bind(phone,access.schoolId,now)
   ]);
   const created=!!results[0].meta.changes;
   return json({ok:true,linkedExisting:!created,...(created?{temporaryPassword:proposed}:{})});
  }
  if(!old)return json({error:'الحساب غير موجود في مدرستك'},404);
  if(v.op==='disable'){
   await global.batch([db.prepare('UPDATE parent_grants SET enabled=0,updated_at=?,actor=? WHERE phone=?').bind(now,user.email,phone),global.prepare('UPDATE khotwa_parent_memberships SET enabled=0,updated_at=? WHERE phone=? AND school_id=?').bind(now,phone,access.schoolId)]);
   return json({ok:true});
  }
  if(!old.enabled)return json({error:'فعّل الحساب أولاً'},400);
  const linked=await global.prepare('SELECT COUNT(*) AS total FROM khotwa_parent_memberships WHERE phone=?').bind(phone).first<{total:number}>();
  if((linked?.total||0)>1)return json({error:'هذا الرقم مرتبط بأكثر من مدرسة. لا يمكن لوكيل مدرسة إعادة تعيين كلمة مرور مشتركة. يغير ولي الأمر كلمة المرور من حسابه.'},403);
  const password=temporaryPassword(),hash=await hashPassword(password);
  const updated=await global.prepare('UPDATE khotwa_parent_identities SET password_hash=?,session_version=session_version+1 WHERE phone=?').bind(hash,phone).run();
  if(!updated.meta.changes)return json({error:'الحساب غير موجود'},404);
  return json({ok:true,temporaryPassword:password});
 }catch(error){console.error('khotwa_parent_management_failed',error instanceof Error?error.name:'unknown');return json({error:'تعذر حفظ حساب ولي الأمر. تأكد من البيانات وحاول مرة أخرى.'},503);}
}
