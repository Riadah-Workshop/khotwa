import {getTenantDb} from '../../../lib/school-tenancy';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {env} from 'cloudflare:workers';
import {getKhotwaAccess,getChatGPTUser,denyReadOnlyWrite} from '../../chatgpt-auth';
import {canAccessCare,CARE_DENIED} from '../../../lib/care-access';
import {getCare,saveCare,restoreCare,CareError} from '../../../lib/student-care';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(!canAccessCare(user.email)&&!(await isSchoolManager()))return json({error:CARE_DENIED},403);try{const studentId=new URL(req.url).searchParams.get('studentId')||undefined;return json(await getCare(getTenantDb(),studentId));}catch{return json({error:'تعذر تحميل بيانات الرعاية.'},503);}}
export async function POST(req:Request){const denied=await denyReadOnlyWrite();if(denied)return denied;const user=await getChatGPTUser();if(!user)return json({error:'يرجى تسجيل الدخول'},401);if(!canAccessCare(user.email)&&!(await isSchoolManager()))return json({error:CARE_DENIED},403);if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS))return json({error:'طلب غير مسموح'},403);try{const text=await req.text();if(text.length>200000)return json({error:'الطلب كبير'},413);const input=JSON.parse(text);return json(input.op==='restore'?await restoreCare(getTenantDb(),input.data):await saveCare(getTenantDb(),user.displayName||user.email,input));}catch(e){return json({error:e instanceof CareError?e.message:'راجع البيانات وأعد المحاولة.'},e instanceof CareError?e.status:400);}}

async function isSchoolManager(){const access=await getKhotwaAccess();return access?.role==='main_admin'||access?.role==='deputy';}
