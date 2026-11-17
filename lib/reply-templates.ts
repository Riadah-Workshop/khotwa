import {z} from 'zod';
export const REPLY_PREFIX='parentReplyTemplate:';
export const replyTemplateSchema=z.object({id:z.string().uuid(),title:z.string().trim().min(2).max(70),body:z.string().trim().min(5).max(2400),createdAt:z.string().datetime()}).strict();
export type ReplyTemplate=z.infer<typeof replyTemplateSchema>;
export type ReplyContext={studentName:string;grade:string;teacherName?:string};
const greeting='وعليكم السلام ورحمة الله وبركاته،\nولي أمر الطالب {{اسم الطالب}}،';
const signature='\n\nمع تحيات وكيل شؤون الطلاب: {{الوكيل}}\n{{المدرسة}}';
export const REPLY_PRESETS=[
 {id:'received',title:'استلام الرسالة',body:greeting+'\nنشكر تواصلكم وحرصكم على ابنكم. تم الاطلاع على رسالتكم، وسنراجع الموضوع ونوافيكم بما يستجد بإذن الله.'+signature},
 {id:'thanks',title:'شكر وتقدير',body:greeting+'\nنشكر لكم كلماتكم الطيبة وتقديركم لجهود المدرسة ومعلميها. يسعدنا تعاونكم ومشاركتكم، ونسأل الله التوفيق لأبنائنا الطلاب.'+signature},
 {id:'visit',title:'دعوة للحضور',body:greeting+'\nيسعدنا استقبالكم في المدرسة لمناقشة الموضوع ومتابعته معكم. نأمل التواصل معنا لتنسيق وقت الزيارة المناسب. شكرًا لتعاونكم.'+signature},
 {id:'resolved',title:'تمت المعالجة',body:greeting+'\nنفيدكم بأنه تمت متابعة الموضوع واتخاذ الإجراء المناسب بشأنه. نشكر لكم تواصلكم، ويسعدنا استقبال أي ملاحظة إضافية.'+signature},
];
export function replyValues(message:ReplyContext,settings:Record<string,string>){return {'اسم الطالب':message.studentName,'الصف':message.grade,'اسم المعلم':message.teacherName||'المعلم','المدرسة':settings.school||'مدرسة الحرمين الابتدائية بالخبر','الوكيل':settings.deputy||'عايض عوض سعيد القحطاني'};}
export function renderReply(body:string,message:ReplyContext,settings:Record<string,string>){const values=replyValues(message,settings);return body.replace(/\{\{(اسم الطالب|الصف|اسم المعلم|المدرسة|الوكيل)\}\}/g,(_,key)=>values[key as keyof typeof values]);}
export function reusableReply(body:string,message:ReplyContext,settings:Record<string,string>){let result=body;const pairs=Object.entries(replyValues(message,settings)).filter(([key,value])=>value.length>1&&(key!=='اسم المعلم'||!!message.teacherName)).sort((a,b)=>b[1].length-a[1].length);for(const [key,value]of pairs)result=result.split(value).join('{{'+key+'}}');return result;}
export function savedReplyTemplates(settings:Record<string,string>){return Object.entries(settings).filter(([id])=>id.startsWith(REPLY_PREFIX)).map(([id,value])=>{try{const v=replyTemplateSchema.parse(JSON.parse(value));if(REPLY_PREFIX+v.id!==id)throw Error('id');return v;}catch{throw Error('نسخة الردود المحفوظة غير صحيحة');}});}
