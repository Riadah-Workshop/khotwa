import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {registrarName,registrarDisplay} from '../../../lib/registrar-name';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {students} from '../../../db/schema';
import {eq} from 'drizzle-orm';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function proxy(req:Request,method:string){
 const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);
 if(method==='POST'){const origin=req.headers.get('origin');if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS,true))return json({error:'طلب غير مسموح'},403);if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'صيغة غير صحيحة'},400);}
 const e=env as unknown as {VISITOR_PORTAL_URL?:string;VISITOR_ADMIN_KEY?:string};if(!e.VISITOR_PORTAL_URL||!e.VISITOR_ADMIN_KEY)return json({error:'بوابة الزوار غير مفعلة بعد'},503);
 try{
 const u=new URL(e.VISITOR_PORTAL_URL);u.pathname='/api/visits';u.search='';let body:string|undefined;
 if(method==='GET'){const q=new URL(req.url).searchParams;for(const key of ['report','snapshot','cursor','source','basis','from','to','count','backup','events'])if(q.has(key))u.searchParams.set(key,q.get(key)!);}
 else{if(Number(req.headers.get('content-length')||0)>12000)return json({error:'الطلب كبير'},413);const text=await req.text();if(text.length>12000)return json({error:'الطلب كبير'},413);const v=JSON.parse(text);if(!['create','update'].includes(v.op))return json({error:'طلب غير صالح'},400);
 if(v.studentId){const found=await getDb().select().from(students).where(eq(students.id,v.studentId));if(!found.length)return json({error:'اختر طالبًا من دليل المدرسة'},400);}
 body=JSON.stringify({...v,actor:registrarName(user.displayName,user.email)});}
 const response=await fetch(u.toString(),{method,headers:{'X-Visitor-Key':e.VISITOR_ADMIN_KEY,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12000)});
 const data=await response.json() as any;if(method==='GET'&&!new URL(req.url).searchParams.has('backup'))data.portalUrl=e.VISITOR_PORTAL_URL;
 return json(new URL(req.url).searchParams.has('backup')?data:registrarDisplay(data),response.status);
 }catch{return json({error:'تعذر الاتصال ببوابة الزوار. سجلات المدرسة متاحة كالمعتاد.'},503);}
}
export const GET=(req:Request)=>proxy(req,'GET');
export const POST=async(req:Request)=>{const denied=await denyReadOnlyWrite();return denied??proxy(req,'POST');};
