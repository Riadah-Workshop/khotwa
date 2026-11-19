import {requireChatGPTUser,getKhotwaAccess} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import AdminConsole from './admin-console';
export const dynamic='force-dynamic';
export default async function SchoolAdminPage(){
 await requireChatGPTUser('/admin');
 const role=await getKhotwaAccess();
 if(role?.role!=='main_admin')redirect('/');
 return <AdminConsole activeSchoolId={role.schoolId}/>;
}
