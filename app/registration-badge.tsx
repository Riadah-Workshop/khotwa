"use client";
import {useRef} from 'react';
import {BadgeCheck,ArrowUpLeft,FileText,Download,X} from 'lucide-react';
import {useLocale} from './locale';
import {PROGRAM_OWNER} from '../lib/brand';
import {REGISTRATION} from '../lib/registration';

export default function RegistrationBadge(){
 const dialog=useRef<HTMLDialogElement>(null);
 const {language}=useLocale();
 const en=language==='en';
 const text=(ar:string,english:string)=>en?english:ar;
 return <div className="ip-registration no-print">
  <button type="button" className="ip-badge" aria-haspopup="dialog" onClick={()=>dialog.current?.showModal()}>
   <span className="ip-badge-seal"><BadgeCheck size={27} strokeWidth={1.5}/></span>
   <span className="ip-badge-copy"><strong>{text('مصنّف مسجّل','Registered work')}</strong><small>{text(REGISTRATION.authority,'Saudi Authority for Intellectual Property')}</small></span>
   <span className="ip-badge-number" dir="ltr">{REGISTRATION.number}</span>
   <ArrowUpLeft className="ip-badge-arrow" size={17}/>
  </button>
  <dialog ref={dialog} className="ip-dialog" aria-labelledby="ip-title" dir={en?'ltr':'rtl'} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
   <div className="ip-dialog-inner">
    <button type="button" className="ip-close" aria-label={text('إغلاق','Close')} onClick={()=>dialog.current?.close()} autoFocus><X size={22}/></button>
    <header className="ip-hero">
     <span className="ip-hero-seal"><BadgeCheck size={42} strokeWidth={1.3}/></span>
     <p>{text('بيانات التطوير والتسجيل','Development and registration')}</p>
     <h2 id="ip-title">{text('خطوة','Khotwa')}</h2>
     <span>{text('شهادة تسجيل مصنّف','Certificate of work registration')}</span>
    </header>
    <div className="ip-body">
     <p className="ip-intro">{text('مصنّف مسجّل لدى الهيئة السعودية للملكية الفكرية','A work registered with the Saudi Authority for Intellectual Property')}</p>
     <div className="ip-registration-number"><span>{text('رقم التسجيل','Registration number')}</span><strong dir="ltr">{REGISTRATION.number}</strong></div>
     <dl className="ip-facts">
      <div><dt>{text('عنوان المصنّف','Registered title')}</dt><dd dir="rtl">{REGISTRATION.title}</dd></div>
      <div><dt>{text('الجهة المطورة','Developed by')}</dt><dd dir="rtl">{en?'Khotwa School Management System Team':PROGRAM_OWNER}</dd></div>
      <div><dt>{text('تاريخ التسجيل الهجري','Hijri registration date')}</dt><dd><bdi>{REGISTRATION.hijriDate}</bdi> {text('هـ','AH')}</dd></div>
      <div><dt>{text('تاريخ التسجيل الميلادي','Gregorian registration date')}</dt><dd><bdi>{REGISTRATION.date}</bdi></dd></div>
      <div className="ip-facts-wide"><dt>{text('نوع المصنّف','Work category')}</dt><dd>{text(REGISTRATION.type,'Computer software and applications')}</dd></div>
     </dl>
     <details className="ip-certificate"><summary><FileText size={19}/>{text('عرض الشهادة','View certificate')}</summary><a href="/khotwa-registration.pdf" target="_blank" rel="noopener noreferrer" aria-label={text('فتح الشهادة الأصلية','Open original certificate')}><img src="/khotwa-registration.png" width={1001} height={1500} loading="lazy" alt={text('صورة شهادة تسجيل مصنف خطوة الأصلية','Original Khotwa work-registration certificate')}/></a></details>
     <a className="ip-download" href="/khotwa-registration.pdf" target="_blank" rel="noopener noreferrer" download="Khotwa-registration.pdf"><Download size={18}/>{text('تنزيل الشهادة الأصلية PDF','Download original certificate PDF')}</a>
     <p className="ip-rights">{text('تطوير فريق نظام خطوة لإدارة المدارس','Developed by the Khotwa School Management System Team')}</p>
    </div>
   </div>
  </dialog>
 </div>;
}
