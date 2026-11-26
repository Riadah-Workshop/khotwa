/**
 * Signed, expiring session gateway. The VPS staging environment previously
 * allowed only one operator; the main admin can now create school deputies
 * and school-scoped parent accounts with independent passwords and revocation.
 * All browser identity headers are stripped before the identity is injected.
 */
import {verifyPassword} from './account-security.ts';
import {adminCredentials} from './admin-credentials.ts';
import {normalizeAgentIdentifier} from './fushati/identifiers.ts';
import {getFushatiInvite,activateFushatiAdmin} from './fushati/invitations.ts';
import {parentPhone} from './parent-view.ts';
import {parentLinkedSchools} from './parent-identities.ts';
import {verifyAgentEmailChange} from './account-profile.ts';
import {activationAccount,activateDeputy,safeHtml} from './deputy-invites.ts';
import type {SchoolRole} from './school-tenancy';

type AuthEnv={
 DB?:D1Database;
 KHOTWA_ADMIN_EMAIL?:string;
 KHOTWA_ADMIN_PASSWORD_HASH?:string;
 KHOTWA_SESSION_SECRET?:string;
 KHOTWA_PUBLIC_ORIGINS?:string;
 KHOTWA_APP_URL?:string;KHOTWA_FROM_EMAIL?:string;KHOTWA_SMTP_HOST?:string;KHOTWA_SMTP_PORT?:string;KHOTWA_SMTP_USER?:string;KHOTWA_SMTP_PASSWORD?:string;KHOTWA_SMTP_RELAY_URL?:string;KHOTWA_SMTP_RELAY_TOKEN?:string;
};
type AuthResult={request?:Request;response?:Response;school?:{schoolId:string;role:SchoolRole;identity:string}};
export type SessionClaims={e:string;uid:string;role:SchoolRole;sid:string;ver:number;phone?:string;exp:number};
const COOKIE_NAME='__Host-khotwa_session';
const SESSION_SECONDS=12*60*60;
const AUTH_AUDIT_REVISION='khotwa-shared-parents-20261122-v2';
const encoder=new TextEncoder();
const htmlHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
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
  if(!v||!['main_admin','deputy','manager','parent','fushati_admin','fushati_agent'].includes(v.role)||typeof v.e!=='string'||typeof v.uid!=='string'||typeof v.sid!=='string'||!Number.isInteger(v.ver)||!Number.isSafeInteger(v.exp)||v.exp<=Math.floor(Date.now()/1000)||v.exp>Math.floor(Date.now()/1000)+SESSION_SECONDS)return null;
  if(v.sid!=='default'&&!/^[a-f0-9]{12}$/.test(v.sid))return null;
  return v;
 }catch{return null;}
}
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||''));
function redirectTarget(value:string|null):string{
 if(!value||!value.startsWith('/')||value.startsWith('//'))return '/';
 try{const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&!['/login','/admin-login','/activate','/parent-login','/manager-login','/fushati-admin-login','/fushati-agent-login','/logout','/callback'].includes(u.pathname)?u.pathname+u.search+u.hash:'/';}catch{return '/';}
}
const css=`body{font-family:system-ui,Tahoma,sans-serif;background:#f3f6f8;color:#142c35;min-height:100vh;display:grid;place-items:center;margin:0}main{background:#fff;box-shadow:0 15px 50px #162e3522;border-radius:18px;padding:32px;width:min(390px,85vw)}h1{margin:0 0 6px;color:#174f42;font-size:29px}.sub{color:#52626b;margin-bottom:28px}label{display:block;font-weight:600;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c5cc;border-radius:8px;font-size:16px}button{width:100%;border:0;background:#174f42;color:white;border-radius:8px;padding:13px;font-size:16px;margin-top:22px;cursor:pointer}.error{color:#9c2626;font-weight:600}a{color:#174f42;display:inline-block;margin-top:20px}`;
function loginPage(returnTo:string,error=false,kind:'school'|'parent'|'admin'|'manager'|'fushati_admin'|'fushati_agent'='school',english=false):Response {
 const parent=kind==='parent',admin=kind==='admin',manager=kind==='manager',fushatiAdmin=kind==='fushati_admin',fushatiAgent=kind==='fushati_agent',en=english;
 const t=(ar:string,eng:string)=>en?eng:ar;
 const action=parent?'/parent-login':admin?'/admin-login':manager?'/manager-login':fushatiAdmin?'/fushati-admin-login':fushatiAgent?'/fushati-agent-login':'/login';
 const form=parent?`<label>${t('رقم جوال ولي الأمر','Parent mobile number')}</label><input name="phone" type="tel" maxlength="20" inputmode="tel" autocomplete="username" required/>`:fushatiAgent?`<label>${t('رقم الجوال أو الهوية / الإقامة','Mobile phone or national ID / Iqama')}</label><input name="identifier" type="text" maxlength="100" autocomplete="username" dir="ltr" required/>`:`<label for="email">${t('البريد الإلكتروني','Email address')}</label><input id="email" name="email" type="email" autocomplete="username" required/>`;
 const sub=parent?t('بوابة ولي الأمر — متابعة أبنائك','Parent Portal — Your children'):admin?t('مدير النظام — إدارة المدارس والحسابات','System Administrator — Schools and Accounts'):manager?t('مدير المدرسة — التقارير والإحصائيات (للقراءة فقط)','School Manager — Read-only Analytics'):fushatiAdmin?t('فسحتي — مدير المقاصف المدرسية','Fushati — Cafeteria Administrator'):fushatiAgent?t('فسحتي — موظف المقصف','Fushati — Cafeteria Agent'):t('وكيل شؤون الطلاب — مساحة المدرسة','Student Affairs Agent — School Portal');
 const links=(fushatiAdmin||fushatiAgent)?`<a href="${fushatiAdmin?'/fushati-agent-login':'/fushati-admin-login'}">${fushatiAdmin?t('دخول موظف المقصف','Cafeteria Agent Login'):t('دخول مدير فسحتي','Fushati Admin Login')}</a><span style="margin:0 12px">•</span><a href="/parent-login">${t('بوابة ولي الأمر','Parent Portal')}</a>`:parent?`<a href="/login">${t('دخول المدرسة','School Login')}</a>`:admin?`<a href="/login">${t('دخول وكلاء شؤون الطلاب','Student Affairs Agent login')}</a>`:manager?`<a href="/login">${t('دخول وكيل شؤون الطلاب','Student Affairs Login')}</a>`:`<a href="/parent-login">${t('بوابة ولي الأمر','Parent Portal')}</a><span style="margin:0 12px">•</span><a href="/manager-login">${t('مدير المدرسة','School Manager')}</a><span style="margin:0 12px">•</span><a href="/admin-login">${t('مدير النظام','System Admin')}</a><span style="margin:0 12px">•</span><a href="/fushati-admin-login">${t('مدير فسحتي','Fushati Admin')}</a><span style="margin:0 12px">•</span><a href="/fushati-agent-login">${t('موظف المقصف','Cafeteria Agent')}</a>`;
 const langToggle=`<a href="${action}?lang=${en?'ar':'en'}" style="float:${en?'right':'left'};margin:0">${en?'العربية':'English'}</a>`;
 const content=`<!doctype html><html lang="${en?'en':'ar'}" dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${en?'Khotwa | Sign in':'خطوة | تسجيل الدخول'}</title><style>${css}</style></head><body><main>${langToggle}<h1>خطوة • Khotwa</h1><p class="sub">${sub}</p>${error?`<p class="error">${en?'Incorrect credentials or account not activated.':'بيانات الدخول غير صحيحة أو الحساب غير مفعل.'}</p>`:''}<form method="POST" action="${action}"><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/><input type="hidden" name="ui_lang" value="${en?'en':'ar'}"/>${form}<label for="password">${en?'Password':'كلمة المرور'}</label><input id="password" name="password" type="password" autocomplete="current-password" required/><button type="submit">${en?'Sign in':'تسجيل الدخول'}</button></form>${links}</main></body></html>`;
 return new Response(content,{status:error?401:200,headers:htmlHeaders});
}
function activationPage(token:string,fullName:string,school:string,error='',success=false,manager=false):Response{
 const message=success?`<p>تم تفعيل حسابك وتعيين كلمة المرور بنجاح.</p><a href="${manager?'/manager-login':'/login'}">${manager?'تسجيل دخول مدير المدرسة':'تسجيل دخول وكيل شؤون الطلاب'}</a>`:error?`<p class="error">${escapeHtml(error)}</p><a href="/login">العودة لتسجيل الدخول</a>`:`<p>مرحباً ${escapeHtml(fullName)}، مدرسة ${escapeHtml(school)}.</p><p>أنشئ كلمة مرور لحسابك لا تقل عن 12 حرفاً. الرابط صالح لمرة واحدة فقط.</p><form method="POST" action="/activate"><input type="hidden" name="token" value="${escapeHtml(token)}"/><label>كلمة المرور الجديدة</label><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required/><label>تأكيد كلمة المرور</label><input name="confirm_password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required/><button>تفعيل الحساب</button></form>`;
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>خطوة | تفعيل الحساب</title><style>${css}</style></head><body><main><h1>خطوة • ${manager?'تفعيل مدير المدرسة':'تفعيل الوكيل'}</h1>${message}</main></body></html>`;
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
export async function adminSwitchCookie(secret:string,email:string,schoolId:string,version=1):Promise<string>{
 if(schoolId!=='default'&&!/^[a-f0-9]{12}$/.test(schoolId))throw new Error('Invalid school identifier');
 return sessionCookie(await signToken(secret,{e:email.toLowerCase(),uid:'khotwa-admin',role:'main_admin',sid:schoolId,ver:version}));
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
 if(path==='/account/verify-email'){
  if(request.method!=='GET')return {response:new Response('Method Not Allowed',{status:405})};
  if(!env.DB)return {response:new Response('Service unavailable',{status:503})};
  try{
   const result=await verifyAgentEmailChange(env.DB,url.searchParams.get('token')||'');
   const content=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>خطوة | تغيير البريد</title><style>${css}</style></head><body><main><h1>خطوة</h1><p>${result.ok?'تم تحديث البريد الإلكتروني بنجاح. سجل الدخول مجددًا بالبريد الجديد.':escapeHtml(result.error)}</p><a href="/login">تسجيل الدخول</a></main></body></html>`;
   return {response:new Response(content,{status:result.ok?200:400,headers:htmlHeaders})};
  }catch{return {response:new Response('Email confirmation unavailable',{status:503,headers:{'Cache-Control':'no-store'}})};}
 }
 if(path==='/fushati/activate'){
  if(!env.DB)return {response:new Response('Database unavailable',{status:503})};
  const token=url.searchParams.get('token')||'';
  if(request.method==='GET'){
   const invite=await getFushatiInvite(env.DB,token);
   const content=invite?`<h1>فسحتي | Fushati</h1><p>مرحباً ${escapeHtml(invite.full_name)} — أنشئ كلمة مرور مدير فسحتي.</p><form method="POST" action="/fushati/activate"><input type="hidden" name="token" value="${escapeHtml(token)}"/><label>كلمة المرور الجديدة (12 حرفاً على الأقل)</label><input type="password" name="password" minlength="12" maxlength="128" required autocomplete="new-password"/><label>تأكيد كلمة المرور</label><input type="password" name="confirm_password" minlength="12" maxlength="128" required autocomplete="new-password"/><button>تفعيل الحساب</button></form>`:'<h1>فسحتي</h1><p class="error">رابط التفعيل غير صالح أو منتهي الصلاحية.</p>';
   return {response:new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main>${content}</main></body></html>`,{status:invite?200:400,headers:htmlHeaders})};
  }
  if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405})};
  if(loginOriginRejection(request,env.KHOTWA_PUBLIC_ORIGINS))return {response:new Response('Forbidden',{status:403})};
  const raw=await request.text();if(raw.length>8000)return {response:new Response('Bad Request',{status:400})};
  const form=new URLSearchParams(raw),password=form.get('password')||'';
  if(password!==form.get('confirm_password')||password.length<12||password.length>128)return {response:new Response('Password confirmation mismatch (minimum 12 characters)',{status:400})};
  try{return {response:await activateFushatiAdmin(env.DB,form.get('token')||'',password)?redirect('/fushati-admin-login'):new Response('Activation link expired or already used',{status:400})};}
  catch{return {response:new Response('Activation service unavailable',{status:503})};}
 }
 if(path==='/activate'){
  if(!env.DB)return {response:activationPage('','','','بوابة التفعيل غير متاحة')};
  if(request.method==='GET'){
   const token=url.searchParams.get('token')||'';
   const account=await activationAccount(env.DB,token);
   return {response:account?activationPage(token,account.full_name,account.school_name,'',false,account.role==='manager'):activationPage('','','','رابط التفعيل غير صحيح أو منتهي الصلاحية')};
  }
  if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405})};
  if(loginOriginRejection(request,env.KHOTWA_PUBLIC_ORIGINS))return {response:new Response('Forbidden',{status:403})};
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')||Number(request.headers.get('content-length')||0)>8000)return {response:new Response('Bad Request',{status:400})};
  const raw=await request.text();if(raw.length>8000)return {response:new Response('Bad Request',{status:400})};
  const form=new URLSearchParams(raw),token=form.get('token')||'',password=form.get('password')||'',confirm=form.get('confirm_password')||'';
  if(password!==confirm||password.length<12||password.length>128)return {response:activationPage('','','','تأكد من تطابق كلمتي المرور وأن تكونا 12 حرفاً على الأقل')};
  try{const account=await activationAccount(env.DB,token);return {response:await activateDeputy(env.DB,token,password)?activationPage('','','','',true,account?.role==='manager'):activationPage('','','','رابط التفعيل مستخدم أو منتهي الصلاحية')};}
  catch{return {response:activationPage('','','','تعذر التفعيل. يرجى التواصل مع مدير النظام')};}
 }
 const parentLogin=path==='/parent-login';
 const adminLogin=path==='/admin-login',managerLogin=path==='/manager-login',fushatiAdminLogin=path==='/fushati-admin-login',fushatiAgentLogin=path==='/fushati-agent-login';
 const login=path==='/login'||path==='/signin-with-chatgpt'||parentLogin||adminLogin||managerLogin||fushatiAdminLogin||fushatiAgentLogin;
 const kind=parentLogin?'parent':adminLogin?'admin':managerLogin?'manager':fushatiAdminLogin?'fushati_admin':fushatiAgentLogin?'fushati_agent':'school';
 if(login){if(request.method==='GET')return {response:loginPage(fushatiAdminLogin?'/fushati/admin':fushatiAgentLogin?'/fushati/agent':adminLogin?'/admin':managerLogin?'/manager':redirectTarget(url.searchParams.get('return_to')),false,kind,url.searchParams.get('lang')==='en')};if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, POST'}})};}
 const admin=await adminCredentials(env),email=admin.email,secret=env.KHOTWA_SESSION_SECRET||'',record=admin.passwordHash;
 if(!email||secret.length<32||!record)return {response:new Response('Khotwa admin credentials not configured. See VPS-COOLIFY.md.',{status:503,headers:{'Cache-Control':'no-store'}})};
 if(login){
  const rejection=loginOriginRejection(request,env.KHOTWA_PUBLIC_ORIGINS);
  if(rejection)return {response:new Response('Forbidden',{status:403,headers:{'Cache-Control':'no-store','X-Khotwa-Auth-Revision':AUTH_AUDIT_REVISION,'X-Khotwa-Auth-Reject':rejection}})};
  const ct=request.headers.get('content-type')||'';
  if(!ct.startsWith('application/x-www-form-urlencoded')||Number(request.headers.get('content-length')||0)>8000)return {response:new Response('Bad Request',{status:400})};
  const raw=await request.text();if(raw.length>8000)return {response:new Response('Bad Request',{status:400})};
  const p=new URLSearchParams(raw),password=p.get('password')||'',target=redirectTarget(p.get('return_to')),loginEnglish=p.get('ui_lang')==='en';
  const loginEmail=(p.get('email')||'').trim().toLowerCase();const agentIdentifier=normalizeAgentIdentifier(p.get('identifier'))||(p.get('identifier')||'').trim().toLowerCase();const phone=parentPhone(p.get('phone'));
  const limitKey=parentLogin?'p:'+phone:(adminLogin?'admin:':managerLogin?'manager:':fushatiAdminLogin?'fushati-admin:':fushatiAgentLogin?'fushati-agent:':'school:')+(fushatiAgentLogin?agentIdentifier:loginEmail);
  try{
   if(await isBlocked(env.DB,limitKey))return {response:loginPage(parentLogin?'/parent':fushatiAdminLogin?'/fushati/admin':fushatiAgentLogin?'/fushati/agent':adminLogin?'/admin':managerLogin?'/manager':'/',true,kind,loginEnglish)};
   let claim:Omit<SessionClaims,'exp'>|null=null;
   if(parentLogin){
    if(phone&&env.DB){
     const row=await env.DB.prepare('SELECT phone,password_hash,session_version FROM khotwa_parent_identities WHERE phone=?').bind(phone).first<any>();
     if(row&&await verifyPassword(password,row.password_hash)&&(await parentLinkedSchools(env.DB,phone)).length){
      claim={e:'parent:'+phone,uid:'parent:'+phone,role:'parent',sid:'default',ver:row.session_version,phone};
     }
    }
   }else if(adminLogin&&loginEmail===email&&await verifyPassword(password,record)){
    claim={e:email,uid:'khotwa-admin',role:'main_admin',sid:'default',ver:admin.version};
   }else if((fushatiAdminLogin||fushatiAgentLogin)&&env.DB&&(fushatiAgentLogin?agentIdentifier:loginEmail)){
    const expectedRole=fushatiAdminLogin?'fushati_admin':'fushati_agent';
    const row=fushatiAdminLogin?await env.DB.prepare('SELECT * FROM fushati_users WHERE email=?').bind(loginEmail).first<any>():await env.DB.prepare("SELECT * FROM fushati_users WHERE login_identifier=? OR (login_identifier='' AND email=?)").bind(agentIdentifier,agentIdentifier).first<any>();
    if(row?.active===1&&row.role===expectedRole&&(expectedRole!=='fushati_admin'||row.activated_at)&&await verifyPassword(password,row.password_hash)){claim={e:row.email,uid:row.id,role:expectedRole,sid:'default',ver:row.session_version};}
   }else if(!adminLogin&&env.DB&&loginEmail){
    const row=await env.DB.prepare("SELECT a.id,a.school_id,a.email,a.password_hash,a.session_version,a.activated_at,EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=a.id) AS is_manager FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.email=? AND a.active=1 AND s.active=1 AND a.role='deputy'").bind(loginEmail).first<any>();
    if(row?.activated_at&&Boolean(row.is_manager)===managerLogin&&await verifyPassword(password,row.password_hash)){
     await env.DB.prepare('UPDATE khotwa_accounts SET first_login_at=COALESCE(first_login_at,?) WHERE id=?').bind(new Date().toISOString(),row.id).run();
     claim={e:row.email,uid:row.id,role:managerLogin?'manager':'deputy',sid:row.school_id,ver:row.session_version};
    }
   }
   if(!claim){await recordFailure(env.DB,limitKey);return {response:loginPage(parentLogin?'/parent':fushatiAdminLogin?'/fushati/admin':fushatiAgentLogin?'/fushati/agent':adminLogin?'/admin':managerLogin?'/manager':'/',true,kind,loginEnglish)};}
   await clearFailures(env.DB,limitKey);
   return {response:redirect(parentLogin?'/parent':fushatiAdminLogin?'/fushati/admin':fushatiAgentLogin?'/fushati/agent':adminLogin?'/admin':managerLogin?'/manager':target,sessionCookie(await signToken(secret,claim)))};
  }catch{return {response:new Response('Login service unavailable',{status:503,headers:{'Cache-Control':'no-store'}})};}
 }
 if(path==='/logout'||path==='/signout-with-chatgpt')return {response:redirect(['/admin-login','/parent-login','/manager-login','/fushati-admin-login','/fushati-agent-login'].includes(url.searchParams.get('next')||'')?url.searchParams.get('next')!:'/login',sessionCookie('')+'; Max-Age=0')};
 if(path.startsWith('/_next/')||path.startsWith('/assets/')||/\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|webmanifest)$/.test(path))return {request:new Request(request,{headers})};
 const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1)||'';
 let claim=cookie?await readToken(secret,cookie):null;
 let verifiedName:string|null=null;
 if(claim?.role==='main_admin'&&(claim.e!==email||claim.uid!=='khotwa-admin'||claim.ver!==admin.version))claim=null;
 if(claim?.role==='deputy'||claim?.role==='manager'){
  try{const r=await env.DB?.prepare('SELECT a.email,a.full_name,a.school_id,a.active,a.session_version,a.activated_at,s.active AS school_active,EXISTS(SELECT 1 FROM khotwa_manager_accounts m WHERE m.account_id=a.id) AS is_manager FROM khotwa_accounts a JOIN khotwa_schools s ON s.id=a.school_id WHERE a.id=?').bind(claim.uid).first<any>();if(!r||!r.active||!r.activated_at||!r.school_active||r.email!==claim.e||r.school_id!==claim.sid||r.session_version!==claim.ver||Boolean(r.is_manager)!==(claim.role==='manager'))claim=null;else verifiedName=r.full_name;}catch{claim=null;}
 }
 if(claim?.role==='fushati_admin'||claim?.role==='fushati_agent'){
  try{const row=await env.DB?.prepare('SELECT email,full_name,role,active,session_version,activated_at FROM fushati_users WHERE id=?').bind(claim.uid).first<any>();if(!row||row.active!==1||row.role!==claim.role||row.email!==claim.e||claim.sid!=='default'||row.session_version!==claim.ver||(claim.role==='fushati_admin'&&!row.activated_at))claim=null;else verifiedName=row.full_name;}catch{claim=null;}
 }
 if(claim?.role==='parent'){
  try{const r=await env.DB?.prepare('SELECT phone,session_version FROM khotwa_parent_identities WHERE phone=?').bind(claim.phone).first<any>();if(!r||claim.uid!=='parent:'+claim.phone||claim.e!=='parent:'+claim.phone||claim.sid!=='default'||r.phone!==claim.phone||r.session_version!==claim.ver||!(await parentLinkedSchools(env.DB!,claim.phone)).length)claim=null;}catch{claim=null;}
 }
 if(claim?.role==='main_admin'&&claim.sid!=='default'){
  try{const r=await env.DB?.prepare('SELECT active FROM khotwa_schools WHERE id=?').bind(claim.sid).first<{active:number}>();if(!r?.active)claim=null;}catch{claim=null;}
 }
 if(!claim){
  if(path.startsWith('/api/'))return {response:Response.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'no-store'}})};
  return {response:redirect((path.startsWith('/fushati/admin')?'/fushati-admin-login':path.startsWith('/fushati/agent')?'/fushati-agent-login':path==='/parent'?'/parent-login':path==='/manager'?'/manager-login':(path==='/admin'||path.startsWith('/admin/'))?'/admin-login':'/login')+'?return_to='+encodeURIComponent(redirectTarget(path+url.search)))};
 }
 if(path==='/account'||path.startsWith('/api/account/')){
  if(claim.role!=='deputy')return {response:path.startsWith('/api/')?Response.json({error:'Student Affairs Agent only'},{status:403}):redirect(claim.role==='manager'?'/manager':claim.role==='parent'?'/parent':'/admin')};
 }
 if(claim.role==='main_admin'&&claim.sid==='default'&&path==='/')return {response:redirect('/admin')};
 if(claim.role==='fushati_admin'||claim.role==='fushati_agent'){
  const home=claim.role==='fushati_admin'?'/fushati/admin':'/fushati/agent';
  if(path==='/')return {response:redirect(home)};
  if(!(path===home||path.startsWith('/api/fushati/'))&&path!=='/api/fushati')return {response:path.startsWith('/api/')?Response.json({error:'فسحتي فقط'},{status:403}):redirect(home)};
 }
 if(path.startsWith('/fushati/')&&!(claim.role==='main_admin'||claim.role==='fushati_admin'||(claim.role==='fushati_agent'&&path==='/fushati/agent')))
  return {response:redirect(claim.role==='parent'?'/parent':claim.role==='manager'?'/manager':'/')};
 if((path==='/api/fushati'||path.startsWith('/api/fushati/'))&&!['main_admin','fushati_admin','fushati_agent','parent','manager','deputy'].includes(claim.role))
  return {response:Response.json({error:'فسحتي غير متاحة لهذا الدور'},{status:403})};
 if(claim.role==='manager'){
  if(path==='/')return {response:redirect('/manager')};
  if(!(path==='/manager'||path.startsWith('/api/manager/')||path==='/api/fushati'))return {response:path.startsWith('/api/')?Response.json({error:'Read-only school manager role'},{status:403}):redirect('/manager')};
 }
 if(claim.role!=='main_admin'&&path==='/api/trip-cleanup')return {response:Response.json({error:'Admin only'},{status:403})};
 if(claim.role!=='manager'&&(path==='/manager'||path.startsWith('/api/manager/'))&&claim.role!=='main_admin')return {response:path.startsWith('/api/')?Response.json({error:'غير مسموح'},{status:403}):redirect('/')};
 if(claim.role==='parent'){
  if(path==='/' )return {response:redirect('/parent')};
  if(!(path==='/parent'||path.startsWith('/api/parent/')||path==='/api/fushati'||path.startsWith('/api/fushati/')))return {response:path.startsWith('/api/')?Response.json({error:'غير مسموح'},{status:403}):redirect('/parent')};
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
