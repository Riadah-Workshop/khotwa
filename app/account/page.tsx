'use client';
import {useEffect,useState,type FormEvent} from 'react';
import './profile.css';
type Profile={email:string;fullName:string;firstLoginAt:string|null};
export default function AccountPage(){
 const [profile,setProfile]=useState<Profile|null>(null),[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[newEmail,setNewEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{fetch('/api/account/profile',{cache:'no-store'}).then(r=>r.json()).then(setProfile).catch(()=>setError('تعذر تحميل الحساب'));},[]);
 async function update(e:FormEvent,op:'password'|'email'){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op==='password'?{op,currentPassword,newPassword}:{op,currentPassword,newEmail})}),v=await r.json();if(!r.ok)throw new Error(v.error||'تعذر التعديل');
   if(v.relogin){window.location.assign('/logout');return;}
   setNotice('تم إرسال رابط تأكيد إلى البريد الجديد. لن يتغير البريد الحالي إلا بعد فتح الرابط.');setNewEmail('');setCurrentPassword('');
  }catch(err){setError(err instanceof Error?err.message:'تعذر الحفظ');}finally{setBusy(false);}
 }
 return <main className="khotwa-profile" dir="rtl"><header><h1>حساب وكيل شؤون الطلاب</h1><a href="/">العودة إلى المنصة</a></header><p>يمكنك تغيير بريدك وكلمة المرور بنفسك بعد تسجيل الدخول لأول مرة. اسمك الوظيفي وبيانات المدرسة يديرها مدير النظام فقط.</p>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}{profile&&<section><strong>{profile.fullName}</strong><div dir="ltr">{profile.email}</div></section>}<form onSubmit={e=>update(e,'password')}><h2>تغيير كلمة المرور</h2><label>كلمة المرور الحالية<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>كلمة المرور الجديدة<input type="password" required autoComplete="new-password" minLength={12} maxLength={256} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button disabled={busy}>حفظ كلمة المرور الجديدة</button><p>بعد الحفظ سيتم تسجيل خروجك من جميع الجلسات.</p></form><form onSubmit={e=>update(e,'email')}><h2>تغيير البريد الإلكتروني</h2><label>البريد الجديد<input type="email" dir="ltr" required maxLength={200} value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label><label>كلمة المرور الحالية<input type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><button disabled={busy}>إرسال رابط التأكيد للبريد الجديد</button><p>الرابط صالح لمدة 30 دقيقة. لا يحتاج الطلب إلى موافقة مدير النظام.</p></form></main>;
}
