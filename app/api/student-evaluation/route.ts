import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {env} from 'cloudflare:workers';
import {getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {z} from 'zod';

export const dynamic='force-dynamic';
const KEY='student_affairs_evaluation_v1';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const text=z.string().trim().max(3000);
const record=z.object({
 indicators:z.array(z.object({id:z.string().min(1).max(100),domain:z.string().trim().min(1).max(100),title:z.string().trim().min(2).max(250),source:z.string().trim().max(300),status:z.enum(['incomplete','complete','improve']),notes:text.default('')})).max(100),
 improvements:z.array(z.object({id:z.string().min(1).max(100),action:z.string().trim().min(2).max(300),responsible:z.string().trim().max(150),dueDate:z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),progress:z.number().int().min(0).max(100),evidence:text,followup:text})).max(100),
 checklist:z.array(z.object({id:z.string().min(1).max(100),label:z.string().trim().min(2).max(250),status:z.enum(['missing','available']),notes:text})).max(100),
 visitNotes:text.default(''),revision:z.number().int().nonnegative().default(0)
});
const empty={indicators:[],improvements:[],checklist:[],visitNotes:'',revision:0};

export async function GET(){
 if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);
 try{const row=await env.DB!.prepare('SELECT value FROM settings WHERE id=?').bind(KEY).first<{value:string}>();if(!row)return json(empty);const value=record.parse(JSON.parse(row.value));return json(value);}catch{return json({error:'تعذر تحميل بيانات التقويم والتحسين.'},503);}
}

export async function POST(req:Request){
 const denied=await denyReadOnlyWrite();if(denied)return denied;
 if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{const body=await req.text();if(body.length>1_000_000)return json({error:'حجم البيانات كبير'},413);const value=record.parse(JSON.parse(body));const next={...value,revision:value.revision+1};await env.DB!.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind(KEY,JSON.stringify(next)).run();return json(next);}catch(e){return json({error:e instanceof z.ZodError?'راجع حقول التقويم والتحسين.':'تعذر حفظ البيانات، حدّث الصفحة ثم أعد المحاولة.'},400);}
}
