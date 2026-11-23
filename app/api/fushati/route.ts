import {env} from 'cloudflare:workers';
import {z,ZodError} from 'zod';
import {getKhotwaAccess,getChatGPTUser} from '../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../lib/request-origin';
import {hashPassword,verifyPassword,temporaryPassword} from '../../../lib/account-security';
import {parentLinkedSchools} from '../../../lib/parent-identities';
import {tableName} from '../../../lib/school-sql';
import {db,response,now,keyDate,moneyMinor,moneySar,isCafeAdmin,isCafeStaff,permittedCafeteria,permittedStudent,activeStudent,getOrCreateAccount,makeQrToken,readQrToken,audit} from '../../../lib/fushati/core';
export const dynamic='force-dynamic';
const id=z.string().uuid();
const schoolId=z.string().regex(/^(default|[a-f0-9]{12})$/);
const name=z.string().trim().min(2).max(140);
const email=z.string().trim().toLowerCase().email().max(200);
const flag=z.boolean();
const cash=z.union([z.string(),z.number()]);
const bodyModel=z.object({op:z.string().min(1).max(45),data:z.unknown()});
const parse=(v:unknown,schema:z.ZodTypeAny)=>schema.parse(v) as any;
const err=(message:string,code=400)=>response({error:message},code);
function rateError(e:unknown){
 const msg=String(e instanceof Error?e.message:e);
 if(msg.includes('FUSHATI_INSUFFICIENT_BALANCE'))return err('رصيد الطالب لا يكفي لإكمال العملية',409);
 if(msg.includes('FUSHATI_DAILY_LIMIT'))return err('الشراء يتجاوز الحد اليومي للطالب',409);
 if(msg.includes('FUSHATI_MONTHLY_LIMIT'))return err('الشراء يتجاوز الحد الشهري للطالب',409);
 if(msg.includes('FUSHATI_ITEM_BLOCKED'))return err('هذا المنتج غير مسموح به من ولي الأمر',409);
 if(msg.includes('FUSHATI_ACCOUNT_INACTIVE'))return err('الحساب موقوف',409);
 if(/UNIQUE constraint|FOREIGN KEY constraint/i.test(msg))return err('سجل مكرر أو مرتبط ببيانات أخرى',409);
 if(e instanceof ZodError)return err('المدخلات غير صحيحة: تحقق من الحقول المطلوبة',400);
 console.error('fushati_operation_failed',e instanceof Error?e.name:'unknown');
 return err('تعذرت العملية؛ تحقق من اتصال قاعدة البيانات وتطبيق الترحيل 0027',503);
}
async function current(){const [access,user]=await Promise.all([getKhotwaAccess(),getChatGPTUser()]);return access&&user?{...access,userId:user.userId,email:user.email}:null;}
function staffReady(row:any){return !row?.must_change_password;}
async function mustChange(access:{role:string;userId:string}){
 if(access.role==='main_admin'||access.role==='parent'||access.role==='manager')return false;
 const row=await db().prepare('SELECT must_change_password FROM fushati_users WHERE id=? AND active=1').bind(access.userId).first<{must_change_password:number}>();
 return !row||row.must_change_password===1;
}
async function cafesFor(access:{role:string;userId:string}){
 if(access.role==='fushati_agent')return (await db().prepare('SELECT c.*,s.name AS school_name FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id JOIN fushati_assignments a ON a.cafeteria_id=c.id WHERE a.user_id=? AND c.active=1 AND s.active=1 ORDER BY s.name,c.name').bind(access.userId).all<any>()).results;
 return (await db().prepare('SELECT c.*,s.name AS school_name FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id WHERE s.active=1 ORDER BY s.name,c.name').all<any>()).results;
}
async function parentBootstrap(phone:string){
 const schools=await parentLinkedSchools(db(),phone),students:any[]=[];
 for(const school of schools){
  const grant=await db().prepare(`SELECT student_ids FROM "${tableName(school.id,'parent_grants')}" WHERE phone=? AND enabled=1`).bind(phone).first<{student_ids:string}>();
  let ids:string[]=[];try{ids=JSON.parse(grant?.student_ids||'[]')}catch{}
  if(!Array.isArray(ids))continue;
  const cafeterias=(await db().prepare('SELECT id,name,bank_name,iban,beneficiary,active FROM fushati_cafeterias WHERE school_id=? ORDER BY active DESC,name').bind(school.id).all<any>()).results;
  for(const studentId of ids.slice(0,20)){
   if(typeof studentId!=='string')continue;
   const student=await permittedStudent(phone,school.id,studentId);if(!student)continue;
   for(const cafeteria of cafeterias){
    const account=await db().prepare('SELECT id,balance_minor,daily_limit_minor,monthly_limit_minor,allowed_item_ids,active,spent_day_minor,spent_month_minor,day_key,month_key FROM fushati_accounts WHERE cafeteria_id=? AND student_id=?').bind(cafeteria.id,studentId).first<any>();
    const today=keyDate();
    students.push({schoolId:school.id,schoolName:school.name,studentId,studentName:student.name,grade:student.grade, cafeteria,
     balanceMinor:account?.balance_minor||0,dailyLimitMinor:account?.daily_limit_minor??300,monthlyLimitMinor:account?.monthly_limit_minor??0,
     allowedItemIds:JSON.parse(account?.allowed_item_ids||'[]'),active:account?.active??1,
     todaySpentMinor:account?.day_key===today.day?account.spent_day_minor:0,
     monthSpentMinor:account?.month_key===today.month?account.spent_month_minor:0});
   }
  }
 }
 return students;
}
export async function GET(req:Request){
 const access=await current();if(!access)return err('يرجى تسجيل الدخول',401);
 const search=new URL(req.url).searchParams,op=search.get('op')||'bootstrap';
 try{
  if(access.role==='parent'){
   if(op==='bootstrap')return response({students:await parentBootstrap(access.parentPhone)});
   const cafeteriaId=id.parse(search.get('cafeteriaId')),studentId=id.parse(search.get('studentId'));
   const cafe=await db().prepare('SELECT id,school_id,active FROM fushati_cafeterias WHERE id=?').bind(cafeteriaId).first<any>();
   if(!cafe||!await permittedStudent(access.parentPhone,cafe.school_id,studentId))return err('لا تملك صلاحية الوصول إلى هذا الطالب',403);
   if(op==='menu')return response({menu:(await db().prepare('SELECT id,name,category,price_minor,available FROM fushati_menu_items WHERE cafeteria_id=? AND active=1 AND available=1 ORDER BY category,name').bind(cafeteriaId).all()).results});
   if(op==='qr'){if(!cafe.active)return err('المقصف موقوف',409);return response({token:await makeQrToken(cafeteriaId,studentId),expiresInSeconds:600});}
   if(op==='history'){
    const account=await db().prepare('SELECT id FROM fushati_accounts WHERE cafeteria_id=? AND student_id=?').bind(cafeteriaId,studentId).first<any>();
    if(!account)return response({ledger:[],transfers:[]});
    const [ledger,transfers]=await db().batch([
     db().prepare('SELECT entry_type,description,amount_minor,created_at FROM fushati_ledger WHERE account_id=? ORDER BY created_at DESC LIMIT 60').bind(account.id),
     db().prepare('SELECT id,amount_minor,status,bank_reference,created_at,review_note FROM fushati_transfers WHERE account_id=? AND parent_phone=? ORDER BY created_at DESC LIMIT 60').bind(account.id,access.parentPhone)]);
    return response({ledger:ledger.results,transfers:transfers.results});
   }
   return err('عملية غير متاحة',400);
  }
  if(access.role==='manager'&&op==='manager-summary'){
   const rows=(await db().prepare('SELECT c.name,COUNT(DISTINCT p.id) purchases,COALESCE(SUM(p.total_minor),0) sales_minor FROM fushati_cafeterias c LEFT JOIN fushati_purchases p ON p.cafeteria_id=c.id AND p.posted=1 WHERE c.school_id=? GROUP BY c.id').bind(access.schoolId).all()).results;
   return response({cafeterias:rows});
  }
  if(!isCafeStaff(access))return err('غير مسموح',403);
  const cafes=await cafesFor(access);
  if(op==='bootstrap'){
   const menu=(await db().prepare('SELECT m.* FROM fushati_menu_items m ORDER BY m.created_at DESC').all<any>()).results.filter(m=>cafes.some(c=>c.id===m.cafeteria_id));
   const assignments=access.role==='fushati_agent'?[]:(await db().prepare('SELECT * FROM fushati_assignments').all()).results;
   const users=!isCafeAdmin(access)?[]:(await db().prepare('SELECT id,email,full_name,role,active,must_change_password,created_at FROM fushati_users ORDER BY created_at DESC').all<any>()).results.filter(u=>access.role==='main_admin'||u.role==='fushati_agent');
   const transfers=isCafeAdmin(access)?(await db().prepare('SELECT t.id,t.cafeteria_id,t.account_id,t.parent_phone,t.amount_minor,t.bank_reference,t.status,t.created_at,t.review_note,a.student_id,a.school_id FROM fushati_transfers t JOIN fushati_accounts a ON a.id=t.account_id ORDER BY t.created_at DESC LIMIT 300').all<any>()).results.filter(t=>cafes.some(c=>c.id===t.cafeteria_id)):[];
   const paid=(await db().prepare('SELECT p.cafeteria_id,p.total_minor,p.created_at FROM fushati_purchases p WHERE p.posted=1 ORDER BY p.created_at DESC LIMIT 1000').all<any>()).results.filter(p=>cafes.some(c=>c.id===p.cafeteria_id));
   const mustChangePassword=await mustChange(access);
   const schools=isCafeAdmin(access)?(await db().prepare("SELECT id,name,region,city FROM khotwa_schools WHERE active=1 AND id<>'default' ORDER BY name").all()).results:[];
   return response({cafeterias:cafes,menu,users,assignments,transfers,purchases:paid,schools,role:access.role,mustChangePassword});
  }
  if(await mustChange(access))return err('يجب تغيير كلمة المرور المؤقتة أولاً',403);
  if(op==='lookup'){
   const decoded=await readQrToken(search.get('token')||'');if(!decoded)return err('رمز QR غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً.',400);
   const cafe=await permittedCafeteria(access,decoded.cafeteriaId);if(!cafe)return err('هذا الرمز لمقصف آخر',403);
   const student=await activeStudent(cafe.school_id,decoded.studentId);if(!student)return err('الطالب غير متاح',404);
   const account=await getOrCreateAccount(cafe.school_id,cafe.id,student.id);if(!account||account.active!==1)return err('حساب فسحتي لهذا الطالب موقوف',403);
   const today=keyDate();
   return response({student:{id:student.id,name:student.name,grade:student.grade,classroom:student.classroom},cafeteriaId:cafe.id,
    balanceMinor:account.balance_minor,dailyLimitMinor:account.daily_limit_minor,monthlyLimitMinor:account.monthly_limit_minor,
    todaySpentMinor:account.day_key===today.day?account.spent_day_minor:0,monthSpentMinor:account.month_key===today.month?account.spent_month_minor:0,
    allowedItemIds:JSON.parse(account.allowed_item_ids||'[]')});
  }
  if(op==='balances'){
   if(!isCafeAdmin(access))return err('صلاحية مدير المقصف فقط',403);
   const selected=id.parse(search.get('cafeteriaId'));
   const cafe=await permittedCafeteria(access,selected,true);if(!cafe)return err('المقصف غير متاح',404);
   const accounts=(await db().prepare('SELECT id,student_id,balance_minor,daily_limit_minor,monthly_limit_minor,active FROM fushati_accounts WHERE cafeteria_id=? ORDER BY created_at DESC LIMIT 500').bind(selected).all<any>()).results;
   const students=[];
   for(const acc of accounts){
    const student=await db().prepare(`SELECT name,grade,classroom FROM "${tableName(cafe.school_id,'students')}" WHERE id=?`).bind(acc.student_id).first<any>();
    students.push({...acc,student_name:student?.name||'طالب غير موجود',grade:student?.grade||'',classroom:student?.classroom||''});
   }
   return response({accounts:students});
  }
  if(op==='export'){
   if(!isCafeAdmin(access))return err('للمدير فقط',403);
   const selected=id.parse(search.get('cafeteriaId'));
   const cafe=await permittedCafeteria(access,selected,true);if(!cafe)return err('المقصف غير متاح',404);
   const from=search.get('from')||'0000-01-01',to=search.get('to')||'9999-12-31';
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return err('تاريخ التقرير غير صحيح',400);
   const rows=(await db().prepare('SELECT id,account_id,total_minor,agent_id,day_key,created_at FROM fushati_purchases WHERE cafeteria_id=? AND posted=1 AND day_key BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 10000').bind(selected,from,to).all<any>()).results;
   const csv=['id,account_id,total_sar,agent_id,saudi_day,created_at',...rows.map(r=>[r.id,r.account_id,moneySar(r.total_minor),r.agent_id,r.day_key,r.created_at].map((v:unknown)=>'"'+String(v).replace(/"/g,'""')+'"').join(','))].join('\r\n');
   return new Response('\ufeff'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="fushati-sales.csv"','Cache-Control':'private, no-store'}});
  }
  return err('عملية غير متاحة',400);
 }catch(e){return rateError(e);}
}
export async function POST(req:Request){
 const access=await current();if(!access)return err('يرجى تسجيل الدخول',401);
 if(!trustedBrowserOrigin(req,env.KHOTWA_PUBLIC_ORIGINS)||!req.headers.get('content-type')?.startsWith('application/json'))return err('طلب غير مسموح',403);
 try{
  const raw=await req.text();if(raw.length>16000)return err('الطلب أكبر من المسموح',413);
  const {op,data}=bodyModel.parse(JSON.parse(raw));
  if(op==='change-password'){
   if(!['fushati_admin','fushati_agent'].includes(access.role))return err('غير مسموح',403);
   const v=parse(data,z.object({oldPassword:z.string(),newPassword:z.string().min(12).max(128)}));
   const row=await db().prepare('SELECT password_hash FROM fushati_users WHERE id=? AND active=1').bind(access.userId).first<any>();
   if(!row||!await verifyPassword(v.oldPassword,row.password_hash))return err('كلمة المرور الحالية غير صحيحة',403);
   const hash=await hashPassword(v.newPassword);
   await db().prepare('UPDATE fushati_users SET password_hash=?,must_change_password=0,session_version=session_version+1 WHERE id=?').bind(hash,access.userId).run();
   return response({ok:true,requiresLogin:true});
  }
  if(access.role!=='main_admin'&&access.role!=='parent'&&await mustChange(access))return err('غيّر كلمة المرور المؤقتة أولاً',403);
  if(op==='settings'){
   if(access.role!=='parent')return err('ولي الأمر فقط',403);
   const v=parse(data,z.object({cafeteriaId:id,studentId:id,dailyLimit:cash,monthlyLimit:cash,allowedItemIds:z.array(id).max(100),active:flag}));
   const cafe=await db().prepare('SELECT school_id FROM fushati_cafeterias WHERE id=? AND active=1').bind(v.cafeteriaId).first<any>();
   if(!cafe||!await permittedStudent(access.parentPhone,cafe.school_id,v.studentId))return err('طالب غير مرتبط بحسابك',403);
   const daily=moneyMinor(v.dailyLimit),monthly=moneyMinor(v.monthlyLimit);
   if(daily===null||monthly===null||daily>10000||monthly>300000)return err('الحد اليومي أو الشهري غير صحيح',400);
   const ids=[...new Set<string>(v.allowedItemIds)];
   if(ids.length){const rows=(await db().prepare('SELECT id FROM fushati_menu_items WHERE cafeteria_id=? AND active=1').bind(v.cafeteriaId).all<{id:string}>()).results;if(ids.some((a:string)=>!rows.some(r=>r.id===a)))return err('يوجد منتج غير تابع لهذا المقصف',400);}
   const account=await getOrCreateAccount(cafe.school_id,v.cafeteriaId,v.studentId);if(!account)return err('حساب غير متاح',404);
   await db().prepare('UPDATE fushati_accounts SET daily_limit_minor=?,monthly_limit_minor=?,allowed_item_ids=?,active=? WHERE id=?').bind(daily,monthly,JSON.stringify(ids),v.active?1:0,account.id).run();
   await audit(access.userId,'parent-settings','account',account.id);
   return response({ok:true});
  }
  if(op==='purchase'){
   if(!isCafeStaff(access))return err('للمقصف فقط',403);
   const v=parse(data,z.object({requestId:id,token:z.string().min(30).max(350),cafeteriaId:id,items:z.array(z.object({id,quantity:z.number().int().min(1).max(20)})).min(1).max(30)}));
   const decoded=await readQrToken(v.token),cafe=await permittedCafeteria(access,v.cafeteriaId);
   if(!decoded||decoded.cafeteriaId!==v.cafeteriaId||!cafe)return err('رمز الطالب غير صحيح أو ليس لهذا المقصف',403);
   const student=await activeStudent(cafe.school_id,decoded.studentId);if(!student)return err('طالب غير نشط',404);
   const account=await getOrCreateAccount(cafe.school_id,cafe.id,student.id);if(!account||!account.active)return err('حساب فسحتي موقوف',403);
   const ids=v.items.map((item:{id:string})=>item.id);
   if(new Set(ids).size!==ids.length)return err('منتج مكرر في القائمة',400);
   const menu=(await db().prepare('SELECT id,name,price_minor,active,available FROM fushati_menu_items WHERE cafeteria_id=?').bind(cafe.id).all<any>()).results;
   const allowed:string[]=JSON.parse(account.allowed_item_ids||'[]');
   const lines=[] as {id:string;name:string;quantity:number;unitPriceMinor:number;lineTotalMinor:number}[];
   let total=0;
   for(const requested of v.items){const item=menu.find((m:any)=>m.id===requested.id);if(!item||!item.active||!item.available||item.price_minor<=0)return err('أحد المنتجات غير متاح',409);if(allowed.length&&!allowed.includes(item.id))return err('ولي الأمر لا يسمح بهذا المنتج',403);const lineTotal=item.price_minor*requested.quantity;total+=lineTotal;lines.push({id:item.id,name:item.name,quantity:requested.quantity,unitPriceMinor:item.price_minor,lineTotalMinor:lineTotal});}
   if(!Number.isSafeInteger(total)||total<=0||total>100000)return err('مجموع الشراء غير مقبول',400);
   const itemsJson=JSON.stringify(lines),existing=await db().prepare('SELECT * FROM fushati_purchases WHERE id=?').bind(v.requestId).first<any>();
   if(existing){if(existing.account_id!==account.id||existing.cafeteria_id!==cafe.id||existing.total_minor!==total||existing.items_json!==itemsJson)return err('معرف عملية مكرر لطلب مختلف',409);return response({ok:true,purchaseId:v.requestId,totalMinor:existing.total_minor,balanceMinor:(await db().prepare('SELECT balance_minor FROM fushati_accounts WHERE id=?').bind(account.id).first<any>())?.balance_minor||0,duplicate:true});}
   const {day,month}=keyDate(),created=now(),ledgerId=crypto.randomUUID();
   const queries=[
    db().prepare('INSERT INTO fushati_purchases(id,account_id,cafeteria_id,agent_id,items_json,total_minor,day_key,month_key,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(v.requestId,account.id,cafe.id,access.userId,itemsJson,total,day,month,created),
    db().prepare("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,day_key,month_key,created_at) SELECT ?,account_id,-total_minor,'purchase',id,'شراء من المقصف',day_key,month_key,created_at FROM fushati_purchases WHERE id=? AND posted=0 AND account_id=? AND cafeteria_id=? ON CONFLICT(entry_type,reference_id) DO NOTHING").bind(ledgerId,v.requestId,account.id,cafe.id),
    db().prepare("UPDATE fushati_purchases SET posted=1 WHERE id=? AND posted=0 AND EXISTS(SELECT 1 FROM fushati_ledger WHERE reference_id=? AND entry_type='purchase')").bind(v.requestId,v.requestId)
   ];
   const results=await db().batch(queries);
   if(results[2].meta.changes!==1){const prev=await db().prepare('SELECT id FROM fushati_purchases WHERE id=? AND posted=1').bind(v.requestId).first();if(!prev)return err('لم يتم تسجيل العملية',409);}
   const updated=await db().prepare('SELECT balance_minor FROM fushati_accounts WHERE id=?').bind(account.id).first<any>();
   return response({ok:true,purchaseId:v.requestId,totalMinor:total,balanceMinor:updated?.balance_minor||0,duplicate:results[2].meta.changes!==1});
  }
  if(!isCafeAdmin(access)&&!['create-menu'].includes(op))return err('ليس لديك صلاحية الإدارة',403);
  if(op==='create-cafeteria'){
   if(!isCafeAdmin(access))return err('للمدير فقط',403);
   const v=parse(data,z.object({schoolId, name,bankName:z.string().trim().max(130),iban:z.string().trim().max(34),beneficiary:z.string().trim().max(130)}));
   const school=await db().prepare("SELECT id FROM khotwa_schools WHERE id=? AND active=1 AND id<>'default'").bind(v.schoolId).first();if(!school)return err('اختر مدرسة موجودة',400);
   if(v.iban&&!/^SA\d{2}[A-Z0-9]{20}$/.test(v.iban))return err('رقم IBAN يجب أن يبدأ بـ SA ويتكون من 24 خانة',400);
   const cafeId=crypto.randomUUID();
   await db().prepare('INSERT INTO fushati_cafeterias(id,school_id,name,bank_name,iban,beneficiary,created_at) VALUES(?,?,?,?,?,?,?)').bind(cafeId,v.schoolId,v.name,v.bankName,v.iban,v.beneficiary,now()).run();
   await audit(access.userId,op,'cafeteria',cafeId);return response({ok:true,id:cafeId});
  }
  if(op==='delete-cafeteria'){
   const v=parse(data,z.object({id}));
   const cafe=await db().prepare('SELECT id FROM fushati_cafeterias WHERE id=?').bind(v.id).first();if(!cafe)return err('المقصف غير موجود',404);
   const history=await db().prepare('SELECT 1 FROM fushati_transfers WHERE cafeteria_id=? LIMIT 1').bind(v.id).first() || await db().prepare('SELECT 1 FROM fushati_purchases WHERE cafeteria_id=? LIMIT 1').bind(v.id).first();
   if(history)return err('المقصف يحتوي على سجلات مالية. أوقفه بدلاً من حذفه حفاظاً على معاملات أولياء الأمور.',409);
   await db().batch([
    db().prepare('DELETE FROM fushati_accounts WHERE cafeteria_id=?').bind(v.id),
    db().prepare('DELETE FROM fushati_menu_items WHERE cafeteria_id=?').bind(v.id),
    db().prepare('DELETE FROM fushati_assignments WHERE cafeteria_id=?').bind(v.id),
    db().prepare('DELETE FROM fushati_cafeterias WHERE id=?').bind(v.id)
   ]);
   await audit(access.userId,op,'cafeteria',v.id);return response({ok:true});
  }
  if(op==='edit-cafeteria'||op==='deactivate-cafeteria'){
   const v=parse(data,z.object({id, name:name.optional(),bankName:z.string().trim().max(130).optional(),iban:z.string().trim().max(34).optional(),beneficiary:z.string().trim().max(130).optional(),active:flag.optional()}));
   const cafe=await db().prepare('SELECT * FROM fushati_cafeterias WHERE id=?').bind(v.id).first<any>();if(!cafe)return err('المقصف غير موجود',404);
   if(op==='edit-cafeteria'){
    const iban=v.iban??cafe.iban;if(iban&&!/^SA\d{2}[A-Z0-9]{20}$/.test(iban))return err('رقم IBAN غير صالح',400);
    await db().prepare('UPDATE fushati_cafeterias SET name=?,bank_name=?,iban=?,beneficiary=?,active=? WHERE id=?').bind(v.name??cafe.name,v.bankName??cafe.bank_name,iban,v.beneficiary??cafe.beneficiary,v.active===undefined?cafe.active:v.active?1:0,v.id).run();
   }else await db().prepare('UPDATE fushati_cafeterias SET active=0 WHERE id=?').bind(v.id).run();
   await audit(access.userId,op,'cafeteria',v.id);return response({ok:true});
  }
  if(op==='create-user'){
   const v=parse(data,z.object({fullName:name,email,role:z.enum(['fushati_admin','fushati_agent']),cafeteriaIds:z.array(id).max(100)}));
   if(v.role==='fushati_admin'&&access.role!=='main_admin')return err('إنشاء مدير فسحتي لمدير نظام خطوة فقط',403);
   if(v.role==='fushati_agent'&&!v.cafeteriaIds.length)return err('يجب تحديد مقصف للموظف',400);
   const cafes=await cafesFor(access);if(v.cafeteriaIds.some((a:string)=>!cafes.some(c=>c.id===a&&c.active)))return err('أحد المقاصف غير متاح',403);
   const password=temporaryPassword(),hash=await hashPassword(password),userId=crypto.randomUUID();
   await db().batch([db().prepare('INSERT INTO fushati_users(id,email,full_name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)').bind(userId,v.email,v.fullName,v.role,hash,now()),...v.cafeteriaIds.map((c:string)=>db().prepare('INSERT INTO fushati_assignments(user_id,cafeteria_id) VALUES(?,?)').bind(userId,c))]);
   await audit(access.userId,op,'user',userId);return response({ok:true,id:userId,temporaryPassword:password});
  }
  if(op==='delete-user'){
   const v=parse(data,z.object({id}));
   const row=await db().prepare('SELECT role FROM fushati_users WHERE id=?').bind(v.id).first<any>();if(!row)return err('المستخدم غير موجود',404);
   if(row.role==='fushati_admin'&&access.role!=='main_admin')return err('للمدير العام فقط',403);
   const history=await db().prepare('SELECT 1 FROM fushati_purchases WHERE agent_id=? LIMIT 1').bind(v.id).first()
    || await db().prepare('SELECT 1 FROM fushati_menu_items WHERE created_by=? LIMIT 1').bind(v.id).first()
    || await db().prepare('SELECT 1 FROM fushati_transfers WHERE reviewed_by=? LIMIT 1').bind(v.id).first();
   if(history)return err('الحساب مرتبط بسجلات مالية أو قوائم سابقة. أوقف الحساب للمحافظة على سجل التدقيق.',409);
   await db().batch([db().prepare('DELETE FROM fushati_assignments WHERE user_id=?').bind(v.id),db().prepare('DELETE FROM fushati_users WHERE id=?').bind(v.id)]);
   await audit(access.userId,op,'user',v.id);return response({ok:true});
  }
  if(op==='edit-user'||op==='reset-user'){
   const v=parse(data,z.object({id,fullName:name.optional(),active:flag.optional(),cafeteriaIds:z.array(id).max(100).optional()}));
   const row=await db().prepare('SELECT * FROM fushati_users WHERE id=?').bind(v.id).first<any>();if(!row)return err('المستخدم غير موجود',404);
   if(row.role==='fushati_admin'&&access.role!=='main_admin')return err('لا يمكن تعديل مدير فسحتي',403);
   if(op==='reset-user'){
    const password=temporaryPassword();await db().prepare('UPDATE fushati_users SET password_hash=?,must_change_password=1,session_version=session_version+1 WHERE id=?').bind(await hashPassword(password),v.id).run();
    await audit(access.userId,op,'user',v.id);return response({ok:true,temporaryPassword:password});
   }
   if(v.cafeteriaIds){const cafes=await cafesFor(access);if(v.cafeteriaIds.some((c:string)=>!cafes.some(x=>x.id===c&&x.active)))return err('لا يمكنك تعيين موظف لمقصف غير متاح',403);}
   await db().batch([
    db().prepare('UPDATE fushati_users SET full_name=?,active=?,session_version=session_version+1 WHERE id=?').bind(v.fullName??row.full_name,v.active===undefined?row.active:v.active?1:0,v.id),
    ...(v.cafeteriaIds?[db().prepare('DELETE FROM fushati_assignments WHERE user_id=?').bind(v.id),...v.cafeteriaIds.map((c:string)=>db().prepare('INSERT INTO fushati_assignments(user_id,cafeteria_id) VALUES(?,?)').bind(v.id,c))]:[])
   ]);
   await audit(access.userId,op,'user',v.id);return response({ok:true});
  }
  if(op==='create-menu'){
   if(!isCafeStaff(access))return err('غير مسموح',403);
   const v=parse(data,z.object({cafeteriaId:id,name,category:z.string().trim().min(1).max(70),price:cash.optional()}));
   const cafe=await permittedCafeteria(access,v.cafeteriaId);if(!cafe)return err('المقصف غير متاح',403);
   const price=isCafeAdmin(access)?moneyMinor(v.price??'0'):0;
   if(price===null||price>1000000)return err('السعر غير صحيح',400);
   const newId=crypto.randomUUID();await db().prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(newId,cafe.id,v.name,v.category,price,isCafeAdmin(access)&&price>0?1:0,1,access.userId,now()).run();
   await audit(access.userId,op,'menu',newId);return response({ok:true,id:newId,pending:!isCafeAdmin(access)});
  }
  if(op==='delete-menu'){
   const v=parse(data,z.object({id}));
   const item=await db().prepare('SELECT id,cafeteria_id FROM fushati_menu_items WHERE id=?').bind(v.id).first<any>();if(!item)return err('المنتج غير موجود',404);
   const history=await db().prepare("SELECT 1 FROM fushati_purchases p,json_each(p.items_json) line WHERE p.cafeteria_id=? AND json_extract(line.value,'$.id')=? LIMIT 1").bind(item.cafeteria_id,v.id).first();
   if(history)return err('المنتج مستخدم في مشتريات تاريخية. أوقفه بدلاً من الحذف.',409);
   await db().prepare('DELETE FROM fushati_menu_items WHERE id=?').bind(v.id).run();
   await audit(access.userId,op,'menu',v.id);return response({ok:true});
  }
  if(op==='edit-menu'){
   const v=parse(data,z.object({id,name,category:z.string().trim().min(1).max(70),price:cash,active:flag,available:flag}));
   const price=moneyMinor(v.price);if(price===null||price>1000000||v.active&&price===0)return err('حدد سعراً صحيحاً قبل تفعيل المنتج',400);
   const row=await db().prepare('SELECT id FROM fushati_menu_items WHERE id=?').bind(v.id).first();if(!row)return err('المنتج غير موجود',404);
   await db().prepare('UPDATE fushati_menu_items SET name=?,category=?,price_minor=?,active=?,available=? WHERE id=?').bind(v.name,v.category,price,v.active?1:0,v.available?1:0,v.id).run();
   await audit(access.userId,op,'menu',v.id);return response({ok:true});
  }
  if(op==='review-transfer'){
   const v=parse(data,z.object({id,status:z.enum(['approved','rejected']),note:z.string().max(500).default('')}));
   const tr=await db().prepare('SELECT t.*,a.school_id FROM fushati_transfers t JOIN fushati_accounts a ON a.id=t.account_id WHERE t.id=?').bind(v.id).first<any>();
   if(!tr)return err('الحوالة غير موجودة',404);
   const cafe=await permittedCafeteria(access,tr.cafeteria_id,true);if(!cafe)return err('المقصف غير مصرح',403);
   const reviewed=now();
   const result=await db().batch([
    db().prepare("UPDATE fushati_transfers SET status=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='pending'").bind(v.status,v.note,access.userId,reviewed,v.id),
    db().prepare("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,created_at) SELECT ?,account_id,amount_minor,'transfer',id,'شحن رصيد بعد التحقق البنكي',? FROM fushati_transfers WHERE id=? AND status='approved' ON CONFLICT(entry_type,reference_id) DO NOTHING").bind(crypto.randomUUID(),reviewed,v.id)
   ]);
   if(result[0].meta.changes!==1)return err('الحوالة تمت مراجعتها سابقاً',409);
   await audit(access.userId,'review-transfer','transfer',v.id,v.status);
   return response({ok:true});
  }
  return err('عملية غير معروفة',400);
 }catch(e){return rateError(e);}
}
