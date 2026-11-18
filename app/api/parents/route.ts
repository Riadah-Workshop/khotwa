import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {parentPhone} from '../../../lib/parent-view';
export const dynamic='force-dynamic';
const json=(v:any,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const config=()=>env as unknown as {DB:D1Database;PARENT_SERVICE_KEY:string;VISITOR_PORTAL_URL:string};
async function remote(payload:any){const e=config();if(!e.VISITOR_PORTAL_URL||!e.PARENT_SERVICE_KEY)throw new Error('خدمة الحسابات غير مفعلة');const r=await fetch(new URL('/api/parent-admin',e.VISITOR_PORTAL_URL),{method:'POST',headers:{'Content-Type':'application/json','X-Parent-Key':e.PARENT_SERVICE_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});const v:any=await r.json();if(!r.ok)throw new Error(v.error||'تعذر تحديث الحساب');return v;}
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{const e=config(),grants=await e.DB.prepare('SELECT phone,student_ids,enabled,updated_at FROM parent_grants ORDER BY updated_at DESC').all();return json({grants:grants.results,portalUrl:new URL('/parents',e.VISITOR_PORTAL_URL).toString()});}catch{return json({error:'تعذر تحميل حسابات أولياء الأمور'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
 try{const text=await req.text();if(text.length>5000)return json({error:'الطلب كبير'},413);const v=JSON.parse(text),phone=parentPhone(v.phone),e=config();if(!phone||!['activate','reset','disable'].includes(v.op))return json({error:'راجع رقم الجوال'},400);
 const old=await e.DB.prepare('SELECT * FROM parent_grants WHERE phone=?').bind(phone).first<any>();
 if(v.op==='activate'){
  if(!Array.isArray(v.studentIds)||!v.studentIds.length||v.studentIds.length>20||v.studentIds.some((x:any)=>typeof x!=='string'||x.length>100))return json({error:'اختر أبناء ولي الأمر'},400);
  const ids=[...new Set<string>(v.studentIds)];for(const id of ids){const s=await e.DB.prepare('SELECT active,phone FROM students WHERE id=?').bind(id).first<any>();if(!s?.active||parentPhone(s.phone)!==phone)return json({error:'تغيرت البيانات أو رقم الطالب مختلف عن رقم الحساب. حدّث بيانات الطالب أولًا.'},409);}
  const result=await remote({op:'activate',phone});
  await e.DB.prepare('INSERT INTO parent_grants(phone,student_ids,enabled,updated_at,actor) VALUES(?,?,1,?,?) ON CONFLICT(phone) DO UPDATE SET student_ids=excluded.student_ids,enabled=1,updated_at=excluded.updated_at,actor=excluded.actor').bind(phone,JSON.stringify(ids),new Date().toISOString(),user.email).run();return json({...result,portalUrl:new URL('/parents',e.VISITOR_PORTAL_URL).toString()});
 }
 if(!old)return json({error:'الحساب غير موجود'},404);
 if(v.op==='disable'){await e.DB.prepare('UPDATE parent_grants SET enabled=0,updated_at=?,actor=? WHERE phone=?').bind(new Date().toISOString(),user.email,phone).run();await remote({op:'disable',phone});return json({ok:true});}
 if(!old.enabled)return json({error:'فعّل الحساب أولًا'},400);return json(await remote({op:'reset',phone}));
 }catch(error){return json({error:error instanceof Error?error.message:'تعذر حفظ الحساب'},503);}
}
