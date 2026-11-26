// Run: node --experimental-strip-types scripts/test-care-access.mjs  (needs the `typescript` dev dependency)
// Student care and emergency data: who can read it, who can change it, who gets it in a backup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};new Function('exports',transpile('lib/care-access.ts'))(policy);

// Only the signed session role decides. An e-mail address, even one that used to be on a list, decides nothing.
const ALLOWED=['main_admin','deputy'];
const DENIED=['manager','parent','fushati_admin','fushati_agent','unknown-future-role',null,undefined,''];
for(const role of ALLOWED)assert.equal(policy.canAccessCare(role),true,role);
for(const role of DENIED)assert.equal(policy.canAccessCare(role),false,String(role));
assert.equal(policy.canAccessCare('owner@example.test'),false,'an e-mail address is not a role');
assert.match(policy.CARE_DENIED,/للوكيل المدرسي/);
assert.doesNotMatch(fs.readFileSync('lib/care-access.ts','utf8'),/@/,'no e-mail address may be embedded in care-access.ts');

// Drive the real route handlers with a configurable session.
const session={user:true,role:null,email:'owner@example.test'};
const queries=[];
const db={prepare(sql){queries.push(sql);return {sql};},async batch(list){return list.map(()=>({results:[]}));}};
class CareError extends Error{constructor(message,status=400){super(message);this.status=status;}}
let serviceKey=false;
const auth={
 getChatGPTUser:async()=>session.user?{email:session.email,displayName:'Test user'}:null,
 getKhotwaAccess:async()=>session.role?{role:session.role,schoolId:'default',parentPhone:''}:null,
 denyReadOnlyWrite:async()=>null,
};
const careModule={getCare:async()=>({studentCare:[],careIntake:[]}),saveCare:async()=>({ok:true}),restoreCare:async()=>({added:0}),importCare:async()=>({ok:true}),careImportServiceAllowed:()=>serviceKey,CareError};
function load(file){
 const out={};
 new Function('exports','require',transpile(file))(out,specifier=>{
  if(specifier==='cloudflare:workers')return {env:{DB:db}};
  if(specifier.endsWith('chatgpt-auth'))return auth;
  if(specifier.endsWith('care-access'))return policy;
  if(specifier.endsWith('school-tenancy'))return {getTenantDb:()=>db};
  if(specifier.endsWith('request-origin'))return {trustedBrowserOrigin:()=>true};
  if(specifier.endsWith('lib/student-care'))return careModule;
  if(specifier.endsWith('emergency-import'))return {importEmergencyContacts:async()=>({ok:true})};
  throw Error('Unexpected import: '+specifier);
 });
 return out;
}
const get=()=>new Request('https://test.local/api/student-care');
const post=(path='/api/student-care',body='{"op":"save","data":{}}')=>new Request('https://test.local'+path,{method:'POST',headers:{'content-type':'application/json'},body});

const care=load('app/api/student-care/route.ts');
const imp=load('app/api/student-care/import/route.ts');
const backup=load('app/api/backup/route.ts');

// Not signed in at all.
session.user=false;session.role=null;
assert.equal((await care.GET(get())).status,401);

// Signed in, but not a care role: refused before storage is touched, whatever the e-mail.
session.user=true;
for(const role of [...DENIED.filter(Boolean),null]){
 session.role=role;queries.length=0;
 for(const email of ['owner@example.test','someone.else@example.test']){
  session.email=email;
  const read=await care.GET(get());assert.equal(read.status,403,`GET ${role} ${email}`);
  assert.equal((await read.json()).error,policy.CARE_DENIED);
  assert.equal((await care.POST(post())).status,403,`POST ${role} ${email}`);
  assert.equal((await imp.POST(post('/api/student-care/import'))).status,403,`import ${role} ${email}`);
 }
 assert.equal(queries.length,0,'storage must not be reached by '+role);
}

// The two staff roles are let through (they reach the handler body; they are not answered 401/403).
for(const role of ALLOWED){
 session.role=role;session.email='owner@example.test';
 assert.equal((await care.GET(get())).status,200,'GET '+role);
 const write=await care.POST(post());assert.ok(![401,403].includes(write.status),`POST ${role} -> ${write.status}`);
 const upload=await imp.POST(post('/api/student-care/import'));assert.ok(![401,403].includes(upload.status),`import ${role} -> ${upload.status}`);
}

// The key-based import service (automated import) keeps working without a session role.
session.role=null;serviceKey=true;
const service=await imp.POST(post('/api/student-care/import'));assert.ok(![401,403].includes(service.status),'service import -> '+service.status);
serviceKey=false;

// Backups include care tables for the staff roles only.
for(const role of [...ALLOWED,...DENIED.filter(Boolean),null]){
 session.role=role;queries.length=0;
 const response=await backup.GET(new Request('https://test.local/api/backup'));
 assert.equal(response.status,200,'backup '+role);
 const body=await response.json();
 const expected=ALLOWED.includes(role);
 assert.equal('studentCare' in body,expected,'backup keys '+role);
 assert.equal('careIntake' in body,expected,'backup keys '+role);
 assert.equal(queries.some(q=>q.includes('student_care')),expected,'backup tables '+role);
}
session.user=false;session.role=null;
assert.equal((await backup.GET(new Request('https://test.local/api/backup'))).status,401);
console.log('Care access passed: role-only decision for read, write, import and backup; e-mail never grants access; key-based import service unchanged.');
