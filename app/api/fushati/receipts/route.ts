import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getKhotwaAccess,getChatGPTUser} from '../../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
import {db,response,now,moneyMinor,permittedStudent,permittedCafeteria,getOrCreateAccount} from '../../../../lib/fushati/core';
export const dynamic='force-dynamic';
const MAX_BYTES=4*1024*1024;
const store=()=>((env as unknown as {BUCKET?:R2Bucket}).BUCKET);
function mime(bytes:Uint8Array){
 if(bytes.length>8&&bytes[0]===0xFF&&bytes[1]===0xD8&&bytes[2]===0xFF)return 'image/jpeg';
 if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>12&&[82,73,70,70].every((v,i)=>bytes[i]===v)&&[87,69,66,80].every((v,i)=>bytes[8+i]===v))return 'image/webp';
 if(bytes.length>6&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45)return 'application/pdf';
 return null;
}
export async function POST(req:Request){
 const access=await getKhotwaAccess();if(access?.role!=='parent'||!access.parentPhone||!await getChatGPTUser())return response({error:'ولي الأمر فقط'},403);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.startsWith('multipart/form-data'))return response({error:'طلب غير مسموح'},403);
 if(Number(req.headers.get('content-length')||0)>MAX_BYTES+100000)return response({error:'حجم الملف يتجاوز 4 ميجابايت'},413);
 let key='';
 try{
  const form=await req.formData();
  const cafeId=z.string().uuid().parse(form.get('cafeteriaId'));
  const studentId=z.string().uuid().parse(form.get('studentId'));
  const amount=moneyMinor(form.get('amount')),ref=z.string().trim().min(5).max(80).parse(form.get('reference'));
  if(!amount||amount>100000000)return response({error:'المبلغ يجب أن يكون أكبر من صفر'},400);
  const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>MAX_BYTES)return response({error:'اختر ملفاً لا يزيد عن 4 ميجابايت'},400);
  const cafe=await db().prepare('SELECT id,school_id,bank_name,iban,beneficiary FROM fushati_cafeterias WHERE id=? AND active=1').bind(cafeId).first<any>();
  if(!cafe||!await permittedStudent(access.parentPhone,cafe.school_id,studentId))return response({error:'الطالب غير مرتبط بحسابك'},403);
  if(!cafe.bank_name||!cafe.iban||!cafe.beneficiary)return response({error:'بيانات البنك لم تكتمل بعد. تواصل مع إدارة المقصف.'},409);
  const duplicate=await db().prepare('SELECT 1 FROM fushati_transfers WHERE destination_iban=? AND bank_reference=?').bind(cafe.iban,ref).first();
  if(duplicate)return response({error:'رقم مرجع الحوالة مستخدم مسبقاً'},409);
  const bytes=new Uint8Array(await file.arrayBuffer()),type=mime(bytes);
  if(!type)return response({error:'الصيغ المدعومة: JPG / PNG / WebP / PDF فقط'},400);
  const bucket=store();if(!bucket)return response({error:'التخزين الخاص غير متاح حالياً'},503);
  const account=await getOrCreateAccount(cafe.school_id,cafe.id,studentId);if(!account)return response({error:'تعذر فتح حساب الطالب'},503);if(account.active!==1)return response({error:'حساب الطالب موقوف. يجب تفعيله قبل طلب شحن الرصيد.'},409);
  const transferId=crypto.randomUUID();key=`fushati-receipts/${cafe.id}/${transferId}/${crypto.randomUUID()}`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:type}});
  await db().prepare('INSERT INTO fushati_transfers(id,account_id,cafeteria_id,parent_phone,amount_minor,bank_reference,destination_iban,receipt_key,receipt_mime,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(transferId,account.id,cafe.id,access.parentPhone,amount,ref,cafe.iban,key,type,now()).run();
  return response({ok:true,id:transferId,status:'pending'});
 }catch(e){if(key)try{await store()?.delete(key)}catch{};if(/UNIQUE constraint/.test(String(e)))return response({error:'مرجع الحوالة مسجل سابقاً لهذا الحساب البنكي'},409);console.error('fushati_receipt_upload_failed',e instanceof Error?e.name:'unknown');return response({error:'تعذر حفظ الإيصال. تحقق من رقم المرجع أو الملف ثم أعد المحاولة.'},503);}
}
export async function GET(req:Request){
 const access=await getKhotwaAccess(),user=await getChatGPTUser();if(!access||!user)return response({error:'يرجى تسجيل الدخول'},401);
 const id=new URL(req.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)return response({error:'الإيصال غير موجود'},404);
 try{
  const row=await db().prepare('SELECT cafeteria_id,parent_phone,receipt_key,receipt_mime FROM fushati_transfers WHERE id=?').bind(id).first<any>();
  if(!row)return response({error:'الإيصال غير موجود'},404);
  // The parent who sent it, or cafeteria staff who may review transfers in that very cafeteria (never another cafeteria's).
  const own=access.role==='parent'&&row.parent_phone===access.parentPhone;
  if(!own&&!await permittedCafeteria({...access,userId:user.userId},row.cafeteria_id,true,'transfers_review'))return response({error:'غير مصرح'},403);
  const object=await store()?.get(row.receipt_key);if(!object)return response({error:'ملف الإيصال غير متاح'},404);
  return new Response(object.body,{headers:{'Cache-Control':'private, no-store','Content-Type':row.receipt_mime,'Content-Disposition':`attachment; filename="fushati-receipt-${id}.${row.receipt_mime==='application/pdf'?'pdf':'img'}"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch{return response({error:'تعذر تحميل الإيصال'},503);}
}
