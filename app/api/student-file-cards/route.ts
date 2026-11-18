import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {fileCardPages,type FileCardStudent} from '../../../lib/student-file-cards';
export const dynamic='force-dynamic';
const error=(message:string,status:number)=>new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
export async function GET(req:Request){
 if(!await getChatGPTUser())return error('يرجى فتح خطوة وتسجيل الدخول ثم إعادة فتح ملف البطاقات.',401);
 const ids=[...new Set(new URL(req.url).searchParams.getAll('id'))];
 if(!ids.length||ids.length>600||ids.some(id=>!/^[\w-]{1,100}$/.test(id)))return error('اختيار الطلاب غير صالح. أعد فتح معاينة البطاقات.',400);
 try{
  const students:FileCardStudent[]=[];
  for(let i=0;i<ids.length;i+=80){const part=ids.slice(i,i+80);const result=await env.DB!.prepare(`SELECT id,name,grade,classroom,phone,guardian,active FROM students WHERE active=1 AND id IN (${part.map(()=>'?').join(',')})`).bind(...part).all<FileCardStudent>();students.push(...result.results);}
  if(students.length!==ids.length)return error('تغيّرت قائمة الطلاب. أعد فتح المعاينة وحدّد الطلاب مجددًا.',409);
  const setting=await env.DB!.prepare("SELECT value FROM settings WHERE id='school'").first<{value:string}>();
  const [{createFileCardsPdf},{fileCardAssets}]=await Promise.all([import('../../../lib/student-file-cards-pdf'),import('../../../lib/student-file-cards-assets')]);
  const doc=createFileCardsPdf(fileCardPages(students,new Set(ids)),setting?.value||'',fileCardAssets);
  return new Response(doc.output('arraybuffer'),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="khotwa-student-cards.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }catch{return error('تعذر تجهيز البطاقات. ارجع إلى خطوة وأعد المحاولة.',500);}
}
