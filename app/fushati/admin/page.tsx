import {getKhotwaAccess,requireChatGPTUser} from '../../chatgpt-auth';
import {redirect} from 'next/navigation';
import FushatiDashboard from '../fushati-dashboard';
import {accountTag} from '../../ui/tour-logic';
export const dynamic='force-dynamic';
export default async function AdminFushati(){const user=await requireChatGPTUser('/fushati/admin');const access=await getKhotwaAccess();if(!access||!['main_admin','fushati_admin'].includes(access.role))redirect('/');return <FushatiDashboard mode="admin" tourKey={accountTag(user.email)}/>;}
