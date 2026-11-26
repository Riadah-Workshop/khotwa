import {getKhotwaAccess,requireChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import ManagerDashboard from './school-manager-dashboard';
import {accountTag} from '../ui/tour-logic';
export const dynamic='force-dynamic';
export default async function ManagerPage(){
 const user=await requireChatGPTUser('/manager');
 const access=await getKhotwaAccess();
 if(!access||!['manager','main_admin'].includes(access.role))redirect('/');
 return <ManagerDashboard tourKey={accountTag(user.email)}/>;
}
