'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Award,Download,Share2,X} from 'lucide-react';
import {useLocale} from './locale';
import {medalCandidates,type MedalStudent,type MedalAttendance,type MedalRound} from '../lib/student-medal';
import {createMedalImage} from '../lib/medal-image';
type Data={students:MedalStudent[];attendance:MedalAttendance[];attendanceRounds:MedalRound[];cases:{studentId:string;type:string;occurredAt:string;deletedAt?:string}[];settings:Record<string,string>};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function StudentMedals({data}:{data:Data}){
 const {ui,language}=useLocale(),end=today();
 const dates=[...data.attendance.map(r=>r.date),...data.attendanceRounds.map(r=>r.date),...data.cases.filter(c=>!c.deletedAt).map(c=>{const d=new Date(c.occurredAt);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):end;})].filter(d=>d<=end).sort();const from=dates[0]||end,to=end;
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<MedalStudent|null>(null),[file,setFile]=useState<File|null>(null),[url,setUrl]=useState(''),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const rows=useMemo(()=>medalCandidates(data.students,data.attendance,data.attendanceRounds,data.cases,from,to),[data,from,to]);
 const eligible=rows.filter(s=>s.eligible),visible=eligible.filter(s=>s.name.includes(query)||[s.grade,s.classroom].join(' / ').includes(query));
 useEffect(()=>{if(!selected)return;let cancelled=false,objectUrl='';setFile(null);setUrl('');setError('');dialog.current?.showModal();createMedalImage(selected,data.settings.school,from,to,language==='en').then(blob=>{if(cancelled)return;const f=new File([blob],'خطوة-وسام-'+selected.name.replace(/[\\/:*?"<>|]/g,'')+'.png',{type:'image/png'});objectUrl=URL.createObjectURL(f);setFile(f);setUrl(objectUrl);}).catch(()=>{if(!cancelled)setError('تعذر تجهيز صورة الوسام. أعد المحاولة.');});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[selected,from,to,language,data.settings.school]);
 const message=selected?(language==='en'?`Congratulations to ${selected.name} on earning the Attendance & Conduct Medal for ${from} — ${to}. Thank you for supporting your child's commitment.`:`نبارك للطالب ${selected.name} حصوله على وسام الحضور والانضباط خلال الفترة ${from} إلى ${to}، تقديرًا لمواظبته وعدم تسجيل مخالفات سلوكية عليه. شكرًا لكم على دعمكم ومتابعتكم.`):'';
 async function share(){if(!file)return;setError('');try{if(navigator.canShare?.({files:[file]})&&navigator.share)await navigator.share({files:[file],title:ui('وسام الحضور والانضباط'),text:message});else setError('المشاركة غير متاحة هنا. حمّل الصورة وأرفقها في واتساب.');}catch(e){if((e as Error).name!=='AbortError')setError('تعذرت المشاركة. حمّل الصورة وأرفقها في واتساب.');}}
 return <section className="panel student-medals no-print">
 <div className="section-head"><div><h2><Award size={25}/>{ui('وسام الحضور والانضباط')}</h2><p>{ui('طلاب بسجل نظيف من الغياب والتأخر وجميع الحالات.')}</p></div><span className="medal-count">{eligible.length} {ui('مرشح للوسام')}</span></div>
 <p>{ui('مراجعة كامل السجل منذ بداية البرنامج:')} {from} — {to}</p>
 <p className="small muted">{ui('يشترط سجل بلا غياب أو تأخر أو أي حالة مسجلة، بما فيها الاستئذان والمخالفات والتواصل والملاحظات. السجلات المحذوفة لا تُحتسب.')}</p>
 <p className="small muted">{ui('طلاب يحتاجون مراجعة اكتمال الحصر:')} {rows.filter(s=>s.needsReview).length}</p>
 <label className="field"><span>{ui('البحث عن طالب')}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ui('ابحث بالاسم أو الصف')}/></label>
 <div className="medal-candidates">{visible.map(s=><article key={s.id}><div className="medal-mini" aria-hidden="true"><Award size={32}/></div><div><b>{s.name}</b><p>{s.grade} / {s.classroom} • {s.days} {ui('يوم حضور موثق')}</p></div><button className="primary" disabled={!from||!to||from>to||to>end} onClick={()=>setSelected(s)}>{ui('تجهيز الوسام')}</button></article>)}</div>
 {!visible.length&&<p className="empty">{ui('لا يوجد مرشحون مطابقون. راجع أسباب الاستبعاد واكتمال الحصر.')}</p>}
 <details><summary>{ui('مراجعة الطلاب غير المرشحين')} ({rows.filter(s=>!s.eligible).length})</summary><div className="medal-candidates">{rows.filter(s=>!s.eligible&&(s.name.includes(query)||[s.grade,s.classroom].join(' / ').includes(query))).map(s=><article key={s.id}><div><b>{s.name}</b><p>{s.grade} / {s.classroom}</p><p>{[s.absent?ui('أيام الغياب')+': '+s.absent:'',s.late?ui('أيام الحضور المتأخر')+': '+s.late:'',...s.caseTypes.map(t=>ui(t)),s.needsReview?ui('يحتاج مراجعة اكتمال الحصر'): ''].filter(Boolean).join(' • ')}</p></div></article>)}</div></details>
 <p className="small muted">{ui('تجهيز الوسام لا يرسل رسالة تلقائيًا. اختر المستلم وأكّد الإرسال من تطبيق المشاركة.')}</p>
 <dialog ref={dialog} className="medal-dialog" onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)}><div className="section-head"><h2>{ui('وسام الحضور والانضباط')}</h2><button className="icon-button" aria-label={ui('إغلاق')} onClick={()=>{dialog.current?.close();setSelected(null);}}><X/></button></div>{url?<img src={url} alt={ui('وسام الحضور والانضباط')+' — '+selected?.name}/>:!error&&<p role="status">{ui('جارٍ تجهيز الوسام…')}</p>}{error&&<p role="alert">{ui(error)}</p>}<div className="actions">{url&&<a className="secondary" href={url} download={file?.name}><Download size={18}/>{ui('تحميل صورة الوسام')}</a>}<button className="primary" disabled={!file} onClick={share}><Share2 size={18}/>{ui('مشاركة الوسام')}</button></div><label className="field"><span>{ui('رسالة التهنئة')}</span><textarea readOnly value={message} rows={4}/></label><p className="small muted">{ui('إذا لم تظهر المشاركة، حمّل الصورة وأرسلها لولي الأمر مع رسالة التهنئة.')}</p></dialog>
 </section>;
}
