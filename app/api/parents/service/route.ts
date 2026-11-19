import {getTenantDb} from '../../../../lib/school-tenancy';
import {denyReadOnlyWrite} from '../../../chatgpt-auth';
import {env} from 'cloudflare:workers';
import {parentPhone,parentView} from '../../../../lib/parent-view';
export const dynamic='force-dynamic';
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;
 const e=({...env as unknown as {DB:D1Database;PARENT_SERVICE_KEY?:string},DB:getTenantDb()});
 const supplied=req.headers.get('X-Parent-Key')||'';
 if(!e.PARENT_SERVICE_KEY||supplied.length!==e.PARENT_SERVICE_KEY.length)return Response.json({error:'غير مصرح'},{status:401});
 let diff=0;for(let i=0;i<supplied.length;i++)diff|=supplied.charCodeAt(i)^e.PARENT_SERVICE_KEY.charCodeAt(i);if(diff)return Response.json({error:'غير مصرح'},{status:401});
 try{const text=await req.text();if(text.length>300)return Response.json({error:'طلب غير صالح'},{status:400});const v=JSON.parse(text),phone=parentPhone(v.phone);if(!phone)return Response.json({error:'طلب غير صالح'},{status:400});return Response.json(await parentView(e.DB,phone),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'تعذر تحميل السجل'},{status:503});}
}
