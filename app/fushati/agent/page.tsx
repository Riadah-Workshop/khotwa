import {getKhotwaAccess,requireChatGPTUser} from '../../chatgpt-auth';
import {redirect} from 'next/navigation';
import FushatiDashboard from '../fushati-dashboard';
export const dynamic='force-dynamic';
export default async function AgentFushati(){await requireChatGPTUser('/fushati/agent');const access=await getKhotwaAccess();if(!access||!['main_admin','fushati_agent'].includes(access.role))redirect('/');return <FushatiDashboard mode="agent"/>;}
