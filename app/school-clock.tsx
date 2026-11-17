'use client';
import {useLocale,UiText} from './locale';

import {useEffect,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {schoolClock,schoolClockHands} from '../lib/school-clock';
export default function SchoolClock(){const {ui,language}=useLocale();
 const [now,setNow]=useState<Date|null>(null);
 useEffect(()=>{
  const refresh=()=>setNow(new Date());refresh();
  const timer=window.setInterval(refresh,1000);
  const onVisible=()=>{if(document.visibilityState==='visible')refresh();};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',onVisible);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',onVisible);};
 },[]);
 const value=now?schoolClock(now,language):null;
 const hands=now?schoolClockHands(now):null;
 return <section className="school-clock no-print" aria-label={ui("التاريخ والوقت بتوقيت السعودية")}>
  <div className="school-clock-hijri"><CalendarDays size={21} aria-hidden="true"/><div><span><UiText text={"التاريخ الهجري • تقويم أم القرى"}/></span><strong>{value?.hijri||ui('جارٍ تحميل التاريخ…')}</strong></div></div>
  <div className="school-clock-gregorian"><span><UiText text={"التاريخ الميلادي"}/></span><time dateTime={now?.toISOString()}>{value?.gregorian||'—'}</time></div>
  <div className="school-clock-time"><div className="luxury-clock-face" aria-hidden="true"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" className="luxury-clock-ring"/>{Array.from({length:12},(_,i)=><line key={i} x1="50" y1={i%3===0?'9':'11'} x2="50" y2={i%3===0?'17':'15'} transform={'rotate('+i*30+' 50 50)'} className={i%3===0?'clock-mark major':'clock-mark'}/>)}<text x="50" y="28" textAnchor="middle" className="clock-signature"><UiText text={"خطوة"}/></text>{hands&&<><line x1="50" y1="52" x2="50" y2="30" transform={'rotate('+hands.hour+' 50 50)'} className="clock-hand hour-hand"/><line x1="50" y1="55" x2="50" y2="20" transform={'rotate('+hands.minute+' 50 50)'} className="clock-hand minute-hand"/><line x1="50" y1="60" x2="50" y2="17" transform={'rotate('+hands.second+' 50 50)'} className="clock-hand second-hand"/><circle cx="50" cy="50" r="3" className="clock-hand-pin"/></>}</svg></div><div><span><UiText text={"الوقت • توقيت السعودية"}/></span><time dateTime={now?.toISOString()} dir={language==='en'?'ltr':'rtl'}>{value?.time||'—'}</time></div></div>
 </section>;
}
