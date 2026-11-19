import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getKhotwaAccess,getChatGPTUser} from '../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {issueDeputyInvite} from '../../../lib/deputy-invites';
import {adminSwitchCookie} from '../../../lib/standalone-auth';
import {tableName,provisionSchool} from '../../../lib/school-tenancy';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const id=z.string().regex(/^(?:default|[a-f0-9]{12})$/);
const email=z.string().trim().toLowerCase().email().max(200);
const schoolName=z.string().trim().min(3).max(180);
const schoolCode=z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,25}$/);
async function isAdmin(){return (await getKhotwaAccess())?.role==='main_admin';}
export async function GET(){
 if(!await isAdmin())return json({error:'صلاحية مدير النظام فقط'},403);
 try{
  const db=env.DB!;
  const [schools,accounts]=await Promise.all([
   db.prepare('SELECT id,code,name,active,created_at FROM khotwa_schools ORDER BY created_at').all<any>(),
   db.prepare('SELECT a.id,a.school_id,a.email,a.full_name,a.role,a.active,a.created_at,a.activated_at,a.password_set_at,a.first_login_at,a.invited_at,a.invitation_status,a.email_accepted_at,a.email_delivered_at,(SELECT i.expires_at FROM khotwa_deputy_invites i WHERE i.account_id=a.id ORDER BY i.created_at DESC LIMIT 1) AS invitation_expires_at FROM khotwa_accounts a ORDER BY a.created_at DESC').all<any>()]);
  const data=[];
  for(const school of schools.results){
   const count=await db.prepare(`SELECT COUNT(*) AS count FROM "${tableName(school.id,'students')}"`).first<{count:number}>();
   data.push({...school,studentCount:count?.count||0,deputyCount:accounts.results.filter(a=>a.school_id===school.id&&a.active).length});
  }
  return json({schools:data,accounts:accounts.results});
 }catch{return json({error:'تعذر تحميل المدارس. تأكد من تطبيق ترحيلات قاعدة البيانات.'},503);}
}
export async function POST(req:Request){
 if(!await isAdmin())return json({error:'صلاحية مدير النظام فقط'},403);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS,true)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{
  const raw=await req.text();if(raw.length>5000)return json({error:'الطلب كبير'},413);
  const body=z.object({op:z.string(),data:z.unknown()}).parse(JSON.parse(raw));
  const db=env.DB!,now=new Date().toISOString(),data=body.data;
  if(body.op==='create-school'){
   const v=z.object({name:schoolName,code:schoolCode}).parse(data);
   if(await db.prepare('SELECT id FROM khotwa_schools WHERE code=?').bind(v.code).first())return json({error:'رمز المدرسة مستخدم'},409);
   const schoolId=crypto.randomUUID().replace(/-/g,'').slice(0,12);
   await provisionSchool(db,schoolId);
   await db.prepare('INSERT INTO khotwa_schools(id,code,name,active,created_at) VALUES(?,?,?,1,?)').bind(schoolId,v.code,v.name,now).run();
   // Each school has its own settings, even before the deputy logs in.
   await db.prepare(`INSERT INTO "${tableName(schoolId,'settings')}"(id,value) VALUES('school',?)`).bind(v.name).run();
   return json({ok:true,schoolId});
  }
  if(body.op==='edit-school'){
   const v=z.object({id,name:schoolName,code:schoolCode,active:z.boolean()}).parse(data);
   if(v.id==='default'&&!v.active)return json({error:'لا يمكن إيقاف المدرسة الأساسية'},400);
   const result=await db.prepare('UPDATE khotwa_schools SET name=?,code=?,active=? WHERE id=?').bind(v.name,v.code,v.active?1:0,v.id).run();
   if(!result.meta.changes)return json({error:'المدرسة غير موجودة'},404);
   await db.prepare(`INSERT INTO "${tableName(v.id,'settings')}"(id,value) VALUES('school',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value`).bind(v.name).run();
   return json({ok:true});
  }
  if(body.op==='create-deputy'){
   const v=z.object({schoolId:id,fullName:z.string().trim().min(3).max(150),email}).parse(data);
   const school=await db.prepare('SELECT id,name FROM khotwa_schools WHERE id=? AND active=1').bind(v.schoolId).first<{id:string;name:string}>();
   if(!school)return json({error:'اختر مدرسة فعالة'},400);
   if(v.email===(env.KHOTWA_ADMIN_EMAIL||'').toLowerCase())return json({error:'هذا البريد مخصص لمدير النظام'},409);
   const accountId=crypto.randomUUID();
   await db.prepare("INSERT INTO khotwa_accounts(id,school_id,email,full_name,role,password_hash,active,session_version,created_at,invitation_status) VALUES(?,?,?,?,'deputy','!pending-invitation!',1,1,?,'queued')").bind(accountId,v.schoolId,v.email,v.fullName,now).run();
   const delivery=await issueDeputyInvite(db,env,{id:accountId,email:v.email,full_name:v.fullName,school_name:school.name});
   return json({ok:true,invitationStatus:delivery.status});
  }
  if(body.op==='edit-deputy'){
   const v=z.object({id:z.string().uuid(),schoolId:id,fullName:z.string().trim().min(3).max(150),active:z.boolean()}).parse(data);
   if(!await db.prepare('SELECT id FROM khotwa_schools WHERE id=?').bind(v.schoolId).first())return json({error:'المدرسة غير موجودة'},400);
   const result=await db.prepare('UPDATE khotwa_accounts SET school_id=?,full_name=?,active=?,session_version=session_version+1 WHERE id=?').bind(v.schoolId,v.fullName,v.active?1:0,v.id).run();
   return result.meta.changes?json({ok:true}):json({error:'المستخدم غير موجود'},404);
  }
  if(body.op==='resend-deputy'||body.op==='reset-deputy'){
   const v=z.object({id:z.string().uuid()}).parse(data);
   const account=await db.prepare("SELECT a.id,a.email,a.full_name,s.name AS school_name FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.id=? AND a.active=1 AND s.active=1 AND a.role='deputy'").bind(v.id).first<{id:string;email:string;full_name:string;school_name:string}>();
   if(!account)return json({error:'حساب الوكيل غير موجود أو غير مفعّل'},404);
   // A reset invitation does not reveal or replace the current password until
   // the deputy follows the link, when previous sessions are revoked.
   const delivery=await issueDeputyInvite(db,env,account);
   return json({ok:true,invitationStatus:delivery.status});
  }
  if(body.op==='switch-school'){
   const v=z.object({schoolId:id}).parse(data);
   if(!await db.prepare('SELECT id FROM khotwa_schools WHERE id=? AND active=1').bind(v.schoolId).first())return json({error:'المدرسة غير متاحة'},404);
   const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);
   const response=json({ok:true});
   response.headers.set('Set-Cookie',await adminSwitchCookie(env.KHOTWA_SESSION_SECRET!,user.email,v.schoolId));
   return response;
  }
  return json({error:'عملية غير مدعومة'},400);
 }catch(e){
  if(e instanceof z.ZodError)return json({error:'تحقق من الحقول المطلوبة وصحة البيانات.'},400);
  const message=String(e instanceof Error?e.message:'');
  if(/UNIQUE constraint/i.test(message))return json({error:'البريد الإلكتروني أو رمز المدرسة مستخدم بالفعل'},409);
  console.error('khotwa_admin_write_failed',bodyLabel(req),e instanceof Error?e.name:'unknown');
  return json({error:'تعذر الحفظ. تحقق من اتصال قاعدة البيانات وحالة المدرسة.'},503);
 }
}
function bodyLabel(req:Request){return new URL(req.url).pathname;}
