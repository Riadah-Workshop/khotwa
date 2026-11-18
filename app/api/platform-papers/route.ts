import {env} from 'cloudflare:workers';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {getDb} from '../../../db';
import {platformPapers,students} from '../../../db/schema';
import {and,eq,desc} from 'drizzle-orm';
import {validatePaper} from '../../../lib/platform-papers';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);try{return json({rows:await getDb().select().from(platformPapers).orderBy(desc(platformPapers.deliveredAt))});}catch{return json({error:'تعذر تحميل الأوراق. أعد المحاولة.'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.includes('application/json'))return json({error:'طلب غير مسموح'},403);
try{const raw=await req.text();if(raw.length>20000)return json({error:'الطلب كبير'},413);const v=JSON.parse(raw);validatePaper(v);const db=getDb();const [student]=await db.select().from(students).where(eq(students.id,v.studentId));if(!student)return json({error:'الطالب غير موجود في دليل الطلاب'},400);const values={studentId:student.id,name:student.name,grade:student.grade,classroom:student.classroom,deliveredAt:v.deliveredAt,status:v.status,signed:v.signed,returned:v.returned,notes:v.notes.trim(),updatedAt:new Date().toISOString(),actor:user.displayName};
if(v.id){if(!Number.isInteger(v.revision))return json({error:'حدّث السجلات قبل التعديل'},409);const result=await db.update(platformPapers).set({...values,revision:v.revision+1}).where(and(eq(platformPapers.id,v.id),eq(platformPapers.revision,v.revision))).returning();if(!result.length)return json({error:'تغير السجل من جلسة أخرى. حدّث القائمة ثم أعد فتحه.'},409);return json({row:result[0]});}
const [existing]=await db.select().from(platformPapers).where(and(eq(platformPapers.studentId,v.studentId),eq(platformPapers.deliveredAt,v.deliveredAt)));if(existing)return json({error:'توجد ورقة لهذا الطالب في التاريخ نفسه. عدّل السجل الموجود.'},409);const [row]=await db.insert(platformPapers).values({...values,id:crypto.randomUUID()}).returning();return json({row});
}catch(e){return json({error:e instanceof Error&&/راجع|الحالة/.test(e.message)?e.message:'تعذر الحفظ. حدّث القائمة وتحقق من عدم تكرار الطالب والتاريخ.'},400);}}
