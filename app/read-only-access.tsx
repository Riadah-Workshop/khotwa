'use client';
import {useLocale,UiText} from './locale';

import {useState, type ReactNode} from 'react';
import {READ_ONLY_MESSAGE} from '../lib/access-policy';

// This boundary explains unavailable actions. Authorization is enforced by each
// write API independently, including requests made outside this UI.
export default function ReadOnlyAccess({readOnly,children}:{readOnly:boolean;children:ReactNode}){const {ui,language}=useLocale();
 const [notice,setNotice]=useState('');
 if(!readOnly)return <>{children}</>;
 const stop=(event:{preventDefault:()=>void;stopPropagation:()=>void})=>{
  event.preventDefault();event.stopPropagation();setNotice(READ_ONLY_MESSAGE);
 };
 return <div data-access-mode="read-only" onSubmitCapture={stop} onChangeCapture={event=>{
  if(event.target instanceof HTMLInputElement&&event.target.type==='file'){
   event.target.value='';stop(event);
  }
 }} onClickCapture={event=>{
  if(!(event.target instanceof Element))return;
  const control=event.target.closest('button,a,label');
  if(!control||control.closest('nav,aside,[role="navigation"]'))return;
  const text=control.textContent||control.getAttribute('aria-label')||'';
  const href=control.getAttribute('href')||'';
  if(/\b(?:save|delete|edit|add student|import|restore|submit|record|confirm|send|activate|disable|password|open whatsapp)\b|حفظ|حذف|تعديل|إضافة طالب|استيراد|استعادة|اعتماد|توثيق|تأكيد الإرسال|أرسلت|فتح واتساب|إشعار واتساب|إرسال|تفعيل|تعطيل|إيقاف الدخول|كلمة مرور|تحديث قوائم/.test(text.toLowerCase())||/wa\.me|api\.whatsapp\.com|^whatsapp:/.test(href))stop(event);
 }}>
  <div className="viewer-access-banner no-print" role="status"><strong><UiText text={"صلاحية مشاهدة فقط"}/></strong><span><UiText text={"يمكنك التنقل والبحث والاطلاع على الأقسام والتقارير. الإضافة والتعديل والحذف غير متاحة لهذا الحساب."}/></span>{notice&&<span role="alert">{ui(notice)}</span>}</div>
  {children}
 </div>;
}
