import {getKhotwaAccess,requireChatGPTUser} from '../chatgpt-auth';
import {redirect} from 'next/navigation';
import ParentPortal from './parent-portal';
import {accountTag} from '../ui/tour-logic';
export const dynamic='force-dynamic';
export default async function ParentPage(){
 await requireChatGPTUser('/parent');
 const access=await getKhotwaAccess();
 if(access?.role!=='parent')redirect('/');
 return <ParentPortal tourKey={accountTag(access.parentPhone)}/>;
}
