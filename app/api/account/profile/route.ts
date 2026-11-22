import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser,getKhotwaAccess} from '../../../chatgpt-auth';
import {verifyPassword,hashPassword} from '../../../../lib/account-security';
import {requestAgentEmailChange} from '../../../../lib/account-profile';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
async function agent(){const access=await getKhotwaAccess(),user=await getChatGPTUser();return access?.role==='deputy'&&user?user:null;}
export async function GET(){
 const user=await agent();if(!user)return json({error:'وكيل شؤون الطلاب فقط'},403);
 const row=await env.DB!.prepare('SELECT email,full_name,first_login_at FROM khotwa_accounts WHERE id=? AND active=1 AND activated_at IS NOT NULL').bind(user.userId).first<{email:string;full_name:string;first_login_at:string|null}>();
 if(!row)return json({error:'الحساب غير متاح'},403);
 return json({email:row.email,fullName:row.full_name,firstLoginAt:row.first_login_at});
}
export async function POST(req:Request){
 const user=await agent();if(!user)return json({error:'وكيل شؤون الطلاب فقط'},403);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS,true)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{
  const raw=await req.text();if(raw.length>3000)return json({error:'الطلب كبير'},413);
  const body=z.discriminatedUnion('op',[
   z.object({op:z.literal('password'),currentPassword:z.string(),newPassword:z.string().min(12).max(256)}),
   z.object({op:z.literal('email'),currentPassword:z.string(),newEmail:z.string().trim().toLowerCase().email().max(200)})
  ]).parse(JSON.parse(raw));
  const db=env.DB!,row=await db.prepare('SELECT id,email,password_hash,first_login_at FROM khotwa_accounts WHERE id=? AND active=1 AND activated_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM khotwa_manager_accounts WHERE account_id=?)').bind(user.userId,user.userId).first<{id:string;email:string;password_hash:string;first_login_at:string|null}>();
  if(!row?.first_login_at)return json({error:'يمكن تعديل الحساب بعد أول تسجيل دخول فقط'},403);
  if(!await verifyPassword(body.currentPassword,row.password_hash))return json({error:'كلمة المرور الحالية غير صحيحة'},403);
  if(body.op==='password'){
   if(await verifyPassword(body.newPassword,row.password_hash))return json({error:'اختر كلمة مرور جديدة مختلفة'},400);
   const hash=await hashPassword(body.newPassword);
   await db.prepare('UPDATE khotwa_accounts SET password_hash=?,session_version=session_version+1,password_set_at=? WHERE id=?').bind(hash,new Date().toISOString(),user.userId).run();
   return json({ok:true,relogin:true});
  }
  if(body.newEmail===row.email)return json({error:'البريد الجديد هو نفسه البريد الحالي'},400);
  if(body.newEmail===(env.KHOTWA_ADMIN_EMAIL||'').trim().toLowerCase())return json({error:'البريد محجوز لمدير النظام'},409);
  const duplicate=await db.prepare('SELECT id FROM khotwa_accounts WHERE email=?').bind(body.newEmail).first();
  if(duplicate)return json({error:'البريد الإلكتروني مستخدم بحساب آخر'},409);
  await requestAgentEmailChange(db,env,user.userId,body.newEmail);
  return json({ok:true,confirmationRequired:true});
 }catch(e){
  if(e instanceof z.ZodError||e instanceof SyntaxError)return json({error:'راجع المدخلات وكلمة المرور الجديدة'},400);
  console.error('khotwa_agent_profile_update_failed',e instanceof Error?e.name:'unknown');
  return json({error:'تعذر إرسال التحقق إلى البريد الجديد. تحقق من إعدادات Hostinger SMTP.'},503);
 }
}
