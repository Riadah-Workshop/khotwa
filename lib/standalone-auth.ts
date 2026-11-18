/**
 * Khotwa VPS preview login gateway.
 * This gateway MUST run before the Vinext request handler so browser-supplied
 * oai-authenticated-* identity headers are always removed and replaced only
 * after verification of a signed, expiring server-issued cookie.
 *
 * Intended for a single-administrator staging deployment, not multiuser SSO.
 */
type AuthEnv = {
  KHOTWA_ADMIN_EMAIL?: string;
  KHOTWA_ADMIN_PASSWORD_HASH?: string;
  KHOTWA_SESSION_SECRET?: string;
  KHOTWA_PUBLIC_ORIGINS?: string;
};
type AuthResult = { request?: Request; response?: Response };
const COOKIE_NAME = '__Host-khotwa_session';
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const htmlHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function encoded(value: Uint8Array): string {
  let result = '';
  for (const byte of value) result += String.fromCharCode(byte);
  return btoa(result).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decoded(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const data = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(data, (char) => char.charCodeAt(0));
  } catch { return null; }
}
function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0; i<a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function passwordMatches(password: string, record: string): Promise<boolean> {
  const parts=record.split('$');
  if(parts.length!==4 || parts[0]!=='pbkdf2-sha256') return false;
  const iterations=Number(parts[1]);
  if(!Number.isInteger(iterations) || iterations<200_000 || iterations>1_000_000 || password.length>1024) return false;
  const salt=decoded(parts[2]), expected=decoded(parts[3]);
  if(!salt || salt.length<16 || !expected || expected.length!==32) return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
  return eqBytes(actual,expected);
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signToken(secret: string, email: string): Promise<string> {
  const payload=encoded(encoder.encode(JSON.stringify({e:email,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS})));
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(secret),encoder.encode(payload)));
  return payload+'.'+encoded(signature);
}
async function verifyToken(secret: string, email: string, token: string): Promise<boolean> {
  const parts=token.split('.');
  if(parts.length!==2 || token.length>2048)return false;
  const signature=decoded(parts[1]),payloadBytes=decoded(parts[0]);
  if(!signature || signature.length!==32 || !payloadBytes)return false;
  const valid=await crypto.subtle.verify('HMAC',await hmacKey(secret),signature,encoder.encode(parts[0]));
  if(!valid)return false;
  try {
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payloadBytes));
    return body.e===email && Number.isSafeInteger(body.exp) && body.exp>Math.floor(Date.now()/1000) && body.exp<=Math.floor(Date.now()/1000)+SESSION_SECONDS;
  } catch { return false; }
}
function escapeHtml(s:string):string{return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function redirectTarget(input:string|null):string {
  if(!input || !input.startsWith('/') || input.startsWith('//'))return '/';
  try {const u=new URL(input,'https://local.invalid');return u.origin==='https://local.invalid' && !['/login','/logout','/callback'].includes(u.pathname)?u.pathname+u.search+u.hash:'/';}
  catch{return '/';}
}
function loginPage(returnTo:string,error=false):Response {
  const target=escapeHtml(returnTo);
  const content=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>خطوة | تسجيل الدخول</title><style>body{font-family:system-ui,sans-serif;background:#f3f6f8;color:#142c35;min-height:100vh;display:grid;place-items:center;margin:0}main{background:#fff;box-shadow:0 15px 50px #162e3522;border-radius:18px;padding:32px;width:min(360px,85vw)}h1{margin:0 0 6px;color:#174f42;font-size:29px}.sub{color:#52626b;margin-bottom:28px}label{display:block;font-weight:600;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b7c5cc;border-radius:8px;font-size:16px}button{width:100%;border:0;background:#174f42;color:white;border-radius:8px;padding:13px;font-size:16px;margin-top:22px;cursor:pointer}.error{color:#9c2626;font-weight:600}</style></head><body><main><h1>خطوة • Khotwa</h1><p class="sub">نظام الإدارة المدرسية — دخول مسؤول النظام</p>${error?'<p class="error">بيانات الدخول غير صحيحة.</p>':''}<form method="POST" action="/login"><input type="hidden" name="return_to" value="${target}"/><label for="email">البريد الإلكتروني</label><input id="email" name="email" type="email" autocomplete="username" required/><label for="password">كلمة المرور</label><input id="password" name="password" type="password" autocomplete="current-password" required/><button type="submit">تسجيل الدخول</button></form></main></body></html>`;
  return new Response(content,{status:error?401:200,headers:htmlHeaders});
}
function isSameOrigin(request: Request, configuredOrigins: string | undefined): boolean {
  // The Worker is behind Coolify's reverse proxy. Its Host/request URL may be
  // the internal container address; never compare browser Origin to that.
  // Instead, validate against explicit, HTTPS-only public application origins.
  const fetchSite = request.headers.get('sec-fetch-site');
  // 'same-site' is not an attack indicator: www.khotwa-ksa.com ->
  // khotwa-ksa.com is same-site but cross-origin. We still require Origin to
  // exactly match an explicitly configured public HTTPS origin below.
  if (fetchSite === 'cross-site') return false;
  const originHeader = request.headers.get('origin');
  if (!originHeader) return false; // Modern browser form POSTs carry Origin.
  try {
    const origin = new URL(originHeader);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) return false;
    const configured = (configuredOrigins || '').split(',').map(value => value.trim()).filter(Boolean);
    if (configured.length) {
      return configured.some(value => {
        try {
          const allowed = new URL(value);
          return allowed.protocol === 'https:' && allowed.pathname === '/' && !allowed.search && !allowed.hash && allowed.origin === origin.origin;
        } catch { return false; }
      });
    }
    // Preserve the original comparison for local developer use only.
    return origin.host === (request.headers.get('host') || new URL(request.url).host);
  } catch { return false; }
}

function sessionCookie(token:string):string{return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;}
function redirect(url:string,cookie?:string):Response {
  const headers=new Headers({'Location':url,'Cache-Control':'no-store'});
  if(cookie)headers.set('Set-Cookie',cookie);
  return new Response(null,{status:303,headers});
}
export async function handleKhotwaAuthentication(request:Request,env:AuthEnv):Promise<AuthResult>{
  // Never pass browser-supplied identity headers through, even for static files.
  const headers=new Headers(request.headers);
  for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);
  const url=new URL(request.url);
  if(url.pathname==='/healthz')return {response:Response.json({service:'khotwa',status:'up'},{headers:{'Cache-Control':'no-store'}})};
  if(url.pathname==='/login' || url.pathname==='/signin-with-chatgpt'){
    if(request.method==='GET')return {response:loginPage(redirectTarget(url.searchParams.get('return_to')))};
    if(request.method!=='POST')return {response:new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, POST'}})};
  }
  const email=(env.KHOTWA_ADMIN_EMAIL||'').trim().toLowerCase();
  const secret=env.KHOTWA_SESSION_SECRET||'';
  const record=env.KHOTWA_ADMIN_PASSWORD_HASH||'';
  if(!email || secret.length<32 || !record){
    return {response:new Response('Khotwa admin credentials not configured. See VPS-COOLIFY.md.',{status:503,headers:{'Cache-Control':'no-store'}})};
  }
  if(url.pathname==='/login' || url.pathname==='/signin-with-chatgpt'){
    if(!isSameOrigin(request,env.KHOTWA_PUBLIC_ORIGINS))return {response:new Response('Forbidden',{status:403})};
    const contentType=request.headers.get('content-type')||'';
    if(!contentType.startsWith('application/x-www-form-urlencoded') || Number(request.headers.get('content-length')||0)>8000)return {response:new Response('Bad Request',{status:400})};
    const form=await request.text();
    if(form.length>8000)return {response:new Response('Bad Request',{status:400})};
    const params=new URLSearchParams(form), suppliedEmail=(params.get('email')||'').trim().toLowerCase(),password=params.get('password')||'';
    const target=redirectTarget(params.get('return_to'));
    if(suppliedEmail!==email || !(await passwordMatches(password,record)))return {response:loginPage(target,true)};
    return {response:redirect(target,sessionCookie(await signToken(secret,email)))};
  }
  if(url.pathname==='/logout' || url.pathname==='/signout-with-chatgpt'){
    return {response:redirect(redirectTarget(url.searchParams.get('return_to')),sessionCookie('')+'; Max-Age=0')};
  }
  // Native static assets may bypass the Worker at the asset router; public files contain no school data.
  if(url.pathname.startsWith('/_next/') || url.pathname.startsWith('/assets/') || /\.(?:js|css|png|jpg|jpeg|svg|ico|webp|woff2?|ttf|webmanifest)$/.test(url.pathname)){
    return {request:new Request(request,{headers})};
  }
  const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE_NAME+'='))?.slice(COOKIE_NAME.length+1)||'';
  if(!cookie || !(await verifyToken(secret,email,cookie))){
    if(url.pathname.startsWith('/api/'))return {response:Response.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'no-store'}})};
    return {response:redirect('/login?return_to='+encodeURIComponent(redirectTarget(url.pathname+url.search)))};
  }
  headers.set('oai-authenticated-user-id','khotwa-admin');
  headers.set('oai-authenticated-user-email',email);
  return {request:new Request(request,{headers})};
}
