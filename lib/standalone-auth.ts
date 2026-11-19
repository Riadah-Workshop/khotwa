/**
 * Signed, expiring session gateway. The VPS staging environment previously
 * allowed only one operator; the main admin can now create school deputies
 * and school-scoped parent accounts with independent passwords and revocation.
 * All browser identity headers are stripped before the identity is injected.
 */
import {verifyPassword} from './account-security.ts';
import {parentPhone} from './parent-view.ts';
import type {SchoolRole} from './school-tenancy';

type AuthEnv={
 DB?:D1Database;
 KHOTWA_ADMIN_EMAIL?:string;
 KHOTWA_ADMIN_PASSWORD_HASH?:string;
 KHOTWA_SESSION_SECRET?:string;
 KHOTWA_PUBLIC_ORIGINS?:string;
};
type AuthResult={request?:Request;response?:Response;school?:{schoolId:string;role:SchoolRole;identity:string}};
export type SessionClaims={e:string;uid:string;role:SchoolRole;sid:string;ver:number;phone?:string;exp:number};
const COOKIE_NAME='__Host-khotwa_session';
const SESSION_SECONDS=12*60*60;
const AUTH_AUDIT_REVISION='khotwa-multischool-20261119-v1';
const encoder=new TextEncoder();
const htmlHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none"};
const encoded=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');};
const decoded=(value:string):Uint8Array|null=>{try{if(!/^[A-Za-z0-9_-]+$/.test(value))return null;const s=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(s,c=>c.charCodeAt(0));}catch{return null;}};
async function hmacKey(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function signToken(secret:string,claim:Omit<SessionClaims,'exp'>):Promise<string>{
 const payload=encoded(encoder.encode(JSON.stringify({...claim,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS})));
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(secret),encoder.encode(payload)));
 return payload+'.'+encoded(signature);
}
async function readToken(secret:string,token:string):Promise<SessionClaims|null>{
 const p=token.split('.');if(p.length!==2||token.length>4096)return null;
 const sig=decoded(p[1]),bytes=decoded(p[0]);if(!sig||sig.length!==32||!bytes)return null;
 if(!await crypto.subtle.verify('HMAC',await hmacKey(secret),sig,encoder.encode(p[0])))return null;
 try{
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as SessionClaims;
  if(!v||!['main_admin','deputy','parent'].includes(v.role)||typeof v.e!=='string'||typeof v.uid!=='string'||typeof v.sid!=='string'||!Number.isInteger(v.ver)||!Number.isSafeInteger(v.exp)||v.exp<=Math.floor(Date.now()/1000)||v.exp>Math.floor(Date.now()/1000)+SESSION_SECONDS)return null;
  if(v.sid!=='default'&&!/^[a-f0-9]{12}$/.test(v.sid))return null;
  return v;
 }catch{return null;}
}
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||''));
function redirectTarget(value:string|null):string{
 if(!value||!value.startsWith('/')||value.startsWith('//'))return '/';
 try{const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&!['/login','/parent-login','/logout','/callback'].includes(u.pathname)?u.pathname+u.search+u.hash:'/';}catch{return '/';}
}
const css=`body{font-family:system-ui,Tahoma,sans-serif;background:#f3f6f8;color:#142c35;min-height:100vh;display:grid;place-items:center;margin:0}main{background:#fff;box-shadow:0 15px 50px #162e3522;border-radius:18px;padding:32px;width:min(390px,85vw)}h1{margin:0 0 6px;color:#174f42;font-size:29px}.sub{color:#52626b;margin-bottom:28px}label{display:block;font-weight:600;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c5cc;border-radius:8px;font-size:16px}button{width:100%;border:0;background:#174f42;color:white;border-radius:8px;padding:13px;font-size:16px;margin-top:22px;cursor:pointer}.error{color:#9c2626;font-weight:600}a{color:#174f42;display:inline-block;margin-top:20px}`;
function loginPage(returnTo:string,error=false,parent=false):Response {
 const form=parent?`<label>رمز المدرسة</label><input name="school_code" maxlength="25" autocomplete="organization" required/><label>رقم جوال ولي الأمر</label><input name="phone" type="tel" maxlength="20" inputmode="tel" required/>`:`<label for="email">البريد الإلكتروني</label><input id="email" name="email" type="email" autocomplete="username" required/>`;
 const content=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>خطوة | تسجيل الدخول</title><style>${css}</style></head><body><main><h1>خطوة • Khotwa</h1><p class="sub">${parent?'بوابة ولي الأمر — متابعة أبنائك':'لوحة المدرسة — مدير النظام ووكيل شؤون الطلاب'}</p>${error?'<p class="error">بيانات الدخول غير صحيحة أو الحساب غير مفعل.</p>':''}<form method="POST" action="${parent?'/parent-login':'/login'}"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/>${form}<label for="password">كلمة المرور</label><input id="password" name="password" type="password" autocomplete="current-password" required/><button type="submit">تسجيل الدخول</button></form><a href="${parent?'/login':'/parent-login'}">${parent?'دخول الإدارة المدرسية':'بوابة ولي الأمر'}</a></main></body></html>`;
 return new Response(content,{status:error?401:200,headers:htmlHeaders});
}
function loginOriginRejection(request:Request,configuredOrigins:string|undefined):string|null{
 const fetchSite=request.headers.get('sec-fetch-site');if(fetchSite==='cross-site')return 'cross-site-fetch';
 const original=request.headers.get('origin');const fallback=!original&&(fetchSite==='same-origin'||fetchSite==='same-site')?request.headers.get('referer'):null;
 if(!original&&!fallback)return 'missing-origin';
 try{
  const origin=new URL(original||fallback!);
  if(origin.protocol!=='https:'||(original&&(origin.pathname!=='/'||origin.search||origin.hash)))return 'invalid-origin';
  const configured=(configuredOrigins||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(configured.length)return configured.some(value=>{try{const allowed=new URL(value);return allowed.protocol==='https:'&&allowed.pathname==='/'&&!allowed.search&&!allowed.hash&&allowed.origin===origin.origin;}catch{return false;}})?null:'origin-not-allowlisted';
  return origin.host===(request.headers.get('host')||new URL(request.url).host)?null:'origin-host-mismatch';
 }catch{return 'invalid-origin';}
}
export function sessionCookie(token:string):string{return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;}
function redirect(url:string,cookie?:string):Response{const headers=new Headers({Location:url,'Cache-Control':'no-store'});if(cookie)headers.set('Set-Cookie',cookie);return new Response(null,{status:303,headers});}
export async function adminSwitchCookie(secret:string,email:string,schoolId:string):Promise<string>{
 if(schoolId!=='default'&&!/^[a-f0-9]{12}$/.test(schoolId))throw new Error('Invalid school identifier');
 return sessionCookie(await signToken(secret,{e:email.toLowerCase(),uid:'khotwa-admin',role:'main_admin',sid:schoolId,ver:1}));
}
// Persistent per-login identifier throttling (minimizes online guessing).
async function isBlocked(db:D1Database|undefined,id:string):Promise<boolean>{
 if(!db)return false;const record=await db.prepare('SELECT blocked_until FROM khotwa_login_limits WHERE id=?').bind(id).first<{blocked_until:number}>();return !!record&&record.blocked_until>Date.now();
}
async function recordFailure(db:D1Database|undefined,id:string):Promise<void>{
 if(!db)return;const now=Date.now();
 await db.prepare('INSERT INTO khotwa_login_limits(id,attempts,blocked_until,updated_at) VALUES(?,1,0,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN updated_at<? THEN 1 ELSE attempts+1 END,blocked_until=CASE WHEN updated_at>=? AND attempts>=4 THEN ? ELSE 0 END,updated_at=?').bind(id,now,now-15*60_000,now-15*60_000,now+15*60_000,now).run();
}
async function clearFailures(db:D1Database|undefined,id:string){if(db)await db.prepare('DELETE FROM khotwa_login_limits WHERE id=?').bind(id).run();}
export async function handleKhotwaAuthentication(request:Request,env:AuthEnv):Promise<AuthResult>{
 const headers=new Headers(request.headers);
 for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);
 const url=new URL(request.url),path=url.pathname;
 if(path==='/healthz')return {response:Response.json({service:'khotwa',status:'up',auth_revision:AUTH_AUDIT_REVISION},{headers:{'Cache-Control':'no-store'}})};
 const parentLogin=path==='/parent-login';
 const login=path==='/login'||path==='/signin-with-chatgpt'||parentLogin;
 if(login){if(request.method==='GET')return {response:loginPage(redirectTarget(url.searchParams.get('return_to')),false,parentLogin)};if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, POST'}})};}
 const email=(env.KHOTWA_ADMIN_EMAIL||'').trim().toLowerCase(),secret=env.KHOTWA_SESSION_SECRET||'',record=env.KHOTWA_ADMIN_PASSWORD_HASH||'';
 if(!email||secret.length<32||!record)return {response:new Response('Khotwa admin credentials not configured. See VPS-COOLIFY.md.',{status:503,headers:{'Cache-Control':'no-store'}})};
 if(login){
  const rejection=loginOriginRejection(request,env.KHOTWA_PUBLIC_ORIGINS);
  if(rejection)return {response:new Response('Forbidden',{status:403,headers:{'Cache-Control':'no-store','X-Khotwa-Auth-Revision':AUTH_AUDIT_REVISION,'X-Khotwa-Auth-Reject':rejection}})};
  const ct=request.headers.get('content-type')||'';
  if(!ct.startsWith('application/x-www-form-urlencoded')||Number(request.headers.get('content-length')||0)>8000)return {response:new Response('Bad Request',{status:400})};
  const raw=await request.text();if(raw.length>8000)return {response:new Response('Bad Request',{status:400})};
  const p=new URLSearchParams(raw),password=p.get('password')||'',target=redirectTarget(p.get('return_to'));
  const loginEmail=(p.get('email')||'').trim().toLowerCase();const schoolCode=(p.get('school_code')||'').trim().toUpperCase(),phone=parentPhone(p.get('phone'));
  const limitKey=parentLogin?'p:'+schoolCode+':'+phone:'u:'+loginEmail;
  try{
   if(await isBlocked(env.DB,limitKey))return {response:loginPage(parentLogin?'/parent':'/',true,parentLogin)};
   let claim:Omit<SessionClaims,'exp'>|null=null;
   if(parentLogin){
    if(phone&&/^[A-Z0-9-]{2,25}$/.test(schoolCode)&&env.DB){
     const row=await env.DB.prepare('SELECT p.id,p.school_id,p.phone,p.password_hash,p.session_version FROM khotwa_parent_users p JOIN khotwa_schools s ON s.id=p.school_id WHERE s.code=? AND s.active=1 AND p.phone=? AND p.active=1').bind(schoolCode,phone).first<any>();
     if(row&&await verifyPassword(password,row.password_hash))claim={e:'parent:'+row.id,uid:row.id,role:'parent',sid:row.school_id,ver:row.session_version,phone:row.phone};
    }
   }else if(loginEmail===email&&await verifyPassword(password,record)){
    claim={e:email,uid:'khotwa-admin',role:'main_admin',sid:'default',ver:1};
   }else if(env.DB&&loginEmail){
    const row=await env.DB.prepare("SELECT a.id,a.school_id,a.email,a.password_hash,a.session_version FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.email=? AND a.active=1 AND s.active=1 AND a.role='deputy'").bind(loginEmail).first<any>();
    if(row&&await verifyPassword(password,row.password_hash))claim={e:row.email,uid:row.id,role:'deputy',sid:row.school_id,ver:row.session_version};
   }
   if(!claim){await recordFailure(env.DB,limitKey);return {response:loginPage(parentLogin?'/parent':'/',true,parentLogin)};}
   await clearFailures(env.DB,limitKey);
   return {response:redirect(parentLogin?'/parent':target,sessionCookie(await signToken(secret,claim)))};
  }catch{return {response:new Response('Login service unavailable',{status:503,headers:{'Cache-Control':'no-store'}})};}
 }
 if(path==='/logout'||path==='/signout-with-chatgpt')return {response:redirect('/login',sessionCookie('')+'; Max-Age=0')};
 if(path.startsWith('/_next/')||path.startsWith('/assets/')||/\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|webmanifest)$/.test(path))return {request:new Request(request,{headers})};
 const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1)||'';
 let claim=cookie?await readToken(secret,cookie):null;
 let verifiedName:string|null=null;
 if(claim?.role==='main_admin'&&(claim.e!==email||claim.uid!=='khotwa-admin'||claim.ver!==1))claim=null;
 if(claim?.role==='deputy'){
  try{const r=await env.DB?.prepare('SELECT a.email,a.full_name,a.school_id,a.active,a.session_version,s.active AS school_active FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.id=?').bind(claim.uid).first<any>();if(!r||!r.active||!r.school_active||r.email!==claim.e||r.school_id!==claim.sid||r.session_version!==claim.ver)claim=null;else verifiedName=r.full_name;}catch{claim=null;}
 }
 if(claim?.role==='parent'){
  try{const r=await env.DB?.prepare('SELECT p.phone,p.school_id,p.active,p.session_version,s.active AS school_active FROM khotwa_parent_users p JOIN khotwa_schools s ON s.id=p.school_id WHERE p.id=?').bind(claim.uid).first<any>();if(!r||!r.active||!r.school_active||r.phone!==claim.phone||r.school_id!==claim.sid||r.session_version!==claim.ver)claim=null;}catch{claim=null;}
 }
 if(claim?.role==='main_admin'&&claim.sid!=='default'){
  try{const r=await env.DB?.prepare('SELECT active FROM khotwa_schools WHERE id=?').bind(claim.sid).first<{active:number}>();if(!r?.active)claim=null;}catch{claim=null;}
 }
 if(!claim){
  if(path.startsWith('/api/'))return {response:Response.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'no-store'}})};
  return {response:redirect((path==='/parent'?'/parent-login':'/login')+'?return_to='+encodeURIComponent(redirectTarget(path+url.search)))};
 }
 if(claim.role==='parent'){
  if(path==='/' )return {response:redirect('/parent')};
  if(!(path==='/parent'||path.startsWith('/api/parent/')))return {response:path.startsWith('/api/')?Response.json({error:'غير مسموح'},{status:403}):redirect('/parent')};
 }else{
  if(path==='/parent')return {response:redirect('/')};
  if(path.startsWith('/api/parent/'))return {response:Response.json({error:'غير مسموح'},{status:403})};
  if(claim.role!=='main_admin'&&(path==='/admin'||path==='/api/admin'||path.startsWith('/api/admin/')))return {response:path.startsWith('/api/')?Response.json({error:'صلاحية مدير النظام فقط'},{status:403}):redirect('/')};
  // External visitor/message services are currently a shared legacy integration.
  // They must never expose the legacy service's school-wide data to a new school.
  if(claim.sid!=='default'&&(/^\/api\/(?:visitors|messages|desk-close)(?:\/|$)/.test(path)))return {response:Response.json({error:'تتطلب هذه الخدمة الخارجية ربطاً خاصاً بالمدرسة'},{status:403})};
 }
 headers.set('oai-authenticated-user-id',claim.uid);
 headers.set('oai-authenticated-user-email',claim.e);
 headers.set('oai-authenticated-user-role',claim.role);
 headers.set('oai-authenticated-user-school-id',claim.sid);
 if(claim.phone)headers.set('oai-authenticated-user-parent-phone',claim.phone);
 if(verifiedName||claim.role==='parent'){headers.set('oai-authenticated-user-full-name',encodeURIComponent(verifiedName||'ولي الأمر'));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');}
 return {request:new Request(request,{headers}),school:{schoolId:claim.sid,role:claim.role,identity:claim.uid}};
}
