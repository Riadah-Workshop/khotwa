'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {PieChart,Pie,Cell,Tooltip,Legend,ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid} from 'recharts';
import './manager.css';
type Slice={name:string;value:number};
type Report={schoolName:string;schoolCode:string;students:number;openFollowups:number;grades:Slice[];attendance:Slice[];categories:Slice[];trend:{month:string;value:number}[];from:string;to:string};
const colors=['#0f766e','#9dd62b','#315f8b','#e6a23c','#8872bd','#dd6b74','#3aa8a2','#a0aebb'];
const today=()=>new Date().toISOString().slice(0,10);
const daysAgo=(n:number)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
function csvCell(v:unknown){return '"'+String(v??'').replace(/"/g,'""')+'"';}
export default function ManagerDashboard(){
 const [language,setLanguage]=useState<'ar'|'en'>('ar');
 const [from,setFrom]=useState(daysAgo(29)),[to,setTo]=useState(today());
 const [data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const en=language==='en';
 const t=(ar:string,english:string)=>en?english:ar;
 const load=useCallback(async()=>{setBusy(true);setError('');try{const res=await fetch('/api/manager/overview?'+new URLSearchParams({from,to}),{cache:'no-store'});const body=await res.json();if(!res.ok)throw new Error(body.error||'Unable to load report');setData(body);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}},[from,to]);
 useEffect(()=>{load();},[load]);
 const totals=useMemo(()=>({attendance:(data?.attendance||[]).reduce((n,x)=>n+x.value,0),cases:(data?.categories||[]).reduce((n,x)=>n+x.value,0)}),[data]);
 function downloadCsv(){if(!data)return;const lines=[['School',data.schoolName],['From',data.from],['To',data.to],['Active students',data.students],['Open follow-ups',data.openFollowups],[],['Section','Label','Count'],...data.grades.map(x=>['Grades',x.name,x.value]),...data.attendance.map(x=>['Attendance',x.name,x.value]),...data.categories.map(x=>['Case type',x.name,x.value]),...data.trend.map(x=>['Monthly cases',x.month,x.value])];const csv='\ufeff'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`khotwa-manager-report-${data.from}-${data.to}.csv`;anchor.click();URL.revokeObjectURL(url);}
 return <div className="manager-shell" dir={en?'ltr':'rtl'} lang={language}>
  <header><div><small>{t('خطوة | مساحة مدير المدرسة','Khotwa | School Manager')}</small><h1>{data?.schoolName||t('لوحة مدير المدرسة','School Manager Dashboard')}</h1><p>{t('اطلاع وتقارير فقط — لا يسمح بتعديل أو حذف السجلات','Read-only analytics and reports — no editing or deletion')}</p></div><div className="manager-actions"><button onClick={()=>setLanguage(en?'ar':'en')}>{en?'العربية':'English'}</button><a href="/logout">{t('تسجيل الخروج','Sign out')}</a></div></header>
  <main><section className="manager-toolbar"><label>{t('من تاريخ','From')}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>{t('إلى تاريخ','To')}<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><button onClick={load} disabled={busy}>{busy?t('جارٍ التحديث…','Loading…'):t('تحديث البيانات','Refresh')}</button><button onClick={downloadCsv} disabled={!data}>{t('تصدير التقرير CSV','Export CSV report')}</button><button onClick={()=>window.print()} disabled={!data}>{t('طباعة / PDF','Print / PDF')}</button></section>
  {error&&<p className="manager-error" role="alert">{error}</p>}{data&&<><div className="manager-metrics"><article><span>{t('الطلاب النشطون','Active students')}</span><strong>{data.students}</strong></article><article><span>{t('الحضور والغياب المسجل','Attendance entries')}</span><strong>{totals.attendance}</strong></article><article><span>{t('الحالات في الفترة','Cases in period')}</span><strong>{totals.cases}</strong></article><article><span>{t('حالات قيد المتابعة','Open follow-ups')}</span><strong>{data.openFollowups}</strong></article></div>
  <div className="manager-grid"><section><h2>{t('توزيع الحضور والغياب','Attendance distribution')}</h2>{data.attendance.length?<ResponsiveContainer width="100%" height={290}><PieChart><Pie data={data.attendance} dataKey="value" nameKey="name" outerRadius={96} label>{data.attendance.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer>:<p>{t('لا توجد بيانات ضمن هذه الفترة','No data in this period')}</p>}</section>
  <section><h2>{t('الحالات حسب النوع','Cases by type')}</h2>{data.categories.length?<ResponsiveContainer width="100%" height={290}><PieChart><Pie data={data.categories} dataKey="value" nameKey="name" outerRadius={96} label>{data.categories.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer>:<p>{t('لا توجد حالات ضمن هذه الفترة','No cases in this period')}</p>}</section>
  <section><h2>{t('توزيع الطلاب على الصفوف','Students by grade')}</h2><ResponsiveContainer width="100%" height={290}><BarChart data={data.grades} margin={{top:10,right:10,left:0,bottom:55}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={65}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#0f766e"/></BarChart></ResponsiveContainer></section>
  <section><h2>{t('اتجاه الحالات شهريًا','Monthly case trend')}</h2><ResponsiveContainer width="100%" height={290}><BarChart data={data.trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#315f8b"/></BarChart></ResponsiveContainer></section></div></>}
  <p className="manager-footer">{t('جميع النتائج خاصة بالمدرسة الحالية فقط. الأرقام حسب الفترة المحددة ما عدا الطلاب النشطين والمتابعات المفتوحة.','All results are limited to this school. Date filters apply except to active students and open follow-ups.')}</p></main>
 </div>;
}
