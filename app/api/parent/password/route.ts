import {env} from 'cloudflare:workers';
import {getKhotwaAccess,getChatGPTUser} from '../../../chatgpt-auth';
import {hashPassword,verifyPassword} from '../../../../lib/account-security';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const access=await getKhotwaAccess(),user=await getChatGPTUser();
 if(access?.role!=='parent'||!user)return Response.json({error:'غير مصرح'},{status:403});
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS,true))return Response.json({error:'طلب غير مسموح'},{status:403});
 try{
  const raw=await req.text();if(raw.length>3000)return Response.json({error:'الطلب كبير'},{status:413});
  const v=JSON.parse(raw);if(typeof v.oldPassword!=='string'||typeof v.newPassword!=='string'||v.newPassword.length<12||v.newPassword.length>256)return Response.json({error:'كلمة المرور الجديدة يجب أن تتكون من 12 حرفاً على الأقل'},{status:400});
  const db=env.DB!,row=await db.prepare('SELECT password_hash FROM khotwa_parent_identities WHERE phone=?').bind(access.parentPhone).first<{password_hash:string}>();
  if(!row||!await verifyPassword(v.oldPassword,row.password_hash))return Response.json({error:'كلمة المرور الحالية غير صحيحة'},{status:403});
  const hash=await hashPassword(v.newPassword);
  await db.prepare('UPDATE khotwa_parent_identities SET password_hash=?,session_version=session_version+1 WHERE phone=?').bind(hash,access.parentPhone).run();
  return Response.json({ok:true,requiresLogin:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'تعذر تحديث كلمة المرور'},{status:503});}
}
