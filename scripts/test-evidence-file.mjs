import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';
const native=createRequire(import.meta.url),transpile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const helper={};new Function('exports',transpile('lib/evidence-files.ts'))(helper);const origin={};new Function('exports',transpile('lib/request-origin.ts'))(origin);
const objects=new Map(),id=crypto.randomUUID();let user=true,conflict=false,row={id,file_key:'',revision:1};
const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return {...row,file_name:'صورة.pdf',mime:'application/pdf'};},async run(){if(conflict)return {meta:{changes:0}};row.file_key=args[0];return {meta:{changes:1}};}};}};
const BUCKET={async put(k,v){objects.set(k,v);},async delete(k){objects.delete(k);},async get(k){const v=objects.get(k);return v?{body:v}:null;}};
const out={};new Function('exports','require',transpile('app/api/evidence-file/route.ts'))(out,s=>s==='cloudflare:workers'?{env:{DB,BUCKET}}:s.endsWith('chatgpt-auth')?{getChatGPTUser:async()=>user?{}:null,denyReadOnlyWrite:async()=>null}:s.endsWith('evidence-files')?helper:s.endsWith('school-tenancy')?{getTenantDb:()=>DB}:s.endsWith('request-origin')?origin:native(s));
function request(content='%PDF-1.7',origin='https://khotwa.test'){const body=new FormData();body.set('id',id);body.set('file',new File([content],'شاهد.pdf'));return new Request('https://khotwa.test/api/evidence-file',{method:'POST',headers:{origin},body});}
assert.equal((await out.POST(request('bad'))).status,400);assert.equal(objects.size,0);assert.equal((await out.POST(request('%PDF-1.7','https://evil.test'))).status,403);
conflict=true;assert.equal((await out.POST(request())).status,409);assert.equal(objects.size,0);conflict=false;
assert.equal((await out.POST(request())).status,200);assert.equal(objects.size,1);assert.equal((await out.POST(request())).status,409);
let r=await out.GET(new Request('https://khotwa.test/api/evidence-file?id='+id));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(await r.text(),'%PDF-1.7');
user=false;assert.equal((await out.GET(new Request('https://khotwa.test/api/evidence-file?id='+id))).status,401);
console.log('Evidence API passed: invalid bytes and cross-origin rejected; conflict orphan removed; existing attachment retained; authenticated private download.');
