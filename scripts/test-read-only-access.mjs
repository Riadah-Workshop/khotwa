// Run: node --experimental-strip-types scripts/test-read-only-access.mjs  (needs the `typescript` dev dependency)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};new Function('exports',transpile('lib/access-policy.ts'))(policy);

// Writes are decided by the signed session role only. An e-mail address never
// grants or removes write access.
const WRITERS=['main_admin','deputy'];
const VIEWERS=['manager','parent','fushati_admin','fushati_agent'];
for(const role of WRITERS){assert.equal(policy.isReadOnlyRole(role),false,role);assert.equal(policy.readOnlyWriteResponse(role),null,role);}
for(const role of [...VIEWERS,'unknown-future-role']){assert.equal(policy.isReadOnlyRole(role),true,role);}
// No role = a service caller that authenticates with its own secret key; the route checks it.
for(const role of [null,undefined,'']){assert.equal(policy.isReadOnlyRole(role),false,String(role));assert.equal(policy.readOnlyWriteResponse(role),null,String(role));}
const denied=policy.readOnlyWriteResponse('manager');
assert.equal(denied.status,403);assert.match((await denied.json()).error,/للمشاهدة/);
assert.equal(denied.headers.get('cache-control'),'no-store');
assert.equal(Object.hasOwn(policy,'isReadOnlyEmail'),false,'e-mail based policy must not come back');

// Run the real exported handlers with a read-only role and dependencies that
// throw on use: a denied request must not reach DB, payload parsing, or proxies.
let role='manager',email='anyone@example.test';
const auth={};new Function('exports','require',transpile('app/chatgpt-auth.ts'))(auth,specifier=>{
 if(specifier.endsWith('access-policy'))return policy;
 if(specifier==='next/headers')return {headers:async()=>{const h=new Headers({'oai-authenticated-user-id':'test-user','oai-authenticated-user-email':email});if(role){h.set('oai-authenticated-user-role',role);h.set('oai-authenticated-user-school-id','default');}return h;}};
 if(specifier==='next/navigation')return {redirect:()=>{throw Error('Unexpected redirect')}};
 if(specifier.endsWith('registrar-name'))return {registrarName:(_,address)=>address};
 throw Error('Unexpected auth import: '+specifier);
});
for(const viewer of VIEWERS){role=viewer;assert.equal((await auth.denyReadOnlyWrite()).status,403,viewer);}
for(const writer of WRITERS){role=writer;assert.equal(await auth.denyReadOnlyWrite(),null,writer);}
role=null;assert.equal(await auth.denyReadOnlyWrite(),null,'service caller without a session role');

const files=['desk-close','data','siblings','parents','reply-templates','initial-import','parents/service','messages','visitors','school-work','evidence-file','student-care','student-care/import'];
for(const viewer of VIEWERS){
role=viewer;
for(const name of files){
 const file=`app/api/${name}/route.ts`,out={};
 let locked=false;
 const unused=new Proxy(()=>{throw Error('Write dependency reached');},{get:()=>unused,apply:()=>{if(locked)throw Error('Write dependency reached');return unused;}});
 const require=specifier=>specifier.endsWith('chatgpt-auth')?auth:unused;
 new Function('exports','require',transpile(file))(out,require);locked=true;
 const request=new Proxy({}, {get(){throw Error('Request payload read before authorization');}});
 const response=await out.POST(request);
 assert.equal(response.status,403,viewer+' '+name);
 assert.match((await response.json()).error,/للمشاهدة/,name);
}
}

// Every active write route either calls denyReadOnlyWrite() or is listed here with the
// reason it has its own protection. A NEW write route that does neither fails this
// test, so a second-layer guard cannot be forgotten silently. Retired routes (410) are skipped.
const OWN_PROTECTION={
 'account/profile/route.ts':'gateway: Student Affairs Agent only; edits that account only',
 'admin/route.ts':'gateway and route: system administrator only',
 'fushati/receipts/route.ts':'cafeteria roles are checked inside the route',
 'fushati/inventory/route.ts':'stock changes need the inventory_manage permission in the item\'s own cafeteria, checked inside the route; the gateway keeps managers out of this path',
 'fushati/presence/route.ts':'only cafeteria agents write attendance and only the system administrator or a cafeteria administrator write the rest; each operation checks its role inside the route',
 'fushati/route.ts':'cafeteria roles are checked per operation inside the route',
 'parent/password/route.ts':'parent changes the own password only',
 'trip-cleanup/route.ts':'gateway: system administrator only (no check inside the route)',
 'webhooks/resend/route.ts':'public webhook verified by signature',
};
const seen=new Set();
for(const entry of fs.readdirSync('app/api',{recursive:true}).filter(n=>n.endsWith('route.ts'))){
 const source=fs.readFileSync('app/api/'+entry,'utf8');
 if(/export.*POST/.test(source)&&!source.includes('const retired')){
  const guarded=source.includes('denyReadOnlyWrite')||source.includes('export const POST=retired');
  const exempt=Object.hasOwn(OWN_PROTECTION,entry.replaceAll('\\','/'));
  assert.ok(guarded||exempt,'Write route without read-only guard or documented protection: '+entry);
  if(exempt){seen.add(entry.replaceAll('\\','/'));assert.ok(!guarded,entry+' is guarded now; remove it from OWN_PROTECTION');}
 }
}
assert.deepEqual([...seen].sort(),Object.keys(OWN_PROTECTION).sort(),'OWN_PROTECTION lists a route that no longer exists');
console.log('Read-only roles (manager, parent, cafeteria) rejected before any storage/proxy/payload access on all 13 guarded POST routes; admin and deputy keep write access; no e-mail based rules; every write route is guarded or documented.');
