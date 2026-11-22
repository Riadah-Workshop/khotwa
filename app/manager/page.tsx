import {getKhotwaAccess,requireChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import ManagerDashboard from './school-manager-dashboard';
export const dynamic='force-dynamic';
export default async function ManagerPage(){
 await requireChatGPTUser('/manager');
 const access=await getKhotwaAccess();
 if(!access||!['manager','main_admin'].includes(access.role))redirect('/');
 return <ManagerDashboard/>;
}
