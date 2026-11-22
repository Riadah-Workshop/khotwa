import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getKhotwaAccess,getChatGPTUser} from '../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {issueDeputyInvite} from '../../../lib/deputy-invites';
import {adminSwitchCookie} from '../../../lib/standalone-auth';
import {tableName,provisionSchool,SCHOOL_TABLES} from '../../../lib/school-tenancy';
import {parentPhone} from '../../../lib/parent-view';
import {validSaudiLocation} from '../../../lib/saudi-locations';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const id=z.string().regex(/^(?:default|[a-f0-9]{12})$/);
const email=z.string().trim().toLowerCase().email().max(200);
const schoolName=z.string().trim().min(3).max(180);
const schoolCode=z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,25}$/);
async function isAdmin(){return (await getKhotwaAccess())?.role==='main_admin';}
async function deletionAudit(db:D1Database,operation:string,schoolId:string,key:string){
 const user=await getChatGPTUser();
 const id=crypto.randomUUID();
 await db.prepare("INSERT INTO khotwa_admin_delete_audit(id,actor_email,operation,school_id,record_key,stage,created_at) VALUES(?,?,?,?,?,'requested',?)")
  .bind(id,user?.email||'unknown',operation,schoolId,key,new Date().toISOString()).run();
 return async()=>{await db.prepare("UPDATE khotwa_admin_delete_audit SET stage='completed',completed_at=? WHERE id=?").bind(new Date().toISOString(),id).run();};
}

