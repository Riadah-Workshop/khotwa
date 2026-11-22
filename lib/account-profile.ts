import {sendHostingerSmtp} from './hostinger-smtp.ts';
import {invitationOrigin,safeHtml,tokenHash} from './deputy-invites.ts';
import type {InviteEnv} from './deputy-invites.ts';
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export async function requestAgentEmailChange(db:D1Database,env:InviteEnv,accountId:string,newEmail:string){
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await tokenHash(token);
 const origin=invitationOrigin(env);
 await db.prepare('DELETE FROM khotwa_account_email_changes WHERE account_id=?').bind(accountId).run();
 await db.prepare('INSERT INTO khotwa_account_email_changes(token_hash,account_id,new_email,expires_at,created_at) VALUES(?,?,?,?,?)').bind(hash,accountId,newEmail,Date.now()+30*60_000,new Date().toISOString()).run();
 const link=origin+'/account/verify-email?token='+token;
 try{
  if(!env.KHOTWA_SMTP_USER||!env.KHOTWA_SMTP_PASSWORD||!env.KHOTWA_FROM_EMAIL)throw new Error('Mail not configured');
  await sendHostingerSmtp({host:env.KHOTWA_SMTP_HOST||'smtp.hostinger.com',port:Number(env.KHOTWA_SMTP_PORT||465),user:env.KHOTWA_SMTP_USER,password:env.KHOTWA_SMTP_PASSWORD,from:env.KHOTWA_FROM_EMAIL,relayUrl:env.KHOTWA_SMTP_RELAY_URL,relayToken:env.KHOTWA_SMTP_RELAY_TOKEN,to:newEmail,subject:'خطوة | تأكيد تغيير البريد الإلكتروني',html:`<div dir="rtl" lang="ar"><h2>تأكيد البريد الإلكتروني</h2><p>طلبت تغيير بريد وكيل شؤون الطلاب في خطوة. افتح الرابط الآمن خلال 30 دقيقة لتأكيد عنوانك الجديد. إذا لم تطلب التغيير، تجاهل الرسالة.</p><p><a href="${safeHtml(link)}">تأكيد البريد الإلكتروني الجديد</a></p></div>`,text:'للتأكد من بريدك الجديد في خطوة، افتح الرابط خلال 30 دقيقة:\n'+link});
 }catch(error){await db.prepare('DELETE FROM khotwa_account_email_changes WHERE token_hash=?').bind(hash).run();throw error;}
}
export async function verifyAgentEmailChange(db:D1Database,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return {ok:false,error:'رابط غير صالح'};
 const hash=await tokenHash(token);
 const row=await db.prepare("SELECT e.account_id,e.new_email,a.id FROM khotwa_account_email_changes e JOIN khotwa_accounts a ON a.id=e.account_id JOIN khotwa_schools s ON s.id=a.school_id WHERE e.token_hash=? AND e.expires_at>? AND a.active=1 AND a.activated_at IS NOT NULL AND s.active=1 AND NOT EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=a.id)").bind(hash,Date.now()).first<{account_id:string;new_email:string}>();
 if(!row)return {ok:false,error:'انتهت صلاحية رابط التأكيد أو لم يعد صالحًا'};
 const exists=await db.prepare('SELECT id FROM khotwa_accounts WHERE email=? AND id<>?').bind(row.new_email,row.account_id).first();
 if(exists)return {ok:false,error:'هذا البريد الإلكتروني مستخدم بالفعل'};
 // One verification URL can only be applied once; revokes prior sessions.
 const updated=await db.prepare('UPDATE khotwa_accounts SET email=?,session_version=session_version+1 WHERE id=? AND active=1 AND EXISTS(SELECT 1 FROM khotwa_account_email_changes WHERE token_hash=? AND account_id=? AND expires_at>?)').bind(row.new_email,row.account_id,hash,row.account_id,Date.now()).run();
 if(!updated.meta.changes)return {ok:false,error:'تعذر إكمال التغيير'};
 await db.prepare('DELETE FROM khotwa_account_email_changes WHERE account_id=?').bind(row.account_id).run();
 return {ok:true,error:''};
}
