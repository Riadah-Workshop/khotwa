import assert from 'node:assert/strict';
import {hashPassword} from '../lib/account-security.ts';
import {handleKhotwaAuthentication} from '../lib/standalone-auth.ts';
const base='https://khotwa-test.example.com',secret='long-fushati-test-secret-key-for-2026-not-real';
const pass='StrongTemporaryPassword123456789';
const admin={id:'a1',role:'fushati_admin',email:'cafe-admin@example.com',full_name:'Canteen Admin',active:1,session_version:1,password_hash:await hashPassword(pass)};
const agent={id:'g1',role:'fushati_agent',email:'cafe-agent@example.com',full_name:'Canteen Agent',active:1,session_version:1,password_hash:await hashPassword(pass)};
const users=[admin,agent];
const db={prepare(query){return {bind(...args){return {first:async()=>{
 if(query.includes('khotwa_login_limits'))return null;
 if(query.includes('FROM fushati_users'))return query.includes('WHERE email=')?users.find(u=>u.email===args[0])||null:users.find(u=>u.id===args[0])||null;
 return null;
},run:async()=>({meta:{changes:1}})};}}}};
const env={DB:db,KHOTWA_ADMIN_EMAIL:'main@example.com',KHOTWA_ADMIN_PASSWORD_HASH:await hashPassword(pass),KHOTWA_SESSION_SECRET:secret,KHOTWA_PUBLIC_ORIGINS:base};
const req=(path,options={})=>new Request(base+path,options);
for(const [u,route,home] of [[admin,'/fushati-admin-login','/fushati/admin'],[agent,'/fushati-agent-login','/fushati/agent']]){
 const loginPage=await handleKhotwaAuthentication(req(route),env);
 assert.equal(loginPage.response.status,200);
 assert.match(await loginPage.response.text(),/فسحتي/);
 const login=await handleKhotwaAuthentication(req(route,{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:u.email,password:pass}).toString()}),env);
 assert.equal(login.response.status,303);
 assert.equal(login.response.headers.get('location'),home);
 const cookie=login.response.headers.get('set-cookie').split(';')[0];
 const allowed=await handleKhotwaAuthentication(req('/api/fushati',{headers:{cookie}}),env);
 assert.equal(allowed.school.role,u.role);
 const denied=await handleKhotwaAuthentication(req('/api/data',{headers:{cookie}}),env);
 assert.equal(denied.response.status,403);
 const adminPage=await handleKhotwaAuthentication(req('/fushati/admin',{headers:{cookie}}),env);
 if(u.role==='fushati_admin')assert.equal(adminPage.response,undefined);
 else assert.equal(adminPage.response.status,303);
 if(u.role==='fushati_agent'){
  const receipt=await handleKhotwaAuthentication(req('/api/fushati/receipts',{headers:{cookie}}),env);
  assert.equal(receipt.school.role,'fushati_agent'); // The receipt route itself denies agents.
 }
 u.active=0;
 const revoked=await handleKhotwaAuthentication(req('/api/fushati',{headers:{cookie}}),env);
 assert.equal(revoked.response.status,401);
 u.active=1;
}
console.log('PASS Fushati authentication: separate logins, role isolation, restricted school APIs, inactive-session revocation.');
