import {REGISTRATION,REGISTRATION_PRINT} from './registration';
import {messagePrintSummary,compactPrintText} from './message-print-summary';
import {jsPDF} from 'jspdf';
import type {Message} from '../app/messages-panel';
type Assets={font:string;schoolLogo?:string;ministryLogo?:string;photo?:string};
const labels:Record<string,string>={new:'جديد',processing:'قيد المعالجة',done:'تمت المعالجة'};
const stamp=(s:string)=>s?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short',hourCycle:'h23'}).format(new Date(s)):'—';
export function createMessagePdf(original:Message,settings:Record<string,string>,assets:Assets){
 const m=messagePrintSummary(original);settings={...settings,school:compactPrintText(settings.school,80),deputy:compactPrintText(settings.deputy,60),principal:compactPrintText(settings.principal,60)};
 const doc=new jsPDF({unit:'mm',format:'a4'}),left=16,right=194,width=178;let y=44;
 doc.addFileToVFS('arabic.ttf',assets.font);doc.addFont('arabic.ttf','Arabic','normal');doc.setFont('Arabic');doc.setR2L(false);doc.setTextColor(25,66,54);
 function header(){doc.setFontSize(12);doc.text(settings.school||'مدرسة الحرمين الابتدائية بالخبر',105,20,{align:'center'});if(assets.schoolLogo)doc.addImage(assets.schoolLogo,'PNG',174,10,20,20);if(assets.ministryLogo)doc.addImage(assets.ministryLogo,'PNG',16,12,27,16);doc.setFontSize(15);doc.text('عرض موجز لمدير المدرسة',105,33,{align:'center'});doc.setDrawColor(192,211,200);doc.line(left,38,right,38);y=46;}
 function next(){doc.addPage();header();}
 function write(text:string,size=11,gap=3){doc.setFontSize(size);const lines=doc.splitTextToSize(text||'—',width) as string[];const height=size*.5;for(const line of lines){if(y+height>268)next();doc.setFontSize(size);doc.text(line,right,y,{align:'right'});y+=height;}y+=gap;}
 function heading(text:string){if(y+18>268)next();y+=3;write(text,13,3);}
 header();
 for(const text of [`الطالب: ${m.studentName}`,`صفة المرسل: ${m.senderRole||'غير محدد'}`,`جوال ولي الأمر: ${m.phone||'غير مسجل'}`,`الصف: ${m.grade}`,`نوع الموضوع: ${m.kind}`,...(m.teacherName?[`المعلّم: ${m.teacherName}`]:[]),`تاريخ الاستلام: ${stamp(m.createdAt)}`,`حالة المعالجة: ${labels[m.status]||m.status}`])write(text,10,1);
 heading('ملخص الرسالة الواردة');write(m.details,10);
 heading('الإجراء والملاحظات');write(m.notes||'لم يُوثّق إجراء بعد؛ يعرض الموضوع للمراجعة.',10);
 if(m.actor)write(`آخر إجراء: ${m.actor} • ${stamp(m.updatedAt)}`,9);
 if(assets.photo){heading('الصورة المرفقة');const image=doc.getImageProperties(assets.photo),w=Math.min(width,65),h=w*image.height/image.width;const scale=Math.min(1,35/h);if(y+h*scale>268)next();doc.addImage(assets.photo,'JPEG',right-w*scale,y,w*scale,h*scale);y+=h*scale+7;}
 else if(m.attachmentKey)write('يوجد مرفق في الرسالة الأصلية لم يُضمّن في هذا الملف.',9);
 y+=3;write('وكيل شؤون الطلاب: '+(settings.deputy||'عايض عوض سعيد القحطاني'),10);write('مدير المدرسة: '+(settings.principal||'________________'),10);
 const count=doc.getNumberOfPages();for(let n=1;n<=count;n++){doc.setPage(n);doc.setFont('Arabic');doc.setFontSize(8);doc.text(`خطوة • عرض موجز — التفاصيل الكاملة محفوظة في الرسالة الأصلية • ${n}/${count}`,105,286,{align:'center'});doc.setFontSize(7);doc.text(REGISTRATION_PRINT.split(' • '+REGISTRATION.number)[0],194,291,{align:'right'});doc.text(REGISTRATION.number,16,291,{align:'left'});}
 return doc;
}
async function dataUrl(path:string,required=false){const response=await fetch(path,{cache:'no-store'});if(!response.ok){if(required)throw new Error('تعذر تحميل الصورة المرفقة. أعد المحاولة أو استخدم طباعة العرض');return undefined;}const bytes=new Uint8Array(await response.arrayBuffer());let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+(response.headers.get('content-type')?.split(';')[0]||'image/png')+';base64,'+btoa(value);}
export async function downloadMessagePdf(message:Message,settings:Record<string,string>){
 const [fontResponse,schoolLogo,ministryLogo,photo]=await Promise.all([fetch('/fonts/arabic.ttf'),dataUrl('/haramain-logo.png'),dataUrl('/moe-logo.png'),message.attachmentKey?dataUrl('/api/messages?attachment='+encodeURIComponent(message.id),true):Promise.resolve(undefined)]);
 if(!fontResponse.ok)throw new Error('تعذر تحميل خط PDF. أعد المحاولة');const bytes=new Uint8Array(await fontResponse.arrayBuffer());let font='';for(let i=0;i<bytes.length;i+=8192)font+=String.fromCharCode(...bytes.subarray(i,i+8192));const doc=createMessagePdf(message,settings,{font:btoa(font),schoolLogo,ministryLogo,photo});
 const url=URL.createObjectURL(doc.output('blob'));const link=document.createElement('a');link.href=url;link.download='خطوة-عرض-رسالة-'+message.id.slice(0,8)+'.pdf';link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
