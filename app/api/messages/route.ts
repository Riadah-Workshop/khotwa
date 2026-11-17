import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {registrarName,registrarDisplay} from '../../../lib/registrar-name';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
async function proxy(req:Request,method:string){
 const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);
 if(method==='POST'){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'طلب غير مسموح'},403);if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'صيغة غير صحيحة'},400);}
 const e=env as unknown as {VISITOR_PORTAL_URL?:string;VISITOR_ADMIN_KEY?:string};if(!e.VISITOR_PORTAL_URL||!e.VISITOR_ADMIN_KEY)return json({error:'خدمة رسائل أولياء الأمور غير مفعلة'},503);
 try{
 const base=new URL(e.VISITOR_PORTAL_URL),u=new URL('/api/messages',base);let body:string|undefined;
 if(method==='GET'){const q=new URL(req.url).searchParams;for(const key of ['report','snapshot','cursor','source','basis','count','backup','events','status','attachment','kind','from','to'])if(q.has(key))u.searchParams.set(key,q.get(key)!);}
 else{if(Number(req.headers.get('content-length')||0)>15000)return json({error:'الطلب كبير'},413);const text=await req.text();if(text.length>15000)return json({error:'الطلب كبير'},413);const v=JSON.parse(text);if(!['update','reply'].includes(v.op))return json({error:'طلب غير صالح'},400);body=JSON.stringify({...v,actor:registrarName(user.displayName,user.email)});}
 const response=await fetch(u.toString(),{method,headers:{'X-Visitor-Key':e.VISITOR_ADMIN_KEY,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12000)});if(method==='GET'&&new URL(req.url).searchParams.has('attachment')&&response.ok)return new Response(response.body,{status:response.status,headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="message-attachment.jpg"'}});const data=await response.json() as any;
 if(method==='GET'&&!new URL(req.url).searchParams.has('backup'))data.formUrl=new URL('/contact',base).toString();
 return json(new URL(req.url).searchParams.has('backup')?data:registrarDisplay(data),response.status);
 }catch{return json({error:'تعذر الاتصال بصندوق الرسائل. حاول مجددًا'},503);}
}
export const GET=(req:Request)=>proxy(req,'GET');
export const POST=async(req:Request)=>{const denied=await denyReadOnlyWrite();return denied??proxy(req,'POST');};
