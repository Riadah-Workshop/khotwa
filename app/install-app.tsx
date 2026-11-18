'use client';
import {useLocale,UiText} from './locale';

import {useEffect,useState} from 'react';
import {Smartphone,Download} from 'lucide-react';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

export default function InstallApp(){const {ui,language}=useLocale();
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: standalone)');
  const update=()=>setInstalled(mode.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));
  const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt)};
  const complete=()=>{setInstalled(true);setPrompt(null)};
  update();mode.addEventListener('change',update);window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',complete);
  return()=>{mode.removeEventListener('change',update);window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',complete)};
 },[]);
 async function install(){
  if(!prompt)return;
  try{await prompt.prompt();const choice=await prompt.userChoice;setMessage(choice.outcome==='accepted'?'تم قبول الإضافة؛ افتح خطوة من أيقونته على الشاشة الرئيسية.':'يمكنك إضافة خطوة لاحقًا من قائمة المتصفح.');}
  catch{setMessage('استخدم قائمة المتصفح لإضافة خطوة إلى الشاشة الرئيسية.');}
  finally{setPrompt(null)}
 }
 return <section className="panel no-print"><div className="section-head"><h2><Smartphone size={20} style={{verticalAlign:'middle',marginLeft:8}}/><UiText text={"خطوة على شاشة الجوال"}/></h2></div>{installed?<p><UiText text={"أنت تستخدم خطوة من التطبيق المضاف إلى الشاشة الرئيسية."}/></p>:<><p><UiText text={"أضف أيقونة خطوة لفتحه مباشرة، بنفس الحساب والبيانات والرابط المستخدم على الكمبيوتر."}/></p>{prompt&&<button className="primary" style={{marginTop:14}} onClick={install}><Download size={18}/><UiText text={"إضافة خطوة إلى الجهاز"}/></button>}<details style={{marginTop:14}}><summary><UiText text={"طريقة الإضافة للآيفون والأندرويد"}/></summary><p style={{marginTop:10}}><b><UiText text={"الآيفون:"}/></b> <UiText text={" افتح رابط خطوة في Safari، ثم المشاركة ← إضافة إلى الشاشة الرئيسية ← إضافة. فعّل «فتح كتطبيق ويب» إذا ظهر الخيار."}/></p><p style={{marginTop:10}}><b><UiText text={"الأندرويد:"}/></b> <UiText text={" افتح الرابط في Chrome، ثم قائمة ⋮ ← إضافة إلى الشاشة الرئيسية أو تثبيت التطبيق."}/></p></details></>}<p className="small muted" style={{marginTop:12}}><UiText text={"يحتاج خطوة إلى اتصال بالإنترنت. قد يُطلب تسجيل الدخول عند أول فتح من الأيقونة."}/></p>{message&&<p role="status" style={{marginTop:10}}>{ui(message)}</p>}</section>;
}