export async function GET(){
 if(!await isAdmin())return json({error:'صلاحية مدير النظام فقط'},403);
 try{
  const db=env.DB!;
  const [schools,accounts]=await Promise.all([
   db.prepare('SELECT id,code,name,region,city,active,created_at FROM khotwa_schools ORDER BY created_at').all<any>(),
   db.prepare("SELECT a.id,a.school_id,a.email,a.full_name,CASE WHEN EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=a.id) THEN 'manager' ELSE 'deputy' END AS role,a.active,a.created_at,a.activated_at,a.password_set_at,a.first_login_at,a.invited_at,a.invitation_status,a.invitation_error_code,a.email_accepted_at,a.email_delivered_at,(SELECT i.expires_at FROM khotwa_deputy_invites i WHERE i.account_id=a.id ORDER BY i.created_at DESC LIMIT 1) AS invitation_expires_at FROM khotwa_accounts a ORDER BY a.created_at DESC").all<any>()]);
  const data=[];
  for(const school of schools.results){
   const count=await db.prepare(`SELECT COUNT(*) AS count FROM "${tableName(school.id,'students')}"`).first<{count:number}>();
   data.push({...school,studentCount:count?.count||0,deputyCount:accounts.results.filter(a=>a.school_id===school.id&&a.active).length});
  }
  return json({schools:data.filter(s=>s.id!=='default'),accounts:accounts.results.filter(a=>a.school_id!=='default'),legacyStudents:data.find(s=>s.id==='default')?.studentCount||0});
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
   const v=z.object({name:schoolName,code:schoolCode,region:z.string(),city:z.string()}).parse(data);
   if(!validSaudiLocation(v.region,v.city))return json({error:'اختر منطقة ومدينة سعوديتين صحيحتين'},400);
   if(await db.prepare('SELECT id FROM khotwa_schools WHERE code=?').bind(v.code).first())return json({error:'رمز المدرسة مستخدم'},409);
   const schoolId=crypto.randomUUID().replace(/-/g,'').slice(0,12);
   await provisionSchool(db,schoolId);
   await db.prepare('INSERT INTO khotwa_schools(id,code,name,region,city,active,created_at) VALUES(?,?,?,?,?,1,?)').bind(schoolId,v.code,v.name,v.region,v.city,now).run();
   // Each school has its own settings, even before the deputy logs in.
   await db.prepare(`INSERT INTO "${tableName(schoolId,'settings')}"(id,value) VALUES('school',?)`).bind(v.name).run();
   return json({ok:true,schoolId});
  }
  if(body.op==='edit-school'){
   const v=z.object({id,name:schoolName,code:schoolCode,active:z.boolean(),region:z.string(),city:z.string()}).parse(data);
   if(!validSaudiLocation(v.region,v.city))return json({error:'اختر منطقة ومدينة سعوديتين صحيحتين'},400);
   if(v.id==='default'&&!v.active)return json({error:'لا يمكن إيقاف المدرسة الأساسية'},400);
   const result=await db.prepare('UPDATE khotwa_schools SET name=?,code=?,region=?,city=?,active=? WHERE id=?').bind(v.name,v.code,v.region,v.city,v.active?1:0,v.id).run();
   if(!result.meta.changes)return json({error:'المدرسة غير موجودة'},404);
   await db.prepare(`INSERT INTO "${tableName(v.id,'settings')}"(id,value) VALUES('school',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value`).bind(v.name).run();
   return json({ok:true});
  }
  if(body.op==='create-deputy'||body.op==='create-manager'){
   const v=z.object({schoolId:id,fullName:z.string().trim().min(3).max(150),email}).parse(data);
   if(v.schoolId==='default')return json({error:'MAIN هو قسم بيانات سابق وليس مدرسة لإضافة حسابات جديدة'},400);
   const school=await db.prepare('SELECT id,name FROM khotwa_schools WHERE id=? AND active=1').bind(v.schoolId).first<{id:string;name:string}>();
   if(!school)return json({error:'اختر مدرسة فعالة'},400);
   if(v.email===(env.KHOTWA_ADMIN_EMAIL||'').toLowerCase())return json({error:'هذا البريد مخصص لمدير النظام'},409);
   const accountId=crypto.randomUUID();
   await db.batch([db.prepare("INSERT INTO khotwa_accounts(id,school_id,email,full_name,role,password_hash,active,session_version,created_at,invitation_status) VALUES(?,?,?,?,'deputy','!pending-invitation!',1,1,?,'queued')").bind(accountId,v.schoolId,v.email,v.fullName,now),...(body.op==='create-manager'?[db.prepare('INSERT INTO khotwa_manager_accounts(account_id) VALUES(?)').bind(accountId)]:[])]);
   await db.prepare(`INSERT INTO "${tableName(v.schoolId,'settings')}"(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value`).bind(body.op==='create-manager'?'principal':'deputy',v.fullName).run();
   const delivery=await issueDeputyInvite(db,env,{id:accountId,email:v.email,full_name:v.fullName,school_name:school.name},undefined,body.op==='create-manager'?'manager':'deputy');
   return json({ok:true,invitationStatus:delivery.status,invitationErrorCode:delivery.errorCode||null});
  }
  if(body.op==='edit-deputy'||body.op==='edit-account'){
   const v=z.object({id:z.string().uuid(),schoolId:id,fullName:z.string().trim().min(3).max(150),active:z.boolean()}).parse(data);
   if(!await db.prepare('SELECT id FROM khotwa_schools WHERE id=?').bind(v.schoolId).first())return json({error:'المدرسة غير موجودة'},400);
   if(v.schoolId==='default')return json({error:'اختر مدرسة فعلية'},400);
   const previous=await db.prepare('SELECT full_name,school_id FROM khotwa_accounts WHERE id=?').bind(v.id).first<{full_name:string;school_id:string}>();
   const role=await db.prepare('SELECT EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=?) AS is_manager').bind(v.id).first<{is_manager:number}>();
   const key=role?.is_manager?'principal':'deputy';
   const result=await db.prepare('UPDATE khotwa_accounts SET school_id=?,full_name=?,active=?,session_version=session_version+1 WHERE id=?').bind(v.schoolId,v.fullName,v.active?1:0,v.id).run();
   if(result.meta.changes){
    // The old school's reports must not retain a moved user's name.
    if(previous?.school_id!==v.schoolId&&previous?.school_id){
     await db.prepare(`DELETE FROM "${tableName(previous.school_id,'settings')}" WHERE id=? AND value=?`).bind(key,previous.full_name).run();
    }
    if(v.active)await db.prepare(`INSERT INTO "${tableName(v.schoolId,'settings')}"(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value`).bind(key,v.fullName).run();
    else await db.prepare(`DELETE FROM "${tableName(v.schoolId,'settings')}" WHERE id=? AND value IN (?,?)`).bind(key,v.fullName,previous?.full_name||'').run();
   }
   return result.meta.changes?json({ok:true}):json({error:'المستخدم غير موجود'},404);
  }
  if(body.op==='resend-deputy'||body.op==='reset-deputy'||body.op==='resend-account'){
   const v=z.object({id:z.string().uuid()}).parse(data);
   const account=await db.prepare("SELECT a.id,a.email,a.full_name,s.name AS school_name,EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=a.id) AS is_manager FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.id=? AND a.active=1 AND s.active=1 AND a.role='deputy'").bind(v.id).first<{id:string;email:string;full_name:string;school_name:string;is_manager:number}>();
   if(!account)return json({error:'حساب الوكيل غير موجود أو غير مفعّل'},404);
   // A reset invitation does not reveal or replace the current password until
   // the deputy follows the link, when previous sessions are revoked.
   const delivery=await issueDeputyInvite(db,env,account,undefined,account.is_manager?'manager':'deputy');
   return json({ok:true,invitationStatus:delivery.status,invitationErrorCode:delivery.errorCode||null});
  }
  if(body.op==='delete-account'){
   const v=z.object({id:z.string().uuid(),confirmEmail:email}).parse(data);
   const row=await db.prepare('SELECT email,full_name,school_id FROM khotwa_accounts WHERE id=?').bind(v.id).first<{email:string;full_name:string;school_id:string}>();
   if(!row)return json({error:'الحساب غير موجود'},404);
   if(row.email!==v.confirmEmail)return json({error:'يجب تأكيد البريد الإلكتروني المطابق للحساب'},400);
   const role=await db.prepare('SELECT 1 AS is_manager FROM khotwa_manager_accounts WHERE account_id=?').bind(v.id).first();
   const completeAudit=await deletionAudit(db,'delete-account','global',v.id);
   await db.batch([
    db.prepare('DELETE FROM khotwa_deputy_invites WHERE account_id=?').bind(v.id),
    db.prepare('DELETE FROM khotwa_account_email_changes WHERE account_id=?').bind(v.id),
    db.prepare('DELETE FROM khotwa_manager_accounts WHERE account_id=?').bind(v.id),
    db.prepare('DELETE FROM khotwa_accounts WHERE id=?').bind(v.id)
   ]);
   await db.prepare(`DELETE FROM "${tableName(row.school_id,'settings')}" WHERE id=? AND value=?`).bind(role?'principal':'deputy',row.full_name).run();
   await completeAudit();
   return json({ok:true});
  }
  if(body.op==='delete-parent'){
   const v=z.object({schoolId:id,phone:z.string().min(5).max(25)}).parse(data);
   const phone=parentPhone(v.phone);
   if(!phone)return json({error:'رقم الهاتف غير صالح'},400);
   const completeAudit=await deletionAudit(db,'delete-parent',v.schoolId,phone);
   await db.batch([
    db.prepare('DELETE FROM khotwa_parent_users WHERE school_id=? AND phone=?').bind(v.schoolId,phone),
    db.prepare(`DELETE FROM "${tableName(v.schoolId,'parent_grants')}" WHERE phone=?`).bind(phone),
    db.prepare('DELETE FROM khotwa_parent_memberships WHERE phone=? AND school_id=?').bind(phone,v.schoolId)
   ]);
   const linked=await db.prepare('SELECT 1 AS found FROM khotwa_parent_memberships WHERE phone=? LIMIT 1').bind(phone).first();
   if(!linked)await db.prepare('DELETE FROM khotwa_parent_identities WHERE phone=?').bind(phone).run();
   await completeAudit();
   return json({ok:true});
  }
  if(body.op==='delete-school'){
   const v=z.object({schoolId:z.string().regex(/^[a-f0-9]{12}$/),confirmCode:schoolCode}).parse(data);
   const school=await db.prepare('SELECT code FROM khotwa_schools WHERE id=?').bind(v.schoolId).first<{code:string}>();
   if(!school)return json({error:'المدرسة غير موجودة'},404);
   if(school.code!==v.confirmCode)return json({error:'تأكيد رمز المدرسة غير مطابق'},400);
   const completeAudit=await deletionAudit(db,'delete-school',v.schoolId,v.confirmCode);
   // Disable sessions before deleting data; never allow deleting the legacy partition.
   await db.prepare('UPDATE khotwa_schools SET active=0 WHERE id=?').bind(v.schoolId).run();
   const keys=(await db.prepare(`SELECT file_key FROM "${tableName(v.schoolId,'school_evidence')}" WHERE file_key<>''`).all<{file_key:string}>()).results;
   const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
   if(keys.length&&!bucket)return json({error:'تعذر حذف المدرسة: مرفقات R2 غير متاحة. المدرسة موقوفة حفاظاً على البيانات.'},503);
   // Remove attachments first to prevent leaving orphaned private data.
   for(const file of keys)await bucket!.delete(file.file_key);
   // Reverse dependency order follows foreign-key relationships, not alphabetical order.
   const parents=new Map<string,string[]>();
   for(const name of SCHOOL_TABLES){
    const table=tableName(v.schoolId,name);
    const refs=(await db.prepare(`PRAGMA foreign_key_list("${table}")`).all<{table:string}>()).results;
    parents.set(name,refs.map(ref=>ref.table.replace(`tenant_${v.schoolId}_`,'')));
   }
   const visited=new Set<string>(),order:string[]=[];
   const visit=(name:string)=>{if(visited.has(name))return;visited.add(name);for(const dep of parents.get(name)||[])if(parents.has(dep))visit(dep);order.push(name);};
   for(const name of SCHOOL_TABLES)visit(name);
   // D1 DROP TABLE automatically removes the table's indexes; children first.
   for(const name of [...order].reverse())await db.prepare(`DROP TABLE IF EXISTS "${tableName(v.schoolId,name)}"`).run();
   const accounts=(await db.prepare('SELECT id FROM khotwa_accounts WHERE school_id=?').bind(v.schoolId).all<{id:string}>()).results;
   for(const account of accounts){await db.prepare('DELETE FROM khotwa_deputy_invites WHERE account_id=?').bind(account.id).run();await db.prepare('DELETE FROM khotwa_account_email_changes WHERE account_id=?').bind(account.id).run();await db.prepare('DELETE FROM khotwa_manager_accounts WHERE account_id=?').bind(account.id).run();}
   await db.batch([db.prepare('DELETE FROM khotwa_parent_memberships WHERE school_id=?').bind(v.schoolId),db.prepare('DELETE FROM khotwa_accounts WHERE school_id=?').bind(v.schoolId),db.prepare('DELETE FROM khotwa_parent_users WHERE school_id=?').bind(v.schoolId),db.prepare('DELETE FROM khotwa_schools WHERE id=?').bind(v.schoolId)]);
   await completeAudit();
   const access=await getKhotwaAccess();
   if(access?.schoolId===v.schoolId){const user=await getChatGPTUser(),response=json({ok:true});if(user)response.headers.set('Set-Cookie',await adminSwitchCookie(env.KHOTWA_SESSION_SECRET!,user.email,'default'));return response;}
   return json({ok:true});
  }
  if(body.op==='delete-record'){
   const v=z.object({schoolId:id,table:z.string(),key:z.string().min(1).max(200)}).parse(data);
   if(!SCHOOL_TABLES.includes(v.table))return json({error:'فئة سجلات غير مسموح بها'},400);
   const table=tableName(v.schoolId,v.table);
   const cols=(await db.prepare(`PRAGMA table_info("${table}")`).all<{name:string;pk:number}>()).results;
   const pks=cols.filter(c=>c.pk>0);
   if(pks.length!==1)return json({error:'هذا السجل لا يدعم الحذف الفردي'},400);
   const completeAudit=await deletionAudit(db,'delete-record:'+v.table,v.schoolId,v.key);
   let fileKey='';
   const bucket=(env as unknown as {BUCKET?:R2Bucket}).BUCKET;
   if(v.table==='school_evidence'){
    const evidence=await db.prepare(`SELECT file_key FROM "${table}" WHERE "${pks[0].name}"=?`).bind(v.key).first<{file_key:string}>();
    fileKey=evidence?.file_key||'';
    if(fileKey&&!bucket)return json({error:'لا يمكن حذف مرفق دون الاتصال بتخزين R2'},503);
   }
   // Keep the evidence file intact when a foreign-key constraint blocks record deletion.
   const result=await db.prepare(`DELETE FROM "${table}" WHERE "${pks[0].name}"=?`).bind(v.key).run();
   if(!result.meta.changes)return json({error:'السجل غير موجود'},404);
   await completeAudit();
   if(fileKey){try{await bucket!.delete(fileKey);}catch{console.error('khotwa_evidence_cleanup_failed');return json({ok:true,warning:'تم حذف السجل، لكن تعذر حذف الملف المرتبط من R2. يلزم تنظيف الملف من التخزين.'});}}
   return json({ok:true});
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
  if(/FOREIGN KEY constraint/i.test(message))return json({error:'السجل مرتبط بسجلات أخرى. احذف السجلات التابعة أولاً ولا تستخدم حذفاً تلقائياً دون مراجعة.'},409);
  if(/UNIQUE constraint/i.test(message))return json({error:'البريد الإلكتروني أو رمز المدرسة مستخدم بالفعل'},409);
  console.error('khotwa_admin_write_failed',bodyLabel(req),e instanceof Error?e.name:'unknown');
  return json({error:'تعذر الحفظ. تحقق من اتصال قاعدة البيانات وحالة المدرسة.'},503);
 }
}
function bodyLabel(req:Request){return new URL(req.url).pathname;}
