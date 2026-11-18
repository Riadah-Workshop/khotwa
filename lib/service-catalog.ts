import {UI_EN} from './ui-translations';
import {WORKSPACE_GROUPS} from './navigation';
export const SERVICE_CATALOG=[
 {id:'student-movements',label:'القبول والنقل',keywords:'قبول الطلاب الجدد نقل من إلى المدرسة admissions incoming outgoing transfer'},
 {id:'compatibility',label:'اختبارات توافق خطوة',keywords:'iPhone Safari iOS Apple اختبار توافق مخاطر طباعة'},
 {id:'platform-papers',label:'متابعة أوراق عدم التفاعل بالمنصة',keywords:'منصة أوراق توقيع موقعة أعيدت لم تعد متابعة'},
 {id:'incidents',label:'سجل الوقائع والإسعافات',keywords:'سقوط إصابة حادث إسعاف هلال أحمر مستشفى محضر واقعة incident injury first aid'},
 {id:'activities',label:'الأنشطة وتقارير الإنجاز',keywords:'نشاط مشروع رحلة مشاركة تنفيذ إنجاز تقرير شواهد صور activities projects trips achievement report'},
 {id:'trip-consents',label:'موافقات الرحلات والأنشطة',keywords:'موافقات رحلة نشاط ولي أمر طباعة موافق غير موافق whatsapp trip consent permission print'},
 {id:'evidence',label:'ملف الشواهد',keywords:'شواهد مرفقات مستندات صور تقارير ملف إنجاز evidence portfolio attachments documents'},
 {id:'home',label:'الرئيسية',keywords:'ملخص مؤشرات اليوم'},
 {id:'desk',label:'مساعد الوكيل',keywords:'تنبيهات مهام متابعة لم تعالج معلق'},
 {id:'day-start',label:'ابدأ يومي',keywords:'بداية اليوم الاشعارات'},
 {id:'day-end',label:'أغلق يومي',keywords:'نهاية اليوم مدير ملخص'},
 {id:'search',label:'البحث عن طالب',keywords:'ملف الطالب اسم جوال'},
 {id:'students',label:'دليل الطلاب',keywords:'إدارة إضافة تعديل بيانات ارشفة'},
 {id:'file-cards',label:'ملصقات ملفات الطلاب',keywords:'اسم مدرسة طباعة ستيكر'},
 {id:'barcodes',label:'بطاقات الباركود',keywords:'كود بطاقة حضور طباعة'},
 {id:'attendance',label:'الحضور والغياب',keywords:'حصر غائبون تأخر رصد مسح باركود إشعار'},
 {id:'class-late',label:'التأخر عن دخول الحصة',keywords:'إذن دخول حصص طباعة'},
 {id:'repeated-absence',label:'متكررو الغياب',keywords:'تكرار غائب متابعة'},
 {id:'case',label:'تسجيل حالة',keywords:'استئذان إذن خروج تأخر صباحي مخالفة سلوك إيجابي تعهد تواصل'},
 {id:'batch-cases',label:'تسجيل جماعي',keywords:'مجموعة حالات تأخر طباعة'},
 {id:'today',label:'حالات اليوم',keywords:'يومية اجراءات'},
 {id:'follow',label:'متابعة الطلاب',keywords:'نتيجة معالجة إغلاق إجراء'},
 {id:'repeated',label:'متكررو الحالات',keywords:'تكرار سلوك مخالفة الأكثر استئذان تأخر صباحي تواصل ترتيب مستقل ranking leave late behavior contact'},
 {id:'messages',label:'رسائل أولياء الأمور',keywords:'شكاوى استفسارات طلبات ردود واتساب تواصل'},
 {id:'visitors',label:'زوار المدرسة',keywords:'زيارة بوابة استقبال ولي الأمر'},
 {id:'parents',label:'بوابة ولي الأمر',keywords:'حسابات أسرة تفعيل أبناء'},
 {id:'reports',label:'التقارير',keywords:'طباعة يومي أسبوعي شهري إحصائيات تصدير'},
 {id:'harvest',label:'حصاد خطوة',keywords:'إنجاز أعمال ملخص'},
 {id:'honor',label:'مرشحو التكريم',keywords:'شهادة طلاب منتظمون وسام أوسمة الحضور الانضباط'},
 {id:'improvement',label:'بطل التحسّن',keywords:'تحسن شهادة تشجيع'},
 {id:'settings',label:'الإعدادات والنسخ الاحتياطي',keywords:'استعادة نسخة مدرسة مستخدم تطبيق حجم الخط'},
] as const;
export type ServiceId=typeof SERVICE_CATALOG[number]['id'];
export type TextSize='normal'|'medium'|'large';
export type WorkspacePreferences={favorites:ServiceId[];recent:ServiceId[];textSize:TextSize};
export const DEFAULT_PREFERENCES:WorkspacePreferences={favorites:['search','attendance','case','messages'],recent:[],textSize:'medium'};
export function serviceById(id:string){return SERVICE_CATALOG.find(item=>item.id===id);}
export function normalizeServiceSearch(text:string){return text.normalize('NFKC').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F\u0670\u0640]/g,'').toLowerCase().trim();}
export function searchServices(query:string,language:'ar'|'en'='ar'){const words=normalizeServiceSearch(query).split(/\s+/).filter(Boolean);return SERVICE_CATALOG.filter(item=>{const group=WORKSPACE_GROUPS.find(g=>(g.pages as readonly string[]).includes(item.id));const text=normalizeServiceSearch(item.label+' '+item.keywords+' '+(group?.label||'')+' '+(UI_EN[item.label]||'')+' '+(UI_EN[group?.label||'']||'')+' '+(SERVICE_EN_KEYWORDS[item.id]||''));return words.every(word=>text.includes(word));});}
export function parsePreferences(raw:string|null):WorkspacePreferences{
 if(!raw)return {...DEFAULT_PREFERENCES,favorites:[...DEFAULT_PREFERENCES.favorites],recent:[]};
 try{const data=JSON.parse(raw);const clean=(v:unknown,max:number)=>Array.isArray(v)?[...new Set(v.filter((x):x is ServiceId=>typeof x==='string'&&!!serviceById(x)))].slice(0,max):[];return {favorites:Array.isArray(data.favorites)?clean(data.favorites,4):[...DEFAULT_PREFERENCES.favorites],recent:clean(data.recent,3),textSize:['normal','medium','large'].includes(data.textSize)?data.textSize:'medium'};}catch{return parsePreferences(null);}
}
export function recentWithVisit(recent:ServiceId[],page:string):ServiceId[]{return serviceById(page)?[page as ServiceId,...recent.filter(id=>id!==page)].slice(0,3):recent;}

const SERVICE_EN_KEYWORDS:Record<string,string>={case:'leave permission early departure late morning behavior undertaking warning contact incident',attendance:'absence absent attendance register scan barcode late',desk:'tasks notifications pending followup assistant schedule due appointment overdue موعد مواعيد متابعة',messages:'complaints inquiries questions reply whatsapp parent',settings:'restore backup language font size school settings',parents:'family children login accounts password',honor:'awards medal badge attendance conduct certificate recognition',improvement:'progress improvement punctuality',visitors:'visitor visit entry exit gate reception'};
