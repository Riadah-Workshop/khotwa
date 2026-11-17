'use client';
import {useMemo} from 'react';
import {Printer} from 'lucide-react';
import {UiText,useLocale} from './locale';
import {readExtra,extraRows,CASE_TYPES} from '../lib/case-fields';
import SchoolIdentity from './school-identity';
type C={id:string;studentId:string;type:string;occurredAt:string;createdAt:string;actor:string;extra?:string;deletedAt?:string};
type S={id:string;name:string;grade:string;classroom:string};
export default function LeaveReport({cases,students,school,deputy}:{cases:C[];students:S[];school:string;deputy:string}){
 const {ui}=useLocale();
 const rows=useMemo(()=>cases.filter(c=>c.type===CASE_TYPES[1]&&!c.deletedAt).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id)),[cases]);
 const byId=new Map(students.map(s=>[s.id,s]));
 return <section className="panel attendance-report"><div className="section-head no-print"><div><h2><UiText text={'تقرير الاستئذان المنفذ'}/></h2><p className="small muted"><UiText text={'جميع سجلات الاستئذان المحفوظة منذ بداية البرنامج، مرتبة من الأحدث إلى الأقدم.'}/></p></div><button className="primary" onClick={()=>window.print()}><Printer size={17}/><UiText text={'طباعة التقرير / حفظ PDF'}/></button></div><div className="report-title"><SchoolIdentity school={school}/><h2><UiText text={'سجل الاستئذان'}/></h2><p>{rows.length} <UiText text={'استئذان مسجل'}/></p></div><div className="table-wrap"><table data-khotwa-table="leave-report"><thead><tr><th>#</th><th><UiText text={'اسم الطالب'}/></th><th><UiText text={'الصف / الفصل'}/></th><th><UiText text={'التاريخ'}/></th><th><UiText text={'سبب الاستئذان ووقت الخروج'}/></th><th><UiText text={'المستلم / صلة القرابة'}/></th><th><UiText text={'مدخل البيانات'}/></th></tr></thead><tbody>{rows.map((c,i)=>{const s=byId.get(c.studentId),e=readExtra(c.extra),fields=extraRows(c.type,e);const value=(label:string)=>fields.find(([k])=>k===label)?.[1]||'—';return <tr key={c.id}><td>{i+1}</td><td>{s?.name||'—'}</td><td>{s?`${s.grade} / ${s.classroom}`:'—'}</td><td>{new Date(c.occurredAt).toLocaleString('ar-SA')}</td><td>{value('سبب الاستئذان')}<small>{ui('وقت الخروج')}: {value('وقت الخروج')}</small></td><td>{value('اسم المستلم')}<small>{value('صلة القرابة')}</small></td><td>{c.actor}<small>{new Date(c.createdAt).toLocaleString('ar-SA')}</small></td></tr>;})}</tbody></table>{!rows.length&&<div className="empty"><UiText text={'لا توجد سجلات استئذان محفوظة حتى الآن.'}/></div>}</div><div className="report-signature"><span><UiText text={'وكيل شؤون الطلاب: '}/>{deputy}</span><span><UiText text={'مدير المدرسة: '}/>________________</span></div></section>;
}
