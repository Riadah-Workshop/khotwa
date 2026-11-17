import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {registrarName} from '../../../lib/registrar-name';
import {familyLinkInsert,familyLinkMerge} from '../../../lib/student-family';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{if(!await getChatGPTUser())return json({error:'يرجى تسجيل الدخول'},401);const rows=await env.DB!.prepare('SELECT student_id AS studentId,family_id AS familyId,actor,updated_at AS updatedAt FROM student_families').all();return json({members:rows.results});}catch{return json({error:'تعذر تحميل ربط الإخوة. أعد المحاولة.'},500);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;try{const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==new URL(req.url).host)return json({error:'طلب غير مسموح'},403);if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'صيغة غير صحيحة'},400);
 const id=z.string().min(1).max(100),v=z.discriminatedUnion('op',[z.object({op:z.literal('link'),studentId:id,siblingId:id}),z.object({op:z.literal('unlink'),studentId:id})]).parse(await req.json());const actor=registrarName(user.displayName,user.email),now=new Date().toISOString(),db=env.DB!;
 if(v.op==='link'){if(v.studentId===v.siblingId)return json({error:'اختر طالبًا آخر'},400);const count=await db.prepare('SELECT COUNT(*) AS n FROM students WHERE id IN (?,?) AND active=1').bind(v.studentId,v.siblingId).first<{n:number}>();if(count?.n!==2)return json({error:'اختر طالبين نشطين من المدرسة'},400);
 const results=await db.batch([db.prepare(familyLinkInsert).bind(crypto.randomUUID(),actor,now,v.studentId,v.siblingId,v.studentId,v.siblingId),db.prepare(familyLinkMerge).bind(v.studentId,v.siblingId,v.studentId,actor,now,v.studentId,v.siblingId),db.prepare("SELECT COUNT(DISTINCT family_id) AS groups,COUNT(*) AS members FROM student_families WHERE student_id IN (?,?) AND family_id<>''").bind(v.studentId,v.siblingId)]);const verified=results[2].results[0] as {groups:number;members:number};if(verified?.members!==2||verified.groups!==1)return json({error:'تغيرت بيانات الطلاب أثناء الربط. حدّث القائمة وأعد المحاولة.'},409);
 }else{await db.prepare("UPDATE student_families SET family_id='',actor=?,updated_at=? WHERE student_id=?").bind(actor,now,v.studentId).run();}
 return json({ok:true});
 }catch(e){return json({error:e instanceof z.ZodError?'تحقق من بيانات الطالب':'تعذر حفظ ربط الإخوة. حدّث القائمة وأعد المحاولة.'},e instanceof z.ZodError?400:500);}}
