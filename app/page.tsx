import {LocaleProvider} from './locale';
import {isReadOnlyRole} from '../lib/access-policy';
import ReadOnlyAccess from './read-only-access';
import Dashboard from './dashboard';
import {requireChatGPTUser,getKhotwaAccess} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');const access=await getKhotwaAccess();const readOnly=isReadOnlyRole(access?.role);return <LocaleProvider email={user.email}><ReadOnlyAccess readOnly={readOnly}><Dashboard readOnly={readOnly} mainAdmin={access?.role==='main_admin'} allowCare={access?.role==='main_admin'||access?.role==='deputy'} schoolId={access?.schoolId||'default'}/></ReadOnlyAccess></LocaleProvider>;}
