import {env} from 'cloudflare:workers';
import {getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {schoolWorkData,saveSchoolWork,restoreSchoolWork,SchoolWorkError} from '../../../lib/school-work';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{return json(await schoolWorkData(env.DB!));}catch{return json({error:'تعذر تحميل السجلات. أعد المحاولة.'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(req.headers.get('origin')!==new URL(req.url).origin||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);try{const text=await req.text();if(text.length>5_000_000)return json({error:'الطلب كبير'},413);const input=JSON.parse(text);const result=input.op==='restore'?await restoreSchoolWork(env.DB!,input.data):await saveSchoolWork(env.DB!,user.displayName||user.email,input);return json(result);}catch(e){return json({error:e instanceof SchoolWorkError?e.message:'راجع البيانات أو حدّث الصفحة وأعد المحاولة.'},e instanceof SchoolWorkError?e.status:400);}}
