import {jsPDF} from 'jspdf';
import type {FileCardStudent} from './student-file-cards';
type Assets={font:string;schoolLogo?:string;ministryLogo?:string};
export function createFileCardsPdf(pages:FileCardStudent[][],school:string,assets:Assets){
 if(!pages.length)throw new Error('حدّد الطلاب أولًا');
 const doc=new jsPDF({unit:'mm',format:'a4'});
 doc.addFileToVFS('arabic.ttf',assets.font);doc.addFont('arabic.ttf','Arabic','normal');doc.setFont('Arabic');doc.setR2L(false);
 const center=(text:string,x:number,y:number,width:number,size:number,maxLines=3)=>{
  let lines:string[]=[];let fitted=size;
  for(;fitted>=7;fitted--){doc.setFontSize(fitted);lines=doc.splitTextToSize(text,width) as string[];if(lines.length<=maxLines)break;}
  if(lines.length>maxLines)throw new Error('يوجد اسم طويل جدًا؛ راجعه قبل الطباعة.');
  doc.text(lines,x,y,{align:'center'});
 };
 pages.forEach((page,p)=>{if(p)doc.addPage();page.forEach((s,i)=>{
  // AS-LSE-1116: 2 columns x 8 rows, 105 x 37 mm, 296 mm total height.
  const x=105-(i%2)*105,y=0.5+Math.floor(i/2)*37,c=x+52.5;
  doc.setTextColor(25,25,25);center(s.name,c,y+12,91,s.name.length>80?11:s.name.length>45?14:18,2);
  doc.setTextColor(65,65,65);center(school||'مدرسة الحرمين الابتدائية بالخبر',c,y+28,91,12,2);
 });});return doc;
}
async function base64(url:string,signal:AbortSignal){
 const r=await fetch(url,{signal});if(!r.ok)throw new Error('تعذر تحميل ملف الطباعة');
 const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export async function fileCardsPdfBlob(pages:FileCardStudent[][],school:string,signal:AbortSignal){
 const [font,schoolLogo,ministryLogo]=await Promise.all([base64('/fonts/arabic.ttf',signal),base64('/haramain-logo.png',signal).catch(()=>undefined),base64('/moe-logo.png',signal).catch(()=>undefined)]);
 return createFileCardsPdf(pages,school,{font,schoolLogo:schoolLogo?'data:image/png;base64,'+schoolLogo:undefined,ministryLogo:ministryLogo?'data:image/png;base64,'+ministryLogo:undefined}).output('blob');
}
