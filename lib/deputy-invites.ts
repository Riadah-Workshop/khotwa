/** Single-use deputy onboarding links; email acceptance is NOT recipient delivery. */
import {hashPassword} from './account-security.ts';
import {sendHostingerSmtp} from './hostinger-smtp.ts';

export type InviteEnv = {
 DB?:D1Database;
 RESEND_API_KEY?:string;
 KHOTWA_FROM_EMAIL?:string;
 KHOTWA_APP_URL?:string;
 KHOTWA_PUBLIC_ORIGINS?:string;
 RESEND_WEBHOOK_SECRET?:string;
 KHOTWA_SMTP_HOST?:string;
 KHOTWA_SMTP_PORT?:string;
 KHOTWA_SMTP_USER?:string;
 KHOTWA_SMTP_PASSWORD?:string;
};
export const INVITE_LIFETIME_MS = 48*60*60*1000;
const encoder=new TextEncoder();
const hex=(v:Uint8Array)=>Array.from(v,b=>b.toString(16).padStart(2,'0')).join('');
export const safeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||''));
export async function tokenHash(token:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));}
export function invitationOrigin(env:InviteEnv){
 const url=(env.KHOTWA_APP_URL||env.KHOTWA_PUBLIC_ORIGINS?.split(',')[0]||'').trim();
 try{const p=new URL(url);if(p.protocol==='https:'&&!p.username&&!p.password&&p.pathname==='/'&&!p.search&&!p.hash)return p.origin;}catch{}
 throw new Error('Configure KHOTWA_APP_URL with the exact public HTTPS origin');
}
/** Queue a fresh link. Return provider outcome, not a guessed delivery status. */
export async function issueDeputyInvite(db:D1Database,env:InviteEnv,account:{id:string;email:string;full_name:string;school_name:string},smtpSender=sendHostingerSmtp):Promise<{status:string}>{
 const now=new Date().toISOString();
 // Invalidate older unconsumed invitations, then create a new hashed token.
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 const hash=await tokenHash(token);
 await db.batch([
  db.prepare('DELETE FROM khotwa_deputy_invites WHERE account_id=? AND consumed_at IS NULL').bind(account.id),
  db.prepare('INSERT INTO khotwa_deputy_invites(id,account_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),account.id,hash,Date.now()+INVITE_LIFETIME_MS,now),
  db.prepare("UPDATE khotwa_accounts SET invited_at=?,invitation_status='queued',email_accepted_at=NULL,email_delivered_at=NULL,email_provider_id=NULL WHERE id=?").bind(now,account.id)
 ]);
 let origin:string;
 try{origin=invitationOrigin(env);}catch{return await markInviteFailure(db,account.id);}
 const usingSmtp=Boolean(env.KHOTWA_SMTP_USER||env.KHOTWA_SMTP_PASSWORD);
 if(!env.KHOTWA_FROM_EMAIL||(usingSmtp?(!env.KHOTWA_SMTP_USER||!env.KHOTWA_SMTP_PASSWORD):!env.RESEND_API_KEY))return await markInviteFailure(db,account.id);
 const link=origin+'/activate?token='+token;
 const html=`<div dir="rtl" lang="ar" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#17313d"><h2>دعوة الانضمام إلى نظام خطوة</h2><p>مرحباً ${safeHtml(account.full_name)}،</p><p>تم تعيينك وكيل شؤون الطلاب في ${safeHtml(account.school_name)}.</p><p>لإنشاء كلمة المرور وتفعيل حسابك، افتح الرابط الآتي خلال 48 ساعة:</p><p><a href="${safeHtml(link)}" style="background:#0f766c;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px">تفعيل الحساب وتعيين كلمة المرور</a></p><p>إذا لم تتوقع هذه الدعوة، تجاهل الرسالة. لن يطلب منك فريق خطوة إرسال كلمة المرور بالبريد.</p><p>تطوير فريق نظام خطوة لإدارة المدارس</p></div>`;
 try{
  if(usingSmtp){
   await smtpSender({host:env.KHOTWA_SMTP_HOST||'smtp.hostinger.com',port:Number(env.KHOTWA_SMTP_PORT||'465'),user:env.KHOTWA_SMTP_USER!,password:env.KHOTWA_SMTP_PASSWORD!,from:env.KHOTWA_FROM_EMAIL!,to:account.email,subject:'خطوة | تفعيل حساب وكيل شؤون الطلاب',html,text:`مرحباً ${account.full_name}،\nتم تعيينك وكيل شؤون الطلاب في ${account.school_name}.\nافتح الرابط التالي لتفعيل الحساب وتعيين كلمة المرور خلال 48 ساعة:\n${link}\nتطوير فريق نظام خطوة لإدارة المدارس`});
   await db.prepare("UPDATE khotwa_accounts SET invitation_status='smtp_accepted',email_accepted_at=? WHERE id=? AND invited_at=?").bind(new Date().toISOString(),account.id,now).run();
   return {status:'smtp_accepted'};
  }
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':account.id+':'+hash.slice(0,25)},body:JSON.stringify({from:env.KHOTWA_FROM_EMAIL,to:[account.email],subject:'خطوة | تفعيل حساب وكيل شؤون الطلاب',html})});
  const data=await r.json() as {id?:string};
  if(!r.ok||!data.id)throw new Error('Email provider declined request');
  await db.prepare("UPDATE khotwa_accounts SET invitation_status=COALESCE((SELECT status FROM khotwa_deputy_email_events WHERE email_id=?),'accepted'),email_delivered_at=(SELECT CASE WHEN status='delivered' THEN seen_at ELSE NULL END FROM khotwa_deputy_email_events WHERE email_id=?),email_accepted_at=?,email_provider_id=? WHERE id=? AND invited_at=?").bind(data.id,data.id,new Date().toISOString(),data.id,account.id,now).run();
  return {status:'accepted'};
 }catch{
  // No plaintext token is ever returned in the admin API or retained in the DB.
  return await markInviteFailure(db,account.id);
 }
}
async function markInviteFailure(db:D1Database,id:string):Promise<{status:string}>{await db.prepare("UPDATE khotwa_accounts SET invitation_status='failed' WHERE id=? AND invitation_status='queued'").bind(id).run();return {status:'failed'};}
export async function activationAccount(db:D1Database,token:string):Promise<{id:string;full_name:string;email:string;school_name:string}|null>{
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 return db.prepare('SELECT a.id,a.full_name,a.email,s.name AS school_name FROM khotwa_deputy_invites i JOIN khotwa_accounts a ON a.id=i.account_id JOIN khotwa_schools s ON s.id=a.school_id WHERE i.token_hash=? AND i.consumed_at IS NULL AND i.expires_at>? AND a.active=1 AND s.active=1').bind(await tokenHash(token),Date.now()).first<{id:string;full_name:string;email:string;school_name:string}>();
}
export async function activateDeputy(db:D1Database,token:string,password:string):Promise<boolean>{
 if(password.length<12||password.length>128)return false;
 const account=await activationAccount(db,token);if(!account)return false;
 const passwordHash=await hashPassword(password),now=new Date().toISOString(),consumption=now+'#'+crypto.randomUUID();
 // Both writes are committed together; only the first accepted token may change a password.
 const results=await db.batch([
  db.prepare('UPDATE khotwa_deputy_invites SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?').bind(consumption,await tokenHash(token),Date.now()),
  db.prepare('UPDATE khotwa_accounts SET password_hash=?,activated_at=COALESCE(activated_at,?),password_set_at=?,first_login_at=NULL,session_version=session_version+1 WHERE id=? AND active=1 AND EXISTS (SELECT 1 FROM khotwa_deputy_invites WHERE token_hash=? AND consumed_at=?)').bind(passwordHash,now,now,account.id,await tokenHash(token),consumption)
 ]);
 return Boolean(results[0].meta.changes&&results[1].meta.changes);
}
function base64Bytes(value:string):Uint8Array|null{
 try{const s=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(s,c=>c.charCodeAt(0));}catch{return null;}
}
export async function verifyResendWebhook(body:string,headers:Headers,secret:string):Promise<boolean>{
 const id=headers.get('svix-id')||'',ts=headers.get('svix-timestamp')||'',signature=headers.get('svix-signature')||'';
 if(!id||!/^\d{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!secret.startsWith('whsec_'))return false;
 const keyBytes=base64Bytes(secret.slice(6));if(!keyBytes||keyBytes.length<16)return false;
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const item of signature.split(' ')){
  const parts=item.split(',');if(parts.length!==2||parts[0]!=='v1')continue;
  const sig=base64Bytes(parts[1]);if(sig&&await crypto.subtle.verify('HMAC',key,sig,encoder.encode(id+'.'+ts+'.'+body)))return true;
 }
 return false;
}
