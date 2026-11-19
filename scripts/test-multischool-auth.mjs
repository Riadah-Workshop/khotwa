import assert from 'node:assert/strict';
import {hashPassword} from '../lib/account-security.ts';
import {handleKhotwaAuthentication,adminSwitchCookie} from '../lib/standalone-auth.ts';
const origin='https://khotwa-test.example.com';
const secret='khotwa-secret-for-multi-school-testing-1234567890';
const adminPassword='admin-strong-password-1245';
const deputyPassword='deputy-strong-password-1245';
const parentPassword='parent-strong-password-1245';
const school={id:'a3f9c19bb2ef',code:'TEST-SCHOOL',active:1};
const deputy={activated_at:'2026-11-19T00:00:00.000Z',first_login_at:null,id:'deputy-1',email:'deputy@example.com',full_name:'وكيل تجربة',school_id:school.id,active:1,session_version:1,role:'deputy',password_hash:await hashPassword(deputyPassword)};
const parent={id:'parent-1',phone:'0501234567',school_id:school.id,active:1,session_version:1,password_hash:await hashPassword(parentPassword)};
const db = {
 prepare(query) {
  return {
   bind(...args) {
    return {
     first: async () => {
      if(query.includes('khotwa_login_limits'))return null;
      if(query.includes('khotwa_parent_users p JOIN')&&query.includes('password_hash'))return school.active&&parent.active&&args[0]===school.code&&args[1]===parent.phone?parent:null;
      if(query.includes('khotwa_accounts a JOIN')&&query.includes('password_hash'))return school.active&&deputy.active&&args[0]===deputy.email?deputy:null;
      if(query.includes('khotwa_accounts a JOIN'))return {...deputy,school_active:school.active};
      if(query.includes('khotwa_parent_users p JOIN'))return {...parent,school_active:school.active};
      if(query.includes('khotwa_schools WHERE'))return {active:school.active};
      return null;
     },
     run: async () => ({meta:{changes:1}}),
    };
   }
  };
 }
};
const env={DB:db,KHOTWA_ADMIN_EMAIL:'admin@example.com',KHOTWA_ADMIN_PASSWORD_HASH:await hashPassword(adminPassword),KHOTWA_SESSION_SECRET:secret,KHOTWA_PUBLIC_ORIGINS:origin};
const form=(path,payload)=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload).toString()});
const get=(path,cookie,forgery={})=>new Request(origin+path,{headers:{cookie,...forgery}});
function cookie(result){assert.equal(result.response?.status,303);return result.response.headers.get('set-cookie').split(';')[0];}
let result=await handleKhotwaAuthentication(form('/login',{email:deputy.email,password:deputyPassword}),env);
const deputyCookie=cookie(result);
result=await handleKhotwaAuthentication(get('/api/data',deputyCookie,{'oai-authenticated-user-school-id':'default','oai-authenticated-user-role':'main_admin'}),env);
assert.equal(result.response,undefined);assert.equal(result.school.schoolId,school.id);assert.equal(result.request.headers.get('oai-authenticated-user-role'),'deputy');assert.equal(result.request.headers.get('oai-authenticated-user-school-id'),school.id);
assert.equal(result.request.headers.get('oai-authenticated-user-full-name'),encodeURIComponent('وكيل تجربة'));
result=await handleKhotwaAuthentication(get('/api/admin',deputyCookie),env);assert.equal(result.response.status,403);
result=await handleKhotwaAuthentication(get('/api/messages',deputyCookie),env);assert.equal(result.response.status,403);
result=await handleKhotwaAuthentication(form('/parent-login',{school_code:school.code,phone:parent.phone,password:parentPassword}),env);
const parentCookie=cookie(result);
result=await handleKhotwaAuthentication(get('/api/parent/status',parentCookie),env);assert.equal(result.request.headers.get('oai-authenticated-user-parent-phone'),parent.phone);
result=await handleKhotwaAuthentication(get('/api/data',parentCookie),env);assert.equal(result.response.status,403);
result=await handleKhotwaAuthentication(get('/admin',parentCookie),env);assert.equal(result.response.status,303);
parent.session_version++;
result=await handleKhotwaAuthentication(get('/api/parent/status',parentCookie),env);assert.equal(result.response.status,401);
result=await handleKhotwaAuthentication(form('/admin-login',{email:'admin@example.com',password:adminPassword}),env);
const adminCookie=cookie(result);result=await handleKhotwaAuthentication(get('/api/admin',adminCookie),env);assert.equal(result.school.role,'main_admin');
const switched=await adminSwitchCookie(secret,'admin@example.com',school.id);
result=await handleKhotwaAuthentication(get('/api/data',switched.split(';')[0]),env);assert.equal(result.school.schoolId,school.id);
deputy.active=0;
result=await handleKhotwaAuthentication(get('/api/data',deputyCookie),env);assert.equal(result.response.status,401);
console.log('Multischool auth tests passed: deputy tenancy, forged role/school headers, admin-only routes, parent status-only access, session revocation, admin school switching');
