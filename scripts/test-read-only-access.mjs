import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};new Function('exports',transpile('lib/access-policy.ts'))(policy);
assert.equal(policy.isReadOnlyEmail(' ABOABDO140@YAHOO.COM '),true);
assert.equal(policy.isReadOnlyEmail('ayed6992@gmail.com'),false);
assert.equal(policy.isReadOnlyEmail(' Ccsit@iau.edu.sa '),true);
assert.equal(policy.isReadOnlyEmail(' Alanoudayed249@gmail.com '),true);
assert.equal(policy.isReadOnlyEmail('alanoudayed249@gmail.com.attacker.test'),false);
assert.equal(policy.isReadOnlyEmail('ccsit@iau.edu.sa.attacker.test'),false);
assert.equal(policy.isReadOnlyEmail('other@iau.edu.sa'),false);
assert.equal(policy.isReadOnlyEmail(null),false);
assert.equal(policy.isReadOnlyEmail('aboabdo140@yahoo.com.attacker.test'),false);
const denied=policy.readOnlyWriteResponse('aboabdo140@yahoo.com');
assert.equal(denied.status,403);assert.match((await denied.json()).error,/للمشاهدة/);
assert.equal(policy.readOnlyWriteResponse('owner@example.com'),null);

// Run the real exported handlers with a forbidden viewer and dependencies that
// throw on use: a denied request must not reach DB, payload parsing, or proxies.
let email='aboabdo140@yahoo.com';
const auth={};new Function('exports','require',transpile('app/chatgpt-auth.ts'))(auth,specifier=>{
 if(specifier.endsWith('access-policy'))return policy;
 if(specifier==='next/headers')return {headers:async()=>new Headers({'oai-authenticated-user-id':'test-user','oai-authenticated-user-email':email})};
 if(specifier==='next/navigation')return {redirect:()=>{throw Error('Unexpected redirect')}};
 if(specifier.endsWith('registrar-name'))return {registrarName:(_,address)=>address};
 throw Error('Unexpected auth import: '+specifier);
});
assert.equal((await auth.denyReadOnlyWrite()).status,403);
email='owner@example.com';assert.equal(await auth.denyReadOnlyWrite(),null);
email='aboabdo140@yahoo.com';
const files=['desk-close','data','siblings','parents','reply-templates','initial-import','parents/service','messages','visitors','school-work','evidence-file','student-care','student-care/import'];
for(const viewer of ['aboabdo140@yahoo.com','Ccsit@iau.edu.sa','Alanoudayed249@gmail.com']){
email=viewer;
for(const name of files){
 const file=`app/api/${name}/route.ts`,out={};
 let locked=false;
 const unused=new Proxy(()=>{throw Error('Write dependency reached');},{get:()=>unused,apply:()=>{if(locked)throw Error('Write dependency reached');return unused;}});
 const require=specifier=>specifier.endsWith('chatgpt-auth')?auth:unused;
 new Function('exports','require',transpile(file))(out,require);locked=true;
 const request=new Proxy({}, {get(){throw Error('Request payload read before authorization');}});
 const response=await out.POST(request);
 assert.equal(response.status,403,name);
 assert.match((await response.json()).error,/للمشاهدة/,name);
}
}
// Every active write route must be covered. Retired APIs return 410 without writes.
for(const entry of fs.readdirSync('app/api',{recursive:true}).filter(n=>n.endsWith('route.ts'))){
 const source=fs.readFileSync('app/api/'+entry,'utf8');
 if(/export.*POST/.test(source)&&!source.includes('const retired')){
  assert.ok(source.includes('denyReadOnlyWrite')||source.includes('export const POST=retired'),entry);
 }
}
console.log('Read-only viewer rejected before any storage/proxy/payload access for all three restricted accounts on all 13 active POST routes; other accounts retain existing authorization.');
