import {env} from 'cloudflare:workers';
import {getKhotwaAccess} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
const TABLES=['absence_events', 'absence_followups', 'attendance', 'attendance_audit', 'attendance_rounds', 'case_revisions', 'cases', 'contacts', 'followups', 'parent_grants', 'settings', 'students','student_families'];
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function equal(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function GET(req:Request){
 if((await getKhotwaAccess())?.role!=='main_admin')return json({error:'صلاحية مدير النظام فقط'},403);
 const e=env as unknown as {DB:D1Database;BUCKET?:R2Bucket;RECOVERY_EXPORT_KEY?:string;RECOVERY_EXPORT_EXPIRES_AT?:string};
 const key=req.headers.get('X-Recovery-Export-Key')||'';
 if(!e.RECOVERY_EXPORT_KEY||Date.parse(e.RECOVERY_EXPORT_EXPIRES_AT||'')<=Date.now()||!Number.isFinite(Date.parse(e.RECOVERY_EXPORT_EXPIRES_AT||''))||!equal(key,e.RECOVERY_EXPORT_KEY))return json({error:'غير مصرح'},401);
 try{
 const asset=new URL(req.url).searchParams.get('asset');if(asset){if(!e.BUCKET)return json({error:'غير موجود'},404);const object=await e.BUCKET.get(asset);if(!object)return json({error:'غير موجود'},404);return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 const result=await e.DB.batch(TABLES.map(table=>e.DB.prepare('SELECT * FROM '+table)));
 const tables=Object.fromEntries(TABLES.map((table,i)=>[table,result[i].results]));
 const assets:{key:string;size:number;etag:string}[]=[];if(e.BUCKET){let cursor:string|undefined;do{const page=await e.BUCKET.list({cursor});assets.push(...page.objects.map(o=>({key:o.key,size:o.size,etag:o.etag})));cursor=page.truncated?page.cursor:undefined;}while(cursor);}
 return json({format:'khotwa-recovery-raw-v1',exportedAt:new Date().toISOString(),tables,assets});
 }catch{return json({error:'تعذر إنشاء نسخة الاستعادة'},500);}
}
