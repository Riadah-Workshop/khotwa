'use client';
import {useLocale,UiText} from './locale';

import {useRef,useState} from 'react';
import {MessageCircle,Printer,X,Copy} from 'lucide-react';
import SchoolIdentity from './school-identity';
import {PROGRAM_OWNER_CREDIT} from '../lib/brand';
import {openWhatsappMessage} from '../lib/whatsapp';
import type {Visit} from './visitors-panel';
import {SheetBack} from './ui/sheet';

const SUGGESTIONS:Record<string,[string,string]>={
 'سؤال عن طالب':['متابعة ما تمت مناقشته عن الطالب والتواصل مع وكيل شؤون الطلاب عند الحاجة.','متابعة التوصية المتفق عليها مع المدرسة.'],
 'تسجيل طالب':['مراجعة إدارة المدرسة لمعرفة إجراءات التسجيل والمستندات المطلوبة.','تجهيز المستندات التي تحددها المدرسة واستكمال الطلب.'],
 'استئذان طالب':['اتباع إجراءات الاستئذان والتحقق من هوية المستلم قبل خروج الطالب.','مراجعة مسؤول الاستئذان واستلام إذن الخروج المعتمد.'],
 'خلل في منصة مدرستي أو نور':['توضيح المشكلة لمسؤول المنصة بالمدرسة، مع إرفاق صورة للخطأ عند الحاجة دون مشاركة كلمة المرور أو رمز التحقق.','تجهيز وصف للمشكلة واتباع تعليمات مسؤول المنصة.'],
 'استدعاء إدارة المدرسة':['الالتزام بما اتُّفق عليه في المقابلة والتواصل مع إدارة المدرسة عند الحاجة.','تنفيذ الإجراء المتفق عليه ومراجعة المدرسة في الموعد المحدد.'],
 'متابعة مستوى الطالب':['التعاون مع المدرسة في متابعة مستوى الطالب وتشجيعه على الانتظام وإنجاز المهام.','متابعة التوصيات التعليمية المتفق عليها مع المدرسة.'],
 'مقابلة معلم':['متابعة توصيات المعلم المتعلقة بتعلم الطالب والتواصل عبر القنوات المعتمدة.','تطبيق التوصيات المتفق عليها مع المعلم.'],
};
const DEFAULT:[string,string]=['متابعة التوصية المتفق عليها أثناء الزيارة.','تنفيذ الخطوة المتفق عليها مع المدرسة.'];
const formattedDate=(v:string,language:'ar'|'en'='ar')=>v?new Intl.DateTimeFormat(language==='en'?'en-GB':'ar-SA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',calendar:'gregory'}).format(new Date(v+'T12:00:00+03:00')):'';

