'use client';
import {useMemo,useState} from 'react';
import {flushSync} from 'react-dom';
import {useLocale,UiText} from './locale';
import SchoolIdentity from './school-identity';
import {absencePatterns,sortAbsencePatterns,type AbsenceRecord} from '../lib/repeated-absence';
import type {AttendanceRecord,AttendanceRound} from './attendance-panel';
import {Download,Printer} from 'lucide-react';

type Student={id:string;name:string;grade:string;classroom:string;phone:string;active:number};
function csvCell(value:string){return '"'+(/^[=+@\-\t\r]/.test(value)?"'":'')+value.replace(/"/g,'""')+'"';}
function exportCsv(rows:ReturnType<typeof absencePatterns<Student>>,language:'ar'|'en'){
 const header=language==='en'?['Student','Grade','Class','Absence days','Longest consecutive school days','Pattern','Absence dates']:['اسم الطالب','الصف','الفصل','عدد أيام الغياب','أطول غياب متتابع (أيام دراسية)','نمط الغياب','تواريخ الغياب'];
 const data=rows.map(row=>{const longest=row.longest;const pattern=row.total===1?'يوم واحد':longest===row.total?'متتابع':longest>1?'متتابع ومتفرق':'متفرق';return [row.name,row.grade,row.classroom,String(row.total),String(longest),pattern,row.dates.join('، ')];});
 const url=URL.createObjectURL(new Blob(['\uFEFF'+[header,...data].map(line=>line.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='student-absence-summary.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function AbsenceStudentReport({students,attendance,rounds,school,deputy}:{students:Student[];attendance:AttendanceRecord[];rounds:AttendanceRound[];school:string;deputy:string}){
 const {ui,language}=useLocale();
 const [printingStudentId,setPrintingStudentId]=useState('');
 const [printError,setPrintError]=useState('');
 function printReport(studentId=''){flushSync(()=>{setPrintingStudentId(studentId);setPrintError('');});try{window.print();}catch{setPrintError('تعذر فتح الطباعة. افتح خطوة في المتصفح ثم أعد المحاولة.');}}
 const rows=useMemo(()=>sortAbsencePatterns(absencePatterns(students,attendance as AbsenceRecord[],rounds).filter(row=>row.total>0)),[students,attendance,rounds]);
 const totalDays=rows.reduce((sum,row)=>sum+row.total,0);

 const printingStudent=rows.find(row=>row.id===printingStudentId);
 return <>
  <section className="panel no-print">
   <div className="section-head"><div><h2><UiText text={'كشف غياب الطلاب'}/></h2><p className="small muted"><UiText text={'يشمل كل طالب لديه يوم غياب واحد أو أكثر من كامل السجل، سواء كان الغياب متتابعًا أو متفرقًا.'}/></p></div><div className="actions"><button className="primary" onClick={()=>printReport()}><Printer size={17}/><UiText text={'طباعة التقرير / حفظ PDF'}/></button><button className="secondary" onClick={()=>exportCsv(rows,language)}><Download size={17}/><UiText text={'تصدير CSV'}/></button></div></div>
   {printError&&<p className="alert error" role="alert">{ui(printError)}</p>}{printingStudent&&<p className="alert" role="status">{ui('الطالب المحدد للطباعة: ')}{printingStudent.name} <button type="button" className="secondary" onClick={()=>setPrintingStudentId('')}>{ui('العودة لطباعة جميع الطلاب')}</button></p>}<div className="report-counts"><span><UiText text={'الطلاب ذوو الغياب: '}/><b>{rows.length}</b></span><span><UiText text={'إجمالي أيام الغياب المسجلة: '}/><b>{totalDays}</b></span><span><UiText text={'حد الإدراج: يوم غياب واحد فأكثر'}/></span></div>
  </section>
  <section className={'panel attendance-report absence-student-report'+(printingStudentId?' printing-one':'')}>
   <div className="report-title"><img className="report-logo" src="/ats-logo.jpg" alt="ATS"/><SchoolIdentity school={school}/><h2><UiText text={'كشف غياب الطلاب'}/></h2><p className="muted"><UiText text={'كامل السجل المعتمد'} /> • {rows.length} <UiText text={'طالب'} /> • {totalDays} <UiText text={'يوم غياب'}/></p></div>
   {printingStudent&&<div className="absence-single-print-title"><SchoolIdentity school={school}/><h1><UiText text={'سجل غياب الطالب'}/></h1><h2>{printingStudent.name}</h2><p>{printingStudent.grade} / {printingStudent.classroom}</p><p><UiText text={'إجمالي أيام الغياب: '}/><b>{printingStudent.total}</b> • <UiText text={'أطول تسلسل غياب: '}/><b>{printingStudent.longest}</b></p></div>}
   {!rows.length?<div className="empty"><UiText text={'لا توجد سجلات غياب معتمدة في السجل.'}/></div>:<div className="table-wrap"><table data-khotwa-table="absence-student-report"><thead><tr><th>#</th><th><UiText text={'اسم الطالب'}/></th><th><UiText text={'الصف / الفصل'}/></th><th><UiText text={'أيام الغياب'}/></th><th><UiText text={'أطول تسلسل غياب (أيام دراسية)'}/></th><th><UiText text={'نمط الغياب'}/></th><th><UiText text={'تواريخ الغياب المسجلة'}/></th><th className="no-print"><UiText text={'إجراء'}/></th></tr></thead><tbody>{rows.map((row,index)=>{const pattern=row.total===1?'يوم واحد':row.longest===row.total?'متتابع':row.longest>1?'متتابع ومتفرق':'متفرق';return <tr key={row.id} className={printingStudentId&&printingStudentId!==row.id?'exclude-from-print':''}><td>{index+1}</td><td>{row.name}</td><td>{row.grade} / {row.classroom}</td><td><b>{row.total}</b></td><td>{row.longest}</td><td>{ui(pattern)}</td><td className="absence-dates">{row.dates.join('، ')}</td><td className="no-print"><button type="button" className="secondary" onClick={()=>printReport(row.id)}><Printer size={15}/><UiText text={'طباعة الطالب'}/></button></td></tr>;})}</tbody></table></div>}
   <div className="report-signature"><span><UiText text={'وكيل شؤون الطلاب: '}/>{deputy||'________________'}</span><span><UiText text={'مدير المدرسة: '}/>________________</span></div>
  </section>
 </>;
}
