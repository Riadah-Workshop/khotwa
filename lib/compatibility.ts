import {z} from 'zod';
export const statuses=['لم يُختبر','ناجح','يحتاج مراجعة','غير مكتمل'] as const;
export const checks=[
 ['وضوح النصوص العربية','Arabic readability','افحص اتجاه الكتابة، اتصال الحروف، التكبير وعدم قص النص.','Check RTL, letter shaping, zoom and clipping.'],
 ['تباين الألوان','Color contrast','اقرأ النصوص والتنبيهات في الوضعين وعلى الشاشة الفعلية.','Read text and alerts in both themes on the device.'],
 ['الأزرار','Buttons','جرّب اللمس والتركيز والحالات المعطلة ونتيجة الإجراء.','Test taps, focus, disabled states and action results.'],
 ['الشعارات والأيقونات','Logos and icons','تحقق من الظهور والحدة والتباين دون تشوه.','Check visibility, sharpness and contrast.'],
 ['النماذج','Forms','اختبر الإدخال ولوحة المفاتيح والتحقق والحفظ وإعادة الفتح.','Test input, keyboard, validation, saving and reopening.'],
 ['الجداول','Tables','افحص التمرير والعناوين والبيانات في الاتجاهين.','Check scrolling, headers and data in both orientations.'],
 ['الطباعة','Printing','عاين A4 وحفظ PDF وتأكد من الهوية وعدم قص الأعمدة.','Preview A4/PDF, branding and unclipped columns.'],
 ['الوضع الفاتح والداكن','Light and dark modes','بدّل الوضعين وأعد فتح الصفحة وافحص النصوص وعناصر النماذج.','Switch themes, reopen and inspect text and controls.']
] as const;
const url=z.string().max(2000).refine(v=>!v||/^https?:\/\//i.test(v),'رابط غير صالح');
export const runSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive().optional(),device:z.string().trim().min(1).max(120),ios:z.string().trim().min(1).max(80),safari:z.string().trim().min(1).max(80),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),tester:z.string().trim().min(1).max(120),context:z.enum(['Safari','الشاشة الرئيسية']),notes:z.string().max(5000),official:url.refine(v=>{if(!v)return true;try{const h=new URL(v).hostname;return h==='apple.com'||h.endsWith('.apple.com')||h==='webkit.org'||h.endsWith('.webkit.org')}catch{return false}},'استخدم رابط Apple أو WebKit الرسمي'),technical:z.string().max(5000),items:z.array(z.object({status:z.enum(statuses),notes:z.string().max(3000),evidence:url})).length(8)}).superRefine((v,c)=>{v.items.forEach((i,n)=>{if(i.status==='ناجح'&&(!i.notes.trim()||!i.evidence))c.addIssue({code:'custom',path:['items',n],message:'النجاح يحتاج ملاحظة تجربة ورابط شاهد'});});});
export type Run=z.infer<typeof runSchema>;
export function result(r:Run){const s=r.items.map(i=>i.status);return s.includes('يحتاج مراجعة')?'يحتاج مراجعة':s.every(x=>x==='ناجح')?'ناجح':s.every(x=>x==='لم يُختبر')?'لم يُختبر':'غير مكتمل';}
