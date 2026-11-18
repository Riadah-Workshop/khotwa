import assert from 'node:assert/strict';
import {randomBytes, webcrypto} from 'node:crypto';
import {handleKhotwaAuthentication as gateway} from '../lib/standalone-auth.ts';
const salt=randomBytes(16), password='ExampleOnlyNotARealPassword123!';
const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const hash=Buffer.from(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:240000},key,256)).toString('base64url');
const env={KHOTWA_PUBLIC_ORIGINS:'https://khotwa-test.example.com,https://www.khotwa-test.example.com',KHOTWA_ADMIN_EMAIL:'test@example.com',KHOTWA_ADMIN_PASSWORD_HASH:'pbkdf2-sha256$240000$'+salt.toString('base64url')+'$'+hash,KHOTWA_SESSION_SECRET:'STAGING_ONLY_SECRET_1234567890_STAGING_ONLY_SECRET'};
const base='https://khotwa-test.example.com';
function req(path,options){return new Request(base+path,options);}
let result=await gateway(req('/healthz'),{});assert.equal(result.response.status,200);
result=await gateway(req('/'),{});assert.equal(result.response.status,503);
result=await gateway(req('/login'),env);assert.equal(result.response.status,200);assert.match(await result.response.text(),/خطوة/);
result=await gateway(req('/api/data',{headers:{'oai-authenticated-user-email':'forged@evil.example','oai-authenticated-user-id':'forged'}}),env);assert.equal(result.response.status,401);
result=await gateway(req('/'),env);assert.equal(result.response.status,303);assert.match(result.response.headers.get('location'),/^\/login\?/);
result=await gateway(req('/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password:'bad',return_to:'/'}).toString()}),env);assert.equal(result.response.status,401);
result=await gateway(req('/login',{method:'POST',headers:{origin:'https://attack.example','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);assert.equal(result.response.status,403);

// Coolify proxy may send a container Host; explicit public origin still works.
result=await gateway(req('/login',{method:'POST',headers:{origin:base,host:'127.0.0.1:3000','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,303);
// Host and forwarding headers supplied by an attacker cannot allow a foreign Origin.
result=await gateway(req('/login',{method:'POST',headers:{origin:'https://attack.example',host:'127.0.0.1:3000','x-forwarded-host':'khotwa-test.example.com','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,403);
// Disallow cross-site requests even if Origin is forged to be on our allowlist.
result=await gateway(req('/login',{method:'POST',headers:{origin:base,'sec-fetch-site':'cross-site','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,403);
// Chrome may classify www -> apex submissions as same-site, not same-origin.
// An exact HTTPS allowlisted Origin must be accepted in this situation.
result=await gateway(req('/login',{method:'POST',headers:{origin:base,'sec-fetch-site':'same-site',host:'127.0.0.1:3000','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,303);
result=await gateway(req('/login',{method:'POST',headers:{origin:'https://www.khotwa-test.example.com','sec-fetch-site':'same-site','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password:'bad'}).toString()}),env);
assert.equal(result.response.status,401);
// Same-site is NOT a bypass: unlisted subdomains and missing Origin are blocked.
result=await gateway(req('/login',{method:'POST',headers:{origin:'https://untrusted.khotwa-test.example.com','sec-fetch-site':'same-site','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,403);
result=await gateway(req('/login',{method:'POST',headers:{'sec-fetch-site':'same-site','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,403);
// The configured www host is also permitted.
result=await gateway(new Request('https://www.khotwa-test.example.com/login',{method:'POST',headers:{origin:'https://www.khotwa-test.example.com',host:'127.0.0.1:3000','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password}).toString()}),env);
assert.equal(result.response.status,303);

result=await gateway(req('/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'test@example.com',password,return_to:'//attacker.invalid'}).toString()}),env);assert.equal(result.response.status,303);assert.equal(result.response.headers.get('location'),'/');
const cookieHeader=result.response.headers.get('set-cookie');assert.match(cookieHeader,/HttpOnly; Secure; SameSite=Lax/);let cookie=cookieHeader.split(';')[0];
result=await gateway(req('/api/data',{headers:{cookie,'oai-authenticated-user-email':'forged@evil.example','oai-authenticated-user-id':'spoofed'}}),env);assert.equal(result.response,undefined);assert.equal(result.request.headers.get('oai-authenticated-user-email'),'test@example.com');assert.equal(result.request.headers.get('oai-authenticated-user-id'),'khotwa-admin');
result=await gateway(req('/api/data',{headers:{cookie:cookie+'corrupt'}}),env);assert.equal(result.response.status,401);
result=await gateway(req('/assets/logo.svg',{headers:{'oai-authenticated-user-email':'spoofed'}}),env);assert.equal(result.request.headers.get('oai-authenticated-user-email'),null);
result=await gateway(req('/logout'),env);assert.equal(result.response.status,303);assert.match(result.response.headers.get('set-cookie'),/Max-Age=0/);
console.log('Khotwa gateway tests passed: missing config, sign-in, invalid password, CSRF, signed cookie, spoofed headers, expiration invalidation, API protection, and sign-out.');
