import {getTenantDb} from '../../../lib/school-tenancy';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {REPLY_PREFIX,replyTemplateSchema} from '../../../lib/reply-templates';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function list(){const r=await getTenantDb().prepare('SELECT id,value FROM settings WHERE substr(id,1,?)=? ORDER BY id').bind(REPLY_PREFIX.length,REPLY_PREFIX).all<{id:string;value:string}>();return r.results.flatMap(r=>{try{const v=replyTemplateSchema.parse(JSON.parse(r.value));return REPLY_PREFIX+v.id===r.id?[v]:[];}catch{return[];}}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{return json({templates:await list()});}catch{return json({error:'تعذر تحميل الردود المحفوظة'},500);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{
 const origin=req.headers.get('origin');if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS,true))return json({error:'طلب غير مسموح'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'صيغة غير صحيحة'},400);
 const text=await req.text();if(text.length>12000)return json({error:'الطلب كبير'},413);
 const body=z.discriminatedUnion('op',[z.object({op:z.literal('add'),id:z.string().uuid(),title:replyTemplateSchema.shape.title,body:replyTemplateSchema.shape.body}).strict(),z.object({op:z.literal('remove'),id:z.string().uuid()}).strict()]).parse(JSON.parse(text));
 const id=REPLY_PREFIX+body.id;
 if(body.op==='remove')await getTenantDb().prepare('DELETE FROM settings WHERE id=?').bind(id).run();
 else{const value=JSON.stringify(replyTemplateSchema.parse({id:body.id,title:body.title,body:body.body,createdAt:new Date().toISOString()}));
 await getTenantDb().prepare('INSERT INTO settings (id,value) SELECT ?,? WHERE (SELECT COUNT(*) FROM settings WHERE substr(id,1,?)=?)<50 ON CONFLICT(id) DO NOTHING').bind(id,value,REPLY_PREFIX.length,REPLY_PREFIX).run();
 const saved=await getTenantDb().prepare('SELECT value FROM settings WHERE id=?').bind(id).first<{value:string}>();if(!saved)return json({error:'وصلت إلى الحد الأقصى: ٥٠ ردًا محفوظًا'},409);
 const v=replyTemplateSchema.parse(JSON.parse(saved.value));if(v.title!==body.title||v.body!==body.body)return json({error:'تعارض في الحفظ. أعد فتح المحرر'},409);
 }
 return json({templates:await list()});
 }catch(e){return json({error:e instanceof z.ZodError?'اكتب اسمًا للرد من حرفين ونصًا من ٥ أحرف على الأقل': 'تعذر حفظ الرد. حاول مجددًا'},e instanceof z.ZodError?400:500);}}
