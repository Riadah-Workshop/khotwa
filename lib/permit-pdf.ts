import {jsPDF} from 'jspdf';
import {PRINT_DATA_ENTRY_NAME} from './brand';
import {CLASS_LATE_TYPE,CASE_TYPES,readExtra,extraRows} from './case-fields';
type RecordCase={id:string;studentId:string;type:string;occurredAt:string;details:string;action:string;actor:string;extra?:string};
type Student={id?:string;name:string;grade:string;classroom:string};
export type PdfAssets={font:string;schoolLogo?:string;ministryLogo?:string};
export function createPermitPdf(records:RecordCase[],students:Student[],settings:Record<string,string>,assets:PdfAssets,fourPerPage=true){
 const doc=new jsPDF({unit:'mm',format:'a4'});doc.addFileToVFS('arabic.ttf',assets.font);doc.addFont('arabic.ttf','Arabic','normal');doc.setFont('Arabic');doc.setR2L(false);doc.setTextColor(25,66,54);
 const line=(text:string,x:number,y:number,width:number,size=10)=>{doc.setFontSize(size);const lines=doc.splitTextToSize(text,width) as string[];doc.text(lines,x,y,{align:'right'});return y+lines.length*size*.43+2;};
 records.forEach((record,index)=>{
  const entry=record.type===CASE_TYPES[0]||record.type===CLASS_LATE_TYPE,exit=record.type===CASE_TYPES[1],small=entry&&fourPerPage;
  if(small){if(index>0&&index%4===0)doc.addPage();}else if(index>0)doc.addPage();
  const slots=exit?[0,1]:[small?index%4:0];
  for(const slot of slots){
   const x=small?(slot%2===0?107:10):10,y=small?10+Math.floor(slot/2)*140:exit?10+slot*140:10,w=small?93:190,h=small||exit?136:277;
   doc.setDrawColor(175,185,178);doc.setLineDashPattern([1,1],0);doc.rect(x,y,w,h);doc.setLineDashPattern([],0);
   if(assets.schoolLogo)doc.addImage(assets.schoolLogo,'PNG',x+w-15,y+3,11,11);
   if(assets.ministryLogo)doc.addImage(assets.ministryLogo,'PNG',x+4,y+4,20,9);
   let cursor=line(settings.school||'مدرسة الحرمين الابتدائية بالخبر',x+w-27,y+9,w-52,small?7:11);cursor=Math.max(cursor,y+22);
   const title=entry?(record.type===CLASS_LATE_TYPE?'إذن دخول الحصة':'إذن دخول بعد التأخر الصباحي'):exit?'إذن خروج وتسليم طالب':record.type===CASE_TYPES[2]?'تعهد بالالتزام بالسلوك المدرسي':record.type===CASE_TYPES[6]?'محضر زيارة ولي الأمر':'سجل حالة طالب';
   cursor=line(title,x+w-5,cursor,w-10,small?10:13);
   if(exit)cursor=line(slot===0?'نسخة الحارس':'نسخة وكيل شؤون الطلاب',x+w-5,cursor,w-10,9);
   const e=readExtra(record.extra),s=students.find(s=>s.id===record.studentId),date=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(record.occurredAt));
   cursor=line('التاريخ: '+date,x+w-5,cursor,w-10,9);
   cursor=line('اسم الطالب: '+(e.studentName||s?.name||'طالب'),x+w-5,cursor,w-10,small?10:11);
   cursor=line('الصف / الفصل: '+(e.studentGrade||s?.grade||'')+' / '+(e.studentClassroom||s?.classroom||''),x+w-5,cursor,w-10,9);
   for(const [label,value] of extraRows(record.type,e))cursor=line(label+': '+value,x+w-5,cursor,w-10,small?9:10);
   const statement=entry?'يُسمح للطالب بالدخول إلى الفصل بعد تسجيل تأخره.':exit?'يُسمح بخروج الطالب وتسليمه للمستلم المذكور بعد التحقق من هويته.':record.type===CASE_TYPES[2]?'أتعهد بالالتزام بتعليمات المدرسة واحترام المعلمين والزملاء والمحافظة على الممتلكات وعدم تكرار المخالفة.':'';
   if(statement)cursor=line(statement,x+w-5,cursor+2,w-10,small?9:10);
   if(!entry&&!exit){cursor=line('التفاصيل: '+record.details,x+w-5,cursor+3,w-10,10);cursor=line('الإجراء: '+record.action,x+w-5,cursor,w-10,10);}
   cursor=Math.max(cursor+5,y+h-(exit?30:25));
   if(cursor>y+h-20)throw new Error('البيانات طويلة على نموذج الطباعة. استخدم طباعة المتصفح لهذا السجل.');
   cursor=line('وكيل شؤون الطلاب: '+(settings.deputy||'عايض عوض سعيد القحطاني'),x+w-5,cursor,w-10,9);
   cursor=line('التوقيع / الختم: __________________',x+w-5,cursor,w-10,8);
   if(exit)cursor=line('توقيع المستلم: __________  مسؤول البوابة: __________',x+w-5,cursor,w-10,8);
   if(record.type===CASE_TYPES[2])cursor=line('توقيع الطالب: __________  ولي الأمر: __________',x+w-5,cursor,w-10,8);
   if(record.type===CASE_TYPES[6])cursor=line('توقيع ولي الأمر: __________  من تمت مقابلته: __________',x+w-5,cursor,w-10,8);
   doc.setFontSize(7);doc.text('خطوة • '+record.id.slice(0,8).toUpperCase(),x+w-5,y+h-4,{align:'right'});
   doc.setFontSize(small?6:7);doc.text('مدخل البيانات: '+PRINT_DATA_ENTRY_NAME,x+4,y+h-4,{align:'left'});
  }
 });
 return doc;
}
async function imageData(url:string){const response=await fetch(url);if(!response.ok)throw new Error('تعذر تحميل شعار الطباعة');const blob=await response.blob();return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=reject;reader.readAsDataURL(blob);});}
export async function downloadPermitPdf(records:RecordCase[],students:Student[],settings:Record<string,string>,fourPerPage=true){
 const [fontResponse,schoolLogo,ministryLogo]=await Promise.all([fetch('/fonts/arabic.ttf'),imageData('/haramain-logo.png'),imageData('/moe-logo.png')]);if(!fontResponse.ok)throw new Error('تعذر تحميل خط الطباعة');
 const bytes=new Uint8Array(await fontResponse.arrayBuffer());let font='';for(let i=0;i<bytes.length;i+=8192)font+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const doc=createPermitPdf(records,students,settings,{font:btoa(font),schoolLogo,ministryLogo},fourPerPage);
 const blob=doc.output('blob'),url=URL.createObjectURL(blob),link=window.document.createElement('a');link.href=url;link.download='خطوة-أذونات.pdf';link.target='_blank';link.rel='noopener';window.document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
