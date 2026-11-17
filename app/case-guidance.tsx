'use client';
import {useLocale} from './locale';
import {guidanceReference,violationKey,priorGuidanceCases,type GuidanceCase} from '../lib/case-guidance';
const guide='/guides/behavior-attendance-1447.pdf';
export default function CaseGuidance({type,extra,studentId,occurredAt,cases,editingId}:{type:string;extra:{violation?:string;customViolation?:string};studentId:string;occurredAt:string;cases:GuidanceCase[];editingId?:string}){
 const {language}=useLocale(),en=language==='en',ref=guidanceReference(type,extra.violation);
 if(!ref)return null;
 const prior=priorGuidanceCases(cases,studentId,type,extra,occurredAt,editingId);
 return <details className="panel no-print" style={{marginBlock:'1rem',padding:'1rem'}}>
 <summary style={{cursor:'pointer',fontWeight:700}}>{en?'Case guidance • Conduct and Attendance Rules 1447':'إرشادات الحالة • قواعد السلوك والمواظبة ١٤٤٧'}</summary>
 <p>{en?'Elementary school • Article':'المرحلة الابتدائية • المادة'} {ref.article} • {en?'Printed page':'الصفحة المطبوعة'} {ref.printed}</p>
 {ref.ambiguous&&<p role="note">{en?'This existing category can cover different situations. Check the exact incident against the original rules before choosing a degree or procedure.':'المسمى الحالي قد يشمل وقائع مختلفة؛ طابق وصف الواقعة مع نص الدليل قبل تحديد الدرجة والإجراء.'}</p>}
 {ref.firstDegree&&<><p>{en?'First-degree procedure overview (read the full reference before applying):':'ملخص تدرّج إجراءات الدرجة الأولى (راجع النص الكامل قبل التطبيق):'}</p><ol>
 <li>{en?'First verbal reminder using an appropriate educational approach.':'التنبيه الشفهي الأول بأسلوب تربوي مناسب.'}</li>
 <li>{en?'Second verbal reminder, observe causes and reinforce positive behaviour.':'التنبيه الشفهي الثاني، وملاحظة مسببات السلوك وتعزيز السلوك الإيجابي.'}</li>
 <li>{en?'Document the issue, notify the parent and refer to the student counsellor; review the full deduction and compensation provisions.':'تدوين المشكلة وإشعار ولي الأمر والإحالة للموجه الطلابي، مع مراجعة أحكام الحسم وفرص التعويض في النص الكامل.'}</li>
 <li>{en?'Invite the parent, agree on a behaviour plan and refer to the guidance committee as specified in the full rules.':'دعوة ولي الأمر والاتفاق على خطة تعديل السلوك والإحالة للجنة التوجيه وفق تفاصيل الدليل.'}</li>
 </ol></>}
 <p className="small muted">{en?'Guidance only. Record counts do not prove that previous procedures were completed. No automatic deduction, referral or parent notification.':'إرشاد للمراجعة؛ عدد السجلات لا يثبت تنفيذ الإجراءات السابقة. لا حسم أو إحالة أو إشعار تلقائي.'}</p>
 {studentId&&violationKey(type,extra)&&<p>{en?'Earlier records with the same specific category, up to this case date:':'السجلات السابقة للمسمى المحدد نفسه حتى تاريخ هذه الحالة:'} <b>{prior.length}</b></p>}
 {prior.length>0&&<details><summary>{en?'Review recorded actions':'مراجعة الإجراءات المسجلة'}</summary>{prior.slice(0,5).map(r=><div key={r.id} style={{paddingBlock:8,borderBottom:'1px solid #ccd8d2'}}><time>{new Date(r.occurredAt).toLocaleDateString(en?'en-GB':'ar-SA',{timeZone:'Asia/Riyadh'})}</time><p style={{whiteSpace:'pre-wrap'}}>{r.action||'—'}</p></div>)}{prior.length>5&&<p>{en?'Latest five shown; all records remain in the student file.':'تظهر آخر خمسة سجلات؛ جميع السجلات متاحة في ملف الطالب.'}</p>}</details>}
 <a className="secondary" href={`${guide}#page=${ref.page}`} target="_blank" rel="noopener noreferrer">{en?'Open original rules and printable forms (PDF)':'فتح الدليل الأصلي والنماذج للطباعة (PDF)'}</a>
 <p className="small muted">{en?'Fifth edition, 1447 / 2025 • Forms: printed page 57 onward.':'الإصدار الخامس ١٤٤٧هـ / ٢٠٢٥م • النماذج: من الصفحة المطبوعة ٥٧.'}</p>
 </details>;
}
export function AttendanceGuidance(){const {language}=useLocale();const en=language==='en';return <details className="panel no-print"><summary>{en?'Attendance guidance and printable forms':'إرشادات الغياب ونماذجه للطباعة'}</summary><p>{en?'Review the accepted excuse before choosing the excused or unexcused absence procedure. Existing attendance records and alerts are unchanged.':'راجع العذر قبل اختيار إجراءات الغياب بعذر أو دون عذر. تبقى سجلات الغياب والتنبيهات الحالية كما هي.'}</p><ul>{[[48,'حالات الغياب والاستئذان بعذر','Accepted absence and leave excuses'],[49,'إجراءات الغياب بعذر','Excused absence procedures'],[50,'إجراءات الغياب دون عذر','Unexcused absence procedures'],[56,'فهرس النماذج للطباعة','Printable forms index']].map(([page,ar,eng])=><li key={page}><a href={`${guide}#page=${page}`} target="_blank" rel="noopener noreferrer">{en?eng:ar}</a></li>)}</ul></details>}
