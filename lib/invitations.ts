import {hashPassword} from '../account-security.ts';
import {sendHostingerSmtp} from '../hostinger-smtp.ts';
import {tokenHash,invitationOrigin,safeHtml,type InviteEnv} from '../deputy-invites.ts';
export const INVITATION_EXPIRES_MS=48*60*60*1000;
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function issueFushatiInvite(db:D1Database,env:InviteEnv,user:{id:string;email:string;full_name:string}){
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),hashed=await tokenHash(token);
 const createdAt=new Date().toISOString();
 await db.batch([
  db.prepare('DELETE FROM fushati_invites WHERE user_id=? AND consumed_at IS NULL').bind(user.id),
  db.prepare('INSERT INTO fushati_invites(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),user.id,hashed,Date.now()+INVITATION_EXPIRES_MS,createdAt)
 ]);
 try{
  const url=invitationOrigin(env)+'/fushati/activate?token='+token;
  if(!env.KHOTWA_FROM_EMAIL||!env.KHOTWA_SMTP_USER||!env.KHOTWA_SMTP_PASSWORD)throw new Error('SMTP_NOT_CONFIGURED');
  await sendHostingerSmtp({host:env.KHOTWA_SMTP_HOST||'smtp.hostinger.com',port:Number(env.KHOTWA_SMTP_PORT||465),user:env.KHOTWA_SMTP_USER,password:env.KHOTWA_SMTP_PASSWORD,from:env.KHOTWA_FROM_EMAIL,relayUrl:env.KHOTWA_SMTP_RELAY_URL,relayToken:env.KHOTWA_SMTP_RELAY_TOKEN,to:user.email,subject:'خطوة × فسحتي | دعوة تفعيل حساب مدير المقاصف',html:`<div lang="ar" dir="rtl"><h2>دعوة لتفعيل حساب مدير فسحتي</h2><p>مرحباً ${safeHtml(user.full_name)}،</p><p>افتح الرابط خلال 48 ساعة وحدد كلمة المرور الخاصة بك.</p><p><a href="${safeHtml(url)}">تفعيل الحساب</a></p><p>إذا لم تتوقع هذه الدعوة فتجاهلها.</p></div>`,text:`Fushati administrator invitation. Set your password within 48 hours:\n${url}`});
  return {status:'smtp_accepted'};
 }catch(e){
  console.error('fushati_invitation_send_failed',e instanceof Error?e.name:'unknown');
  return {status:'failed',errorCode:e instanceof Error&&e.message==='SMTP_NOT_CONFIGURED'?'SMTP_NOT_CONFIGURED':'SMTP_DELIVERY_FAILED'};
 }
}
export async function getFushatiInvite(db:D1Database,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const hashed=await tokenHash(token);
 return db.prepare("SELECT u.id,u.full_name,u.email FROM fushati_invites i JOIN fushati_users u ON u.id=i.user_id WHERE i.token_hash=? AND i.expires_at>? AND i.consumed_at IS NULL AND u.role='fushati_admin' AND u.active=1 AND u.activated_at IS NULL").bind(hashed,Date.now()).first<{id:string;full_name:string;email:string}>();
}
export async function activateFushatiAdmin(db:D1Database,token:string,password:string){
 const invitation=await getFushatiInvite(db,token);if(!invitation||password.length<12||password.length>128)return false;
 const hashed=await tokenHash(token),passwordHash=await hashPassword(password),date=new Date().toISOString();
 const result=await db.prepare("UPDATE fushati_users SET password_hash=?,must_change_password=0,activated_at=?,session_version=session_version+1 WHERE id=? AND role='fushati_admin' AND activated_at IS NULL AND EXISTS (SELECT 1 FROM fushati_invites WHERE user_id=? AND token_hash=? AND consumed_at IS NULL AND expires_at>?)").bind(passwordHash,date,invitation.id,invitation.id,hashed,Date.now()).run();
 if(result.meta.changes!==1)return false;
 await db.prepare('UPDATE fushati_invites SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL').bind(date,hashed).run();
 return true;
}
