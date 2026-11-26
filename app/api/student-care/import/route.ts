import {getTenantDb} from '../../../../lib/school-tenancy';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
import {env} from 'cloudflare:workers';
import {getKhotwaAccess,getChatGPTUser,denyReadOnlyWrite} from '../../../chatgpt-auth';
import {canAccessCare,CARE_DENIED} from '../../../../lib/care-access';
import {importCare,careImportServiceAllowed} from '../../../../lib/student-care';
import {importEmergencyContacts} from '../../../../lib/emergency-import';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser(),service=careImportServiceAllowed(req.headers,env as any);if(!service&&!canAccessCare((await getKhotwaAccess())?.role))return json({error:CARE_DENIED},403);if(!service&&!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS))return json({error:'طلب غير مسموح'},403);try{if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'راجع صيغة البيانات'},400);const text=await req.text();if(text.length>1000000)return json({error:'الطلب كبير'},413);const body=JSON.parse(text),actor=user?.displayName||'استيراد ملف الحصر بإذن المالك';return json(body.mode==='emergency'?await importEmergencyContacts(getTenantDb(),actor,body.records):await importCare(getTenantDb(),actor,body.records));}catch{return json({error:'تعذر استيراد ملف الرعاية. راجع البيانات وأعد المحاولة.'},400);}}
