'use client';
import {useLocale,UiText} from './locale';

import {BusFront,Home,GraduationCap,CalendarCheck2,ClipboardList,MessagesSquare,ChartColumn,Search,ArrowUpLeft,LayoutGrid,Star,X} from 'lucide-react';
import {WORKSPACE_GROUPS} from '../lib/navigation';
import {useState} from 'react';
import {searchServices,serviceById,SERVICE_CATALOG,type ServiceId} from '../lib/service-catalog';
import type {useWorkspacePreferences} from './use-workspace-preferences';
import TextSizeControl from './text-size-control';
const icons={home:Home,students:GraduationCap,attendance:CalendarCheck2,cases:ClipboardList,communication:MessagesSquare,activities:BusFront,reports:ChartColumn};
export default function ServicesHub({onNavigate,messageCount,visitorCount,followCount,preferences}:{onNavigate:(page:string)=>void;messageCount:number;visitorCount:number;followCount:number;preferences:ReturnType<typeof useWorkspacePreferences>}){const {ui,language}=useLocale();
 const [query,setQuery]=useState('');const [editing,setEditing]=useState(false);
 const {favorites,recent,textSize}=preferences.value;
 const results=query.trim()?searchServices(query,language):[];
 function open(id:string){setQuery('');onNavigate(id);}
 function star(id:ServiceId){preferences.toggleFavorite(id);}
 return <section className="services-hub" aria-label={ui("جميع أقسام خطوة")}>
  <div className="services-hub-intro"><span><UiText text={"كل أعمالك في مكان واحد"}/></span><h2><UiText text={"بماذا نبدأ اليوم؟"}/></h2><p><UiText text={"ابحث عن خدمة أو افتح اختصارك المفضل."}/></p>
   <div className="hub-service-search" data-tour="agent-search"><Search size={20} aria-hidden="true"/><input type="search" aria-label={ui("البحث عن خدمة")} placeholder={ui("ابحث عن خدمة: غياب، استئذان، تقارير…")} value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label={ui("مسح البحث")} onClick={()=>setQuery('')}><X size={18}/></button>}</div>
  </div>
  {query.trim()?<section className="service-search-results" aria-label={ui("نتائج البحث عن الخدمات")}><div className="hub-category-heading"><h3><UiText text={"نتائج البحث"}/></h3><span role="status">{results.length} <UiText text={" خدمة"}/></span></div>{results.length?results.map(service=><div className="service-result" key={service.id}><button type="button" onClick={()=>open(service.id)}><span><strong>{ui(service.label)}</strong>{service.id==='case'&&<small><UiText text={"اختر نوع الحالة داخل النموذج: تأخر، استئذان، مخالفة، سلوك أو تواصل."}/></small>}</span><ArrowUpLeft size={18}/></button><button type="button" className={'favorite-star '+(favorites.includes(service.id)?'selected':'')} disabled={!preferences.ready||!favorites.includes(service.id)&&favorites.length>=4} title={!favorites.includes(service.id)&&favorites.length>=4?ui('ألغِ تثبيت إحدى الخدمات أولًا'):undefined} aria-label={(favorites.includes(service.id)?(language==='en'?'Unpin ':'إلغاء تثبيت '):(language==='en'?'Pin ':'تثبيت '))+ui(service.label)} aria-pressed={favorites.includes(service.id)} onClick={()=>star(service.id)}><Star size={19}/></button></div>):<p className="hub-empty" role="status"><UiText text={"لم نجد خدمة مطابقة. جرّب اسمًا مختصرًا مثل «غياب» أو «رسائل»."}/></p>}<p className="hub-preference-note"><UiText text={"يمكن تثبيت ٤ خدمات في المفضلة."}/></p></section>:<>
   <section className="favorite-services" data-tour="agent-favorites" aria-label={ui("خدماتي المفضلة")}><div className="hub-category-heading"><h3><UiText text={"خدماتي المفضلة"}/></h3><button type="button" className="hub-customize" aria-expanded={editing} onClick={()=>setEditing(!editing)}>{editing?ui("إغلاق التخصيص"):ui("تخصيص")}</button></div>
    {favorites.length?<div className="favorite-grid">{favorites.map(id=>{const service=serviceById(id)!;return <button type="button" key={id} onClick={()=>open(id)}><Star size={16} aria-hidden="true"/><span>{ui(service.label)}</span><ArrowUpLeft size={16} aria-hidden="true"/></button>;})}</div>:<p className="hub-empty"><UiText text={"اختر خدماتك من «تخصيص» أو ثبّتها من نتائج البحث."}/></p>}
    {editing&&<div className="favorite-editor"><p><UiText text={"اختر حتى ٤ خدمات. لإضافة خدمة أخرى عند اكتمال العدد، ألغِ تثبيت إحدى الخدمات أولًا."}/></p><div>{SERVICE_CATALOG.map(service=><button type="button" key={service.id} className={favorites.includes(service.id)?'selected':''} disabled={!preferences.ready||!favorites.includes(service.id)&&favorites.length>=4} aria-pressed={favorites.includes(service.id)} onClick={()=>star(service.id)}><Star size={15}/>{ui(service.label)}</button>)}</div></div>}
   </section>
   {recent.length>0&&<section className="recent-services" aria-label={ui("آخر الخدمات المستخدمة")}><span><UiText text={"آخر استخدام"}/></span><div>{recent.map(id=><button type="button" key={id} onClick={()=>open(id)}>{ui(serviceById(id)!.label)}</button>)}</div></section>}
   {(messageCount+visitorCount+followCount)>0&&<button type="button" className="hub-attention" onClick={()=>open('desk')}><span><strong><UiText text={"بحاجة إلى متابعة"}/></strong><small>{messageCount} <UiText text={" رسالة جديدة • "}/>{visitorCount} <UiText text={" زائر منتظر • "}/>{followCount} <UiText text={" حالة قيد المتابعة"}/></small></span><span><UiText text={"مساعد الوكيل "}/><ArrowUpLeft size={17}/></span></button>}
   <div className="hub-category-heading"><h3><UiText text={"أقسام خطوة"}/></h3><span><UiText text={"٨ أقسام متكاملة"}/></span></div><div className="service-category-grid" data-tour="agent-categories">{WORKSPACE_GROUPS.map(group=>{const Icon=icons[group.id];const count=group.id==='communication'?messageCount+visitorCount:group.id==='cases'?followCount:0;return <button type="button" key={group.id} className={'service-category category-'+group.id} onClick={()=>open(group.defaultPage)}><span className="service-category-circle"><Icon size={34} strokeWidth={1.65} aria-hidden="true"/>{count>0&&<span className="category-count" aria-label={group.id==='communication'?ui('رسائل جديدة وزوار منتظرون'):ui('حالات قيد المتابعة')}>{count}</span>}</span><strong>{ui(group.label)}</strong><small>{ui(group.description)}</small></button>;})}</div>
  </>}
  <TextSizeControl value={textSize} onChange={preferences.setTextSize}/>
  <p className="hub-preference-note"><UiText text={"تفضيلاتك محفوظة لهذا الحساب على هذا الجهاز."}/></p>{preferences.storageError&&<p className="hub-preference-note" role="status">{ui(preferences.storageError)}</p>}
 </section>;
}

const bottomItems=[{page:'home',label:'الرئيسية',Icon:Home,group:'home'},{page:'services',label:'الأقسام',Icon:LayoutGrid,group:'services'},{page:'search',label:'الطلاب',Icon:GraduationCap,group:'students'},{page:'messages',label:'التواصل',Icon:MessagesSquare,group:'communication'},{page:'reports',label:'التقارير',Icon:ChartColumn,group:'reports'}];
export function MobileNavigation({tab,group,onNavigate}:{tab:string;group?:string;onNavigate:(page:string)=>void}){const {ui,language}=useLocale();
 return <nav className="mobile-bottom-nav no-print" aria-label={ui("التنقل السريع")}>{bottomItems.map(({page,label,Icon,group:itemGroup})=>{const selected=tab==='services'?page==='services':group===itemGroup||page==='services'&&(group==='attendance'||group==='cases');return <button type="button" key={page} className={selected?'selected':''} aria-current={selected?'page':undefined} onClick={()=>onNavigate(page)}><Icon size={24} strokeWidth={selected?2.2:1.7} aria-hidden="true"/><span>{ui(String(label))}</span></button>;})}</nav>;
}
