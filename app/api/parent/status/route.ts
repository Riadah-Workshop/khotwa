import {env} from 'cloudflare:workers';
import {getKhotwaAccess} from '../../../chatgpt-auth';
import {runWithSchool,getTenantDb} from '../../../../lib/school-tenancy';
import {parentView} from '../../../../lib/parent-view';
import {parentLinkedSchools} from '../../../../lib/parent-identities';
export const dynamic='force-dynamic';
export async function GET(){
 const access=await getKhotwaAccess();
 if(access?.role!=='parent'||!access.parentPhone)return Response.json({error:'غير مصرح'},{status:403});
 try{
  const schools=await parentLinkedSchools(env.DB!,access.parentPhone);
  const students=[];
  for(const school of schools){
   // This scoped context is constructed from trusted global school records, not client input.
   const view=await runWithSchool({schoolId:school.id,role:'parent',identity:access.parentPhone},()=>parentView(getTenantDb(),access.parentPhone));
   for(const student of view.students)students.push({...student,schoolId:school.id,schoolName:school.name,key:school.id+':'+student.id});
  }
  return Response.json({students,schoolCount:schools.length,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'تعذر تحميل حالة الطلاب'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
