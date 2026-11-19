import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {hashPassword} from '../lib/account-security.ts';
import {issueDeputyInvite,activationAccount,activateDeputy,verifyResendWebhook} from '../lib/deputy-invites.ts';
import {handleKhotwaAuthentication} from '../lib/standalone-auth.ts';
const sql=new DatabaseSync(':memory:');
const files=readdirSync('drizzle').filter(x=>/\.sql$/.test(x)).sort();
for(const file of files.filter(f=>f<'0022'))sql.exec(readFileSync('drizzle/'+file,'utf8'));
const oldHash=await hashPassword('legacy-password-very-secure');
sql.prepare("INSERT INTO khotwa_accounts(id,school_id,email,full_name,role,password_hash,active,session_version,created_at) VALUES(?,?,?,?, 'deputy',?,1,1,?)").run('legacy','default','old@example.com','Legacy Deputy',oldHash,'2026-11-01T00:00:00Z');
sql.exec(readFileSync('drizzle/0022_deputy_email_activations.sql','utf8'));
assert.equal(sql.prepare("SELECT activated_at FROM khotwa_accounts WHERE id='legacy'").get().activated_at,'2026-11-01T00:00:00Z');
function wrap(sqlText,params=[]){return {
 bind(...args){return wrap(sqlText,args)},
 async first(){return sql.prepare(sqlText).get(...params)||null},
 async all(){return {results:sql.prepare(sqlText).all(...params)}},
 async run(){const row=sql.prepare(sqlText).run(...params);return {meta:{changes:row.changes}}}
};}
const db={prepare:wrap,async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const x of stmts)r.push(await x.run());sql.exec('COMMIT');return r;}catch(err){sql.exec('ROLLBACK');throw err;}}};
const account={id:crypto.randomUUID(),email:'deputy@example.com',full_name:'وكيل الاختبار',school_name:'مدرسة تجربة'};
sql.prepare("INSERT INTO khotwa_accounts(id,school_id,email,full_name,role,password_hash,active,session_version,created_at,invitation_status) VALUES(?,?,?,?,'deputy','!pending-invitation!',1,1,?,'queued')").run(account.id,'default',account.email,account.full_name,new Date().toISOString());
let link='';let sends=0;
const previousFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 assert.equal(url,'https://api.resend.com/emails');
 const data=JSON.parse(init.body);assert.equal(data.to[0],account.email);sends++;
 const m=data.html.match(/https:\/\/example\.test\/activate\?token=[a-f0-9]{64}/);assert.ok(m);link=m[0];
 return Response.json({id:'test-resend-'+sends});
};
try{
 const env={DB:db,RESEND_API_KEY:'fake-key',KHOTWA_FROM_EMAIL:'noreply@verified.example',KHOTWA_APP_URL:'https://example.test',KHOTWA_ADMIN_EMAIL:'mainadmin@example.test',KHOTWA_ADMIN_PASSWORD_HASH:await hashPassword('admin-password-very-secure'),KHOTWA_SESSION_SECRET:'test-secret-abcdefghijklmnopqrstuvwxyz12345',KHOTWA_PUBLIC_ORIGINS:'https://example.test'};
 const password='new-super-secure-password';
 const req=(path)=>new Request('https://example.test'+path);
 const post=(path,data)=>new Request('https://example.test'+path,{method:'POST',headers:{origin:'https://example.test','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
 let res=await handleKhotwaAuthentication(post('/login',{email:account.email,password}),env);assert.equal(res.response.status,401,'pending accounts cannot sign in');
 const sent=await issueDeputyInvite(db,env,account);assert.equal(sent.status,'accepted');assert.equal(sends,1);
 assert.equal(sql.prepare('SELECT password_hash FROM khotwa_accounts WHERE id=?').get(account.id).password_hash,'!pending-invitation!');
 let token=new URL(link).searchParams.get('token');assert.equal((await activationAccount(db,token)).email,account.email);
 sql.prepare('UPDATE khotwa_deputy_invites SET expires_at=? WHERE token_hash=?').run(Date.now()-1000,await (await import('../lib/deputy-invites.ts')).tokenHash(token));
 assert.equal(await activationAccount(db,token),null,'expired invitation denied');
 sql.prepare('UPDATE khotwa_deputy_invites SET expires_at=?').run(Date.now()+3600000);
 res=await handleKhotwaAuthentication(req('/activate?token='+token),env);assert.equal(res.response.status,200);assert.match(await res.response.text(),/تفعيل الحساب/);
 res=await handleKhotwaAuthentication(post('/activate',{token,password,confirm_password:password+'bad'}),env);assert.equal(res.response.status,400);
 assert.equal(await activateDeputy(db,token,password),true);assert.equal(await activateDeputy(db,token,password),false,'invitation is single use');
 assert.equal((await activationAccount(db,token)),null);
 const row=sql.prepare('SELECT activated_at,password_set_at,first_login_at FROM khotwa_accounts WHERE id=?').get(account.id);
 assert.ok(row.activated_at&&row.password_set_at);assert.equal(row.first_login_at,null);
 res=await handleKhotwaAuthentication(post('/login',{email:account.email,password}),env);assert.equal(res.response.status,303);assert.ok(sql.prepare('SELECT first_login_at FROM khotwa_accounts WHERE id=?').get(account.id).first_login_at);
 const deputyCookie=res.response.headers.get('set-cookie').split(';')[0];
 res=await handleKhotwaAuthentication(req('/admin'),env);assert.equal(res.response.headers.get('location').split('?')[0],'/admin-login');
 res=await handleKhotwaAuthentication(new Request('https://example.test/admin',{headers:{cookie:deputyCookie}}),env);assert.equal(res.response.status,303);
 res=await handleKhotwaAuthentication(post('/login',{email:'mainadmin@example.test',password:'admin-password-very-secure'}),env);assert.equal(res.response.status,401,'main admin cannot sign in through school login');
 res=await handleKhotwaAuthentication(post('/admin-login',{email:'mainadmin@example.test',password:'admin-password-very-secure'}),env);assert.equal(res.response.status,303);assert.equal(res.response.headers.get('location'),'/admin');
 const reset=await issueDeputyInvite(db,env,account);assert.equal(reset.status,'accepted');const resetToken=new URL(link).searchParams.get('token');
 res=await handleKhotwaAuthentication(post('/login',{email:account.email,password}),env);assert.equal(res.response.status,303,'existing password works until reset link consumed');
 assert.equal(await activateDeputy(db,resetToken,'second-new-super-secure-password'),true);
 res=await handleKhotwaAuthentication(post('/login',{email:account.email,password}),env);assert.equal(res.response.status,401,'old password revoked after reset');
 res=await handleKhotwaAuthentication(post('/login',{email:account.email,password:'second-new-super-secure-password'}),env);assert.equal(res.response.status,303);
 const webhookSecret='whsec_'+Buffer.from('webhook-secret-test-0123456789').toString('base64');const body=JSON.stringify({type:'email.delivered',data:{email_id:'test-resend-2'}});
 const ts=String(Math.floor(Date.now()/1000)),id='evt_test_123';const data=new TextEncoder().encode(id+'.'+ts+'.'+body);
 const key=await crypto.subtle.importKey('raw',Buffer.from('webhook-secret-test-0123456789'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,data)).toString('base64');
 const headers=new Headers({'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+signature});
 assert.equal(await verifyResendWebhook(body,headers,webhookSecret),true);
 assert.equal(await verifyResendWebhook(body+' ',headers,webhookSecret),false);
 assert.equal(await verifyResendWebhook(body,new Headers({...Object.fromEntries(headers),'svix-timestamp':'1'}),webhookSecret),false);
 console.log('Deputy invitation tests passed: migration, pending login denied, send, activation, invalid confirmation, single-use, password setup, first login, separate admin login, password reset and signed delivery events');
}finally{globalThis.fetch=previousFetch;sql.close();}
