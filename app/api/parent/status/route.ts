import {env} from 'cloudflare:workers';
import {getKhotwaAccess} from '../../../chatgpt-auth';
import {getTenantDb} from '../../../../lib/school-tenancy';
import {parentView} from '../../../../lib/parent-view';
export const dynamic='force-dynamic';
export async function GET(){
 const access=await getKhotwaAccess();
 if(access?.role!=='parent'||!access.parentPhone)return Response.json({error:'غير مصرح'},{status:403});
 try{
  const school=await env.DB!.prepare('SELECT name FROM khotwa_schools WHERE id=?').bind(access.schoolId).first<{name:string}>();
  const view=await parentView(getTenantDb(),access.parentPhone);
  return Response.json({...view,schoolName:school?.name||'المدرسة'},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'تعذر تحميل حالة الطلاب'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
