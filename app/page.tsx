import {LocaleProvider} from './locale';
import {isReadOnlyEmail} from '../lib/access-policy';
import ReadOnlyAccess from './read-only-access';
import Dashboard from './dashboard';
import {requireChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');const readOnly=isReadOnlyEmail(user.email);return <LocaleProvider email={user.email}><ReadOnlyAccess readOnly={readOnly}><Dashboard readOnly={readOnly}/></ReadOnlyAccess></LocaleProvider>;}
