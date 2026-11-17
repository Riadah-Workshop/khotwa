import {denyReadOnlyWrite} from '../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {getDb} from '../../../db';
import {students,settings} from '../../../db/schema';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
export const dynamic='force-dynamic';
// One-time initializer. Protected both by Sites owner-private dispatch and a runtime secret.
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;
 const token=(env as unknown as {INITIAL_IMPORT_TOKEN?:string}).INITIAL_IMPORT_TOKEN;
 if(!token||req.headers.get('x-import-token')!==token)return Response.json({error:'غير مسموح'},{status:403});
 const db=getDb();const existing=await db.select().from(students).limit(1);const done=await db.select().from(settings).where(eq(settings.id,'initialImportComplete'));
 if(existing.length||done.length)return Response.json({error:'تم إدخال الطلاب سابقًا؛ الاستيراد الأولي مغلق'},{status:409});
 try{
 const schema=z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(150),grade:z.string().min(1).max(50),classroom:z.string().min(1).max(50),guardian:z.string().max(150),phone:z.string().regex(/^9665\d{8}$/),notes:z.string().max(3000)});
 const rows=z.array(schema).min(1).max(500).parse(await req.json());
 if(new Set(rows.map(x=>x.id)).size!==rows.length)return Response.json({error:'معرفات مكررة'},{status:400});
 const now=new Date().toISOString();await db.batch([...rows.map(r=>db.insert(students).values({...r,active:1,createdAt:now,updatedAt:now})),db.insert(settings).values({id:'initialImportComplete',value:now})] as any);
 return Response.json({ok:true,imported:rows.length});
 }catch(e){return Response.json({error:e instanceof z.ZodError?'بيانات غير صحيحة':'تعذر إتمام الاستيراد'},{status:400});}
}
