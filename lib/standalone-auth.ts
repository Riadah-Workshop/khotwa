/**
 * Signed, expiring session gateway. The VPS staging environment previously
 * allowed only one operator; the main admin can now create school deputies
 * and school-scoped parent accounts with independent passwords and revocation.
 * All browser identity headers are stripped before the identity is injected.
 */
import {verifyPassword} from './account-security.ts';
import {parentPhone} from './parent-view.ts';
import {activationAccount,activateDeputy,safeHtml} from './deputy-invites.ts';
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
const AUTH_AUDIT_REVISION='khotwa-deputy-invites-20261119-v2';
const encoder=new TextEncoder();
const htmlHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none"};
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
 try{const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&!['/login','/admin-login','/activate','/parent-login','/logout','/callback'].includes(u.pathname)?u.pathname+u.search+u.hash:'/';}catch{return '/';}
}
const css=`body{font-family:system-ui,Tahoma,sans-serif;background:#f3f6f8;color:#142c35;min-height:100vh;display:grid;place-items:center;margin:0}main{background:#fff;box-shadow:0 15px 50px #162e3522;border-radius:18px;padding:32px;width:min(390px,85vw)}h1{margin:0 0 6px;color:#174f42;font-size:29px}.sub{color:#52626b;margin-bottom:28px}label{display:block;font-weight:600;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c5cc;border-radius:8px;font-size:16px}button{width:100%;border:0;background:#174f42;color:white;border-radius:8px;padding:13px;font-size:16px;margin-top:22px;cursor:pointer}.error{color:#9c2626;font-weight:600}a{color:#174f42;display:inline-block;margin-top:20px}`;
function loginPage(returnTo:string,error=false,kind:'school'|'parent'|'admin'='school'):Response {
 const parent=kind==='parent',admin=kind==='admin';
 const action=parent?'/parent-login':admin?'/admin-login':'/login';
 const form=parent?`<label>رمز المدرسة</label><input name="school_code" maxlength="25" autocomplete="organization" required/><label>رقم جوال ولي الأمر</label><input name="phone" type="tel" maxlength="20" inputmode="tel" required/>`:`<label for="email">البريد الإلكتروني</label><input id="email" name="email" type="email" autocomplete="username" required/>`;
 const sub=parent?'بوابة ولي الأمر — متابعة أبنائك':admin?'مدير النظام — إدارة المدارس والحسابات':'وكيل شؤون الطلاب — مساحة المدرسة';
 const links=parent?`<a href="/login">دخول المدرسة</a>`:admin?`<a href="/login">دخول وكلاء شؤون الطلاب</a>`:`<a href="/parent-login">بوابة ولي الأمر</a><span style="margin:0 12px">•</span><a href="/admin-login">مدير النظام</a>`;
 const content=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>خطوة | تسجيل الدخول</title><style>${css}</style></head><body><main><h1>خطوة • Khotwa</h1><p class="sub">${sub}</p>${error?'<p class="error">بيانات الدخول غير صحيحة أو الحساب غير مفعل.</p>':''}<form method="POST" action="${action}"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/>${form}<label for="password">كلمة المرور</label><input id="password" name="password" type="password" autocomplete="current-password" required/><button type="submit">تسجيل الدخول</button></form>${links}</main></body></html>`;
 return new Response(content,{status:error?401:200,headers:htmlHeaders});
}
function activationPage(token:string,fullName:string,school:string,error='',success=false):Response{
 const message=success?'<p>تم تفعيل حسابك وتعيين كلمة المرور بنجاح.</p><a href="/login">تسجيل دخول وكيل شؤون الطلاب</a>':error?`<p class="error">${escapeHtml(error)}</p><a href="/login">العودة لتسجيل الدخول</a>`:`<p>مرحباً ${escapeHtml(fullName)}، مدرسة ${escapeHtml(school)}.</p><p>أنشئ كلمة مرور لحسابك لا تقل عن 12 حرفاً. الرابط صالح لمرة واحدة فقط.</p><form method="POST" action="/activate"><input type="hidden" name="token" value="${escapeHtml(token)}"/><label>كلمة المرور الجديدة</label><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required/><label>تأكيد كلمة المرور</label><input name="confirm_password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required/><button>تفعيل الحساب</button></form>`;
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>خطوة | تفعيل الحساب</title><style>${css}</style></head><body><main><h1>خطوة • تفعيل الوكيل</h1>${message}</main></body></html>`;
 return new Response(html,{status:error?400:200,headers:htmlHeaders});
}
function loginOriginRejection(request:Request,configuredOrigins:string|undefined):string|null{
 const fetchSite=request.headers.get('sec-fetch-site');if(fetchSite==='cross-site')return 'cross-site-fetch';
 const original=request.headers.get('origin');const fallback=!original&&(fetchSite==='same-origin'||fetchSite==='same-site')?request.headers.get('referer'):null;
 if(!original&&!fallback)return 'missing-origin';
 // Some browsers send the opaque Origin value `null` after an HTTPS
 // canonical-host redirect or privacy handling. Allow that *only* when the
 // browser itself identifies a same-origin top-level form navigation.
 // Fetch Metadata headers are controlled by the browser, not page scripts.
 // Retain the existing strict checks for all other requests.
 if(original==='null'){
  return fetchSite==='same-origin'&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document'
   ?null:'invalid-origin';
 }
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
 // Public webhook access is safe only because the route verifies the Resend Svix signature.
 if(path==='/api/webhooks/resend')return {request:new Request(request,{headers})};
 if(path==='/activate'){
  if(!env.DB)return {response:activationPage('','','','بوابة التفعيل غير متاحة')};
  if(request.method==='GET'){
   const token=url.searchParams.get('token')||'';
   const account=await activationAccount(env.DB,token);
   return {response:account?activationPage(token,account.full_name,account.school_name):activationPage('','','','رابط التفعيل غير صحيح أو منتهي الصلاحية')};
  }
  if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405})};
  if(loginOriginRejection(request,env.KHOTWA_PUBLIC_ORIGINS))return {response:new Response('Forbidden',{status:403})};
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')||Number(request.headers.get('content-length')||0)>8000)return {response:new Response('Bad Request',{status:400})};
  const raw=await request.text();if(raw.length>8000)return {response:new Response('Bad Request',{status:400})};
  const form=new URLSearchParams(raw),token=form.get('token')||'',password=form.get('password')||'',confirm=form.get('confirm_password')||'';
  if(password!==confirm||password.length<12||password.length>128)return {response:activationPage('','','','تأكد من تطابق كلمتي المرور وأن تكونا 12 حرفاً على الأقل')};
  try{return {response:await activateDeputy(env.DB,token,password)?activationPage('','','','',true):activationPage('','','','رابط التفعيل مستخدم أو منتهي الصلاحية')};}
  catch{return {response:activationPage('','','','تعذر التفعيل. يرجى التواصل مع مدير النظام')};}
 }
 const parentLogin=path==='/parent-login';
 const adminLogin=path==='/admin-login';
 const login=path==='/login'||path==='/signin-with-chatgpt'||parentLogin||adminLogin;
 const kind=parentLogin?'parent':adminLogin?'admin':'school';
 if(login){if(request.method==='GET')return {response:loginPage(adminLogin?'/admin':redirectTarget(url.searchParams.get('return_to')),false,kind)};if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, POST'}})};}
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
  const limitKey=parentLogin?'p:'+schoolCode+':'+phone:(adminLogin?'admin:':'school:')+loginEmail;
  try{
   if(await isBlocked(env.DB,limitKey))return {response:loginPage(parentLogin?'/parent':adminLogin?'/admin':'/',true,kind)};
   let claim:Omit<SessionClaims,'exp'>|null=null;
   if(parentLogin){
    if(phone&&/^[A-Z0-9-]{2,25}$/.test(schoolCode)&&env.DB){
     const row=await env.DB.prepare('SELECT p.id,p.school_id,p.phone,p.password_hash,p.session_version FROM khotwa_parent_users p JOIN khotwa_schools s ON s.id=p.school_id WHERE s.code=? AND s.active=1 AND p.phone=? AND p.active=1').bind(schoolCode,phone).first<any>();
     if(row&&await verifyPassword(password,row.password_hash))claim={e:'parent:'+row.id,uid:row.id,role:'parent',sid:row.school_id,ver:row.session_version,phone:row.phone};
    }
   }else if(adminLogin&&loginEmail===email&&await verifyPassword(password,record)){
    claim={e:email,uid:'khotwa-admin',role:'main_admin',sid:'default',ver:1};
   }else if(!adminLogin&&env.DB&&loginEmail){
    const row=await env.DB.prepare("SELECT a.id,a.school_id,a.email,a.password_hash,a.session_version,a.activated_at FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.email=? AND a.active=1 AND s.active=1 AND a.role='deputy'").bind(loginEmail).first<any>();
    if(row?.activated_at&&await verifyPassword(password,row.password_hash)){
     await env.DB.prepare('UPDATE khotwa_accounts SET first_login_at=COALESCE(first_login_at,?) WHERE id=?').bind(new Date().toISOString(),row.id).run();
     claim={e:row.email,uid:row.id,role:'deputy',sid:row.school_id,ver:row.session_version};
    }
   }
   if(!claim){await recordFailure(env.DB,limitKey);return {response:loginPage(parentLogin?'/parent':adminLogin?'/admin':'/',true,kind)};}
   await clearFailures(env.DB,limitKey);
   return {response:redirect(parentLogin?'/parent':adminLogin?'/admin':target,sessionCookie(await signToken(secret,claim)))};
  }catch{return {response:new Response('Login service unavailable',{status:503,headers:{'Cache-Control':'no-store'}})};}
 }
 if(path==='/logout'||path==='/signout-with-chatgpt')return {response:redirect(url.searchParams.get('next')==='/admin-login'?'/admin-login':'/login',sessionCookie('')+'; Max-Age=0')};
 if(path.startsWith('/_next/')||path.startsWith('/assets/')||/\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|webmanifest)$/.test(path))return {request:new Request(request,{headers})};
 const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1)||'';
 let claim=cookie?await readToken(secret,cookie):null;
 let verifiedName:string|null=null;
 if(claim?.role==='main_admin'&&(claim.e!==email||claim.uid!=='khotwa-admin'||claim.ver!==1))claim=null;
 if(claim?.role==='deputy'){
  try{const r=await env.DB?.prepare('SELECT a.email,a.full_name,a.school_id,a.active,a.session_version,a.activated_at,s.active AS school_active FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.id=?').bind(claim.uid).first<any>();if(!r||!r.active||!r.activated_at||!r.school_active||r.email!==claim.e||r.school_id!==claim.sid||r.session_version!==claim.ver)claim=null;else verifiedName=r.full_name;}catch{claim=null;}
 }
 if(claim?.role==='parent'){
  try{const r=await env.DB?.prepare('SELECT p.phone,p.school_id,p.active,p.session_version,s.active AS school_active FROM khotwa_parent_users p JOIN khotwa_schools s ON s.id=p.school_id WHERE p.id=?').bind(claim.uid).first<any>();if(!r||!r.active||!r.school_active||r.phone!==claim.phone||r.school_id!==claim.sid||r.session_version!==claim.ver)claim=null;}catch{claim=null;}
 }
 if(claim?.role==='main_admin'&&claim.sid!=='default'){
  try{const r=await env.DB?.prepare('SELECT active FROM khotwa_schools WHERE id=?').bind(claim.sid).first<{active:number}>();if(!r?.active)claim=null;}catch{claim=null;}
 }
 if(!claim){
  if(path.startsWith('/api/'))return {response:Response.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'no-store'}})};
  return {response:redirect((path==='/parent'?'/parent-login':(path==='/admin'||path.startsWith('/admin/'))?'/admin-login':'/login')+'?return_to='+encodeURIComponent(redirectTarget(path+url.search)))};
 }
 if(claim.role==='main_admin'&&claim.sid==='default'&&path==='/')return {response:redirect('/admin')};
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
