import {env} from 'cloudflare:workers';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {compatibilityRuns} from '../../../db/schema';
import {and,eq,desc} from 'drizzle-orm';
import {runSchema} from '../../../lib/compatibility';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{const rows=await getDb().select().from(compatibilityRuns).orderBy(desc(compatibilityRuns.updatedAt));return json({rows:rows.map(r=>({...JSON.parse(r.payload),revision:r.revision,updatedAt:r.updatedAt,actor:r.actor}))});}catch{return json({error:'تعذر تحميل سجل التوافق'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);try{const raw=await req.text();if(raw.length>65000)return json({error:'السجل كبير جدًا'},413);const parsed=runSchema.safeParse(JSON.parse(raw));if(!parsed.success)return json({error:parsed.error.issues[0].message},400);const v=parsed.data,db=getDb(),values={payload:JSON.stringify(v),updatedAt:new Date().toISOString(),actor:user.displayName};if(v.revision){const updated=await db.update(compatibilityRuns).set({...values,revision:v.revision+1}).where(and(eq(compatibilityRuns.id,v.id),eq(compatibilityRuns.revision,v.revision))).returning();if(!updated.length)return json({error:'تغير السجل. حدّث القائمة قبل التعديل.'},409);return json({row:{...v,revision:v.revision+1,...values,payload:undefined}});}await db.insert(compatibilityRuns).values({...values,id:v.id});return json({row:{...v,revision:1,updatedAt:values.updatedAt,actor:values.actor}});}catch{return json({error:'تعذر الحفظ. حدّث السجل للتحقق قبل إعادة المحاولة.'},400);}}