export default function VisitorGuidance({visit,school,printing,onPrint,onClose}:{visit:Visit;school:string;printing:boolean;onPrint:()=>void;onClose:()=>void}){const {ui,language}=useLocale();
 const initial=SUGGESTIONS[visit.reason]||DEFAULT;
 const [recommendation,setRecommendation]=useState(initial[0]);
 const [action,setAction]=useState(initial[1]);
 const [followDate,setFollowDate]=useState('');
 const [messageReady,setMessageReady]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const copyField=useRef<HTMLTextAreaElement>(null);
 const [recipientPhone,setRecipientPhone]=useState(visit.phone);
 const [issuedAt]=useState(()=>new Date().toISOString());
 const title=visit.hasChild?'بطاقة إرشاد ولي الأمر':'بطاقة إرشاد الزائر';
 const issued=new Intl.DateTimeFormat(language==='en'?'en-GB':'ar-SA',{timeZone:'Asia/Riyadh',dateStyle:'short',calendar:'gregory'}).format(new Date(issuedAt));
 const phone=recipientPhone.replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[^0-9]/g,'').replace(/^00966/,'966').replace(/^05/,'9665');
 const validPhone=/^9665\d{8}$/.test(phone);
 const valid=!!recommendation.trim()&&!!action.trim();
 const message=[school,title,'الزائر / ولي الأمر: '+visit.name,...(visit.hasChild?['الابن: '+visit.childName,...(visit.childClass?['الصف: '+visit.childClass]:[])]:[]),'سبب الزيارة: '+visit.reason,'تاريخ البطاقة: '+issued,'التوصية: '+recommendation.trim(),'المطلوب: '+action.trim(),...(followDate?['موعد المتابعة: '+formattedDate(followDate,language)]:[]),PROGRAM_OWNER_CREDIT].join('\n');
 return <>
  <div className="modal-backdrop no-print"><section className="modal guidance-editor" role="dialog" aria-modal="true" aria-labelledby="guidance-title"><SheetBack onClick={onClose}/>
   <h2 id="guidance-title">{ui(title)}</h2>
   <div className="guidance-actions"><button className="primary" disabled={!valid} onClick={onPrint}><Printer size={20}/> <UiText text={" طباعة / حفظ PDF"}/></button><button className="guidance-whatsapp" disabled={!valid||!validPhone} onClick={()=>{openWhatsappMessage(phone,message);setMessageReady(true);}}><MessageCircle size={20}/> <UiText text={" فتح واتساب بالبطاقة"}/></button><button className="ghost guidance-close" onClick={onClose} aria-label={ui("إغلاق بطاقة الإرشاد")}><X size={20}/></button></div>
   <p className="small muted"><UiText text={"زر واتساب يجهّز الرسالة؛ تُتم الإرسال يدويًا داخل واتساب."}/></p>
   <p><b>{visit.name}</b> • {visit.reason}</p>
   <label className="field"><UiText text={"جوال استلام البطاقة"}/><input type="tel" inputMode="tel" dir="ltr" maxLength={20} value={recipientPhone} onChange={e=>{setRecipientPhone(e.target.value);setMessageReady(false);}}/></label>
   {visit.hasChild===1&&<p className="small"><UiText text={"الابن: "}/>{visit.childName} {visit.childClass&&'• الصف: '+visit.childClass}</p>}
   <label className="field"><UiText text={"توصية جاهزة"}/><select defaultValue={SUGGESTIONS[visit.reason]?visit.reason:'أخرى'} onChange={e=>{const s=SUGGESTIONS[e.target.value]||DEFAULT;setRecommendation(s[0]);setAction(s[1]);setMessageReady(false);}}>{Object.keys(SUGGESTIONS).map(r=><option key={r} value={r}>{ui(r)}</option>)}<option value="أخرى"><UiText text={"أخرى"}/></option></select></label>
   <label className="field"><UiText text={"التوصية"}/><textarea required maxLength={1500} value={recommendation} onChange={e=>{setRecommendation(e.target.value);setMessageReady(false);}}/></label>
   <label className="field"><UiText text={"المطلوب من ولي الأمر / الزائر"}/><textarea required maxLength={1000} value={action} onChange={e=>{setAction(e.target.value);setMessageReady(false);}}/></label>
   <label className="field"><UiText text={"موعد المتابعة — اختياري"}/><input type="date" value={followDate} onChange={e=>{setFollowDate(e.target.value);setMessageReady(false);}}/></label>
   <details className="guidance-message"><summary><UiText text={"معاينة الرسالة / نسخ اختياري"}/></summary><label className="field guidance-copy"><UiText text={"نص الرسالة"}/><textarea ref={copyField} readOnly rows={6} value={message}/></label>
   <button className="secondary" disabled={!valid} onClick={async()=>{try{await navigator.clipboard.writeText(message);setCopyStatus('تم نسخ الرسالة. افتح محادثة الزائر في واتساب والصقها ثم أرسلها.');}catch{copyField.current?.focus();copyField.current?.select();setCopyStatus('اضغط مطولًا على النص المحدد واختر نسخ، ثم الصقه في محادثة واتساب.');}}}><Copy size={18}/> <UiText text={" نسخ الرسالة"}/></button>
   {copyStatus&&<p className="small" role="status">{ui(copyStatus)}</p>}</details>
   <p className="small muted"><UiText text={"راجع البطاقة ورقم الجوال قبل الطباعة أو تجهيز الرسالة. تُتم الإرسال بنفسك في واتساب."}/></p>
   {!validPhone&&<p className="small"><UiText text={"أدخل رقم جوال سعودي صحيح لتفعيل زر واتساب، مثل 05xxxxxxxx."}/></p>}

   {messageReady&&<p className="small muted" role="status"><UiText text={"تُجهّز البطاقة في محادثة الزائر مباشرة، ثم تضغط إرسال داخل واتساب."}/></p>}
  </section></div>
  {printing&&<section className="visitor-guidance-sheet visitor-print-target"><SchoolIdentity school={school}/><h1>{ui(title)}</h1><dl className="guidance-meta"><dt><UiText text={"الزائر / ولي الأمر"}/></dt><dd>{visit.name}</dd>{visit.hasChild===1&&<><dt><UiText text={"اسم الابن"}/></dt><dd>{visit.childName}</dd>{visit.childClass&&<><dt><UiText text={"الصف"}/></dt><dd>{visit.childClass}</dd></>}</>}<dt><UiText text={"سبب الزيارة"}/></dt><dd>{visit.reason}</dd><dt><UiText text={"تاريخ البطاقة"}/></dt><dd>{issued}</dd></dl><h2><UiText text={"التوصية"}/></h2><p>{recommendation.trim()}</p><h2><UiText text={"المطلوب من ولي الأمر / الزائر"}/></h2><p>{action.trim()}</p>{followDate&&<><h2><UiText text={"موعد المتابعة"}/></h2><p>{formattedDate(followDate)}</p></>}<footer><b>{PROGRAM_OWNER_CREDIT}</b><small><UiText text={"خطوة • بطاقة إرشاد مرتبطة بالزيارة"}/></small></footer></section>}
 </>;
}
