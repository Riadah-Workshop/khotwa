import {env} from 'cloudflare:workers';
import {getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {saveMovement} from '../../../lib/student-movements';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{const r=await env.DB!.prepare('SELECT payload FROM student_movements ORDER BY updated_at DESC').all<any>();return json({rows:r.results.map(r=>JSON.parse(r.payload))});}catch{return json({error:'تعذر تحميل السجل. أعد المحاولة.'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(req.headers.get('origin')!==new URL(req.url).origin||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);try{const raw=await req.text();if(raw.length>20000)return json({error:'الطلب كبير'},413);return json({row:await saveMovement(env.DB!,JSON.parse(raw),user.displayName||user.email)});}catch(e){const msg=e instanceof Error?e.message:'';return json({error:msg.startsWith('تغير')||msg.startsWith('الطالب')?msg:'راجع اسم الطالب والمدرسة والتاريخ وقائمة التحقق.'},msg.startsWith('تغير')?409:400);}}
