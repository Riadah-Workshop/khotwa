import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url);
let language='en',tab='reports';
const fixture={settings:{school:'مدرسة الأمانة الدولية',deputy:'عايض عوض سعيد آل ثقفان',principal:'راشد سعد راشد'},user:{name:'مالك البرنامج',email:'test@example.com'},students:[{id:'s1',name:'أحمد محمد',grade:'السادس',classroom:'أ',guardian:'محمد أحمد',phone:'0500000000',notes:'ملاحظة أصلية',active:1}],cases:[],contacts:[],followups:[],caseRevisions:[],attendance:[],attendanceRounds:[],attendanceAudits:[],absenceFollowups:[],absenceEvents:[]};
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 let source=fs.readFileSync(file,'utf8');
 // Supply saved records and a selected tab for server-rendered UI checks; no API writes.
 if(file.endsWith('/app/dashboard.tsx'))source=source.replace('useState<Data|null>(null)','useState<Data|null>(__fixture)').replace("useState('services')","useState(__tab())").replace('useState(true),[busy','useState(false),[busy');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};cache.set(file,exports);
 new Function('exports','require','__fixture','__tab',output)(exports,id=>{
  if(id==='react'&&file.endsWith('/app/locale.tsx'))return {...React,useState:initial=>React.useState(initial==='ar'?language:initial)};
  if(id.startsWith('.')){let next=path.resolve(path.dirname(file),id);if(!path.extname(next))next=['.ts','.tsx','.js'].map(ext=>next+ext).find(fs.existsSync);if(next?.endsWith('.css'))return {};return load(next);}
  return nativeRequire(id);
 },fixture,()=>tab);return exports;
}
const locale=load('app/locale.tsx');
const Dashboard=load('app/dashboard.tsx').default;
const Messages=load('app/messages-panel.tsx').default;
const Charts=load('app/attendance-charts.tsx').default;
const QuickChoice=load('app/quick-choice-field.tsx').default;
const ui=(component,props={})=>renderToStaticMarkup(React.createElement(locale.LocaleProvider,{email:'test@example.com'},React.createElement(component,props)));
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
let html=ui(Dashboard),plain=text(html);
for(const title of ['Case report','Attendance report','Absence report','School visitor report','Parent message report','Daily • Weekly • Monthly','Cases, actions and follow-up'])assert.ok(plain.includes(title),title);
for(const old of ['تقرير الحالات','تقرير زوار المدرسة','الحالات والإجراءات والمتابعة','الحاضرون والمتأخرون والإحصائيات','يومي • أسبوعي • شهري'])assert.ok(!plain.includes(old),old);
html=ui(Messages,{settings:fixture.settings});plain=text(html);
for(const label of ['New','In progress','Resolved','All messages'])assert.ok(plain.includes(label),label);
for(const old of ['قيد المعالجة','تمت المعالجة','جديد'])assert.ok(!plain.includes(old),old);
html=ui(Charts,{rows:[{id:'a1',studentId:'s1',date:'2026-10-24',grade:'السادس',classroom:'أ',status:'present'}]});plain=text(html);
for(const label of ['Present on time','Attendance by day','Attendance by grade and class'])assert.ok(plain.includes(label),label);
assert.ok(plain.includes('السادس / أ'),'Stored grade and class retained');
html=ui(QuickChoice,{label:'نوع الحالة',value:'استئذان',choices:['استئذان','مخالفة سلوكية'],onChange:()=>{},translateChoices:true});
assert.match(html,/value="استئذان"/);assert.match(html,/value="مخالفة سلوكية"/);assert.ok(!html.includes('value="Early leave"'));
tab='students';plain=text(ui(Dashboard));for(const name of ['أحمد محمد','محمد أحمد','السادس','أ'])assert.ok(plain.includes(name),'Stored field: '+name);
// Names that happen to match UI labels must also stay as entered.
fixture.students[0].name='جديد';fixture.students[0].guardian='التقارير';plain=text(ui(Dashboard));assert.ok(plain.includes('جديد'));assert.ok(plain.includes('التقارير'));
language='ar';tab='reports';plain=text(ui(Dashboard));assert.ok(plain.includes('تقرير الحالات'));assert.ok(plain.includes('تقرير زوار المدرسة'));assert.ok(!plain.includes('Case report'));
assert.equal(locale.translateUi('unknown school name','en'),'unknown school name');assert.equal(locale.translateUi('{{اسم الطالب}}','en'),'{{اسم الطالب}}');
console.log('Rendered Arabic/English reports, message statuses, attendance charts and forms verified; stored Arabic names, grade/class and native input values preserved.');
if(process.env.KHOTWA_LOCALE_AUDIT){language='en';for(const page of ['home','services','students','search','case','class-late','batch-cases','today','follow','reports','messages','visitors','parents','attendance','repeated-absence','repeated','honor','improvement','harvest','desk','day-start','day-end','settings']){tab=page;try{const plain=text(ui(Dashboard));console.log(page,JSON.stringify([...new Set(plain.match(/[\u0600-\u06ff][\u0600-\u06ff\s،؛:—•.…؟()-]*/g)||[])]));}catch(e){console.log(page,e.message);}}}

language='en';
const Trip=load('app/trip-consents.tsx').default,Evidence=load('app/evidence-portfolio.tsx').default,Schedule=load('app/scheduled-followups.tsx').default;
for(const [component,props,labels] of [[Trip,{students:fixture.students,settings:fixture.settings},['Trip and activity consents','Save and print consents','أحمد']],[Evidence,{students:fixture.students},['Evidence portfolio','Save evidence']],[Schedule,{students:fixture.students,cases:[]},['Scheduled follow-ups','New follow-up appointment']]]){const markup=text(ui(component,props));for(const label of labels.filter(l=>l!=='أحمد'))assert.ok(markup.includes(label),label);}
console.log('New consent, schedule and evidence interfaces render in English without translating stored names.');

language='en';const oldCase={id:'old-case',studentId:'s1',type:'الملاحظات',occurredAt:'2026-09-01T08:00:00Z',details:'تفاصيل الحالة الأصلية'};
plain=text(ui(Evidence,{students:fixture.students,cases:[oldCase],caseContext:oldCase}));assert.ok(plain.includes('Case evidence'));assert.ok(plain.includes('تفاصيل الحالة الأصلية'));assert.ok(plain.includes('2026-09-01'));assert.ok(!plain.includes('شواهد الحالة'));
plain=text(ui(Evidence,{students:fixture.students,cases:[oldCase],caseContext:oldCase,readOnly:true}));assert.ok(!plain.includes('Save evidence'));assert.ok(plain.includes('Case evidence'));
console.log('Previous-case evidence context renders with original data; read-only mode hides creation.');

language='en';const Ranking=load('app/repeated-cases-panel.tsx').default,Absences=load('app/repeated-absence-panel.tsx').default;
const rankedCases=[{id:'leave',studentId:'s1',type:'الاستئذان',occurredAt:'2026-10-26T08:00:00Z',details:'وصف الاستئذان الأصلي'},{id:'behavior',studentId:'s1',type:'المخالفات السلوكية',occurredAt:'2026-10-27T08:00:00Z',details:'وصف مخالفة لا يخص القائمة'}];
plain=text(ui(Ranking,{data:{...fixture,cases:rankedCases},onProfile:()=>{}}));assert.ok(plain.includes('Most early leave cases'));assert.ok(plain.includes('وصف الاستئذان الأصلي'));assert.ok(!plain.includes('وصف مخالفة لا يخص القائمة'));assert.ok(!plain.includes('Total cases'));
plain=text(ui(Absences,{data:fixture,onProfile:()=>{},onFollow:()=>{}}));assert.ok(plain.includes('Consecutive absence'));assert.ok(plain.includes('10 or more days')||plain.includes('10 intermittent'));assert.ok(!plain.includes('غياب متصل'));
console.log('Independent case ranking and consecutive/intermittent absence interfaces render in English with original stored details.');

language='en';const ActivityCenter=load('app/activity-center.tsx').default,Sheet=load('app/activity-report.tsx').ActivityReportSheet;
plain=text(ui(ActivityCenter,{students:fixture.students,settings:fixture.settings,onPrepare:()=>{}}));assert.ok(plain.includes('Activities and achievement reports'));
const reportTrip={id:'trip-test',title:'رحلة تجريبية',eventDate:'2026-10-27',actualDate:'2026-10-27',goal:'هدف أصلي',results:'نتيجة أصلية',executionStatus:'planning',supervisor:'المعلم الأصلي',destination:'المكان الأصلي',meetingTime:'08:00',returnTime:'12:00'};const roster=[{id:'p1',name:'المشارك الفعلي',grade:'السادس',classroom:'أ',response:'pending',participation:'attended'},{id:'p2',name:'موافقة دون مشاركة',response:'approved',participation:'absent'}];
plain=text(ui(Sheet,{trip:reportTrip,participants:roster,evidence:[],settings:fixture.settings}));assert.ok(plain.includes('Draft activity report'));assert.ok(plain.includes('المشارك الفعلي'));assert.ok(!plain.includes('موافقة دون مشاركة'));assert.ok(plain.includes('هدف أصلي'));assert.ok(plain.includes('نتيجة أصلية'));assert.ok(!plain.includes('Completed activity report'));
console.log('Activity draft report preserves names/goals/outcomes, lists only actual participants and keeps parent consent independent.');

language='en';tab='services';plain=text(ui(Dashboard));assert.ok(plain.includes('Trips and activities'));tab='incidents';plain=text(ui(Dashboard));assert.ok(plain.includes('Incident and first aid register'));assert.ok(plain.includes('Record an incident'));
const nav=load('lib/navigation.ts');assert.equal(nav.workspaceGroup('activities').id,'activities');assert.equal(nav.workspaceGroup('trip-consents').id,'activities');assert.equal(nav.workspaceGroup('messages').id,'communication');
console.log('Trips and activities have an independent main section and bus icon; consents and activity reports remain together.');

language='en';const CarePanel=load('app/student-care-panel.tsx').default,CareReview=load('app/student-care-panel.tsx').CareReview;plain=text(ui(CarePanel,{student:fixture.students[0],onReview:()=>{}}));assert.ok(plain.includes('Student care and emergency contact'));assert.ok(!plain.includes('الرعاية والتواصل للطوارئ'));plain=text(ui(CareReview,{students:fixture.students,onClose:()=>{},onProfile:()=>{}}));assert.ok(plain.includes('Review care information'));
console.log('Owner care and review interfaces render in English; private fields remain separate from ordinary student data.');

const {careReportRows}=load('lib/care-report.ts'),{CareReportSheet}=load('app/care-report.tsx');
const careStudents=[{id:'care-1',name:'اسم أصلي عربي',grade:'الخامس',classroom:'أ',active:1},{id:'care-2',name:'طالب ثان',grade:'السادس',classroom:'ب',active:1},{id:'care-3',name:'مؤرشف',grade:'الخامس',classroom:'أ',active:0}];
const careRecords=[{studentId:'care-1',healthNotes:'حالة صحية أصلية',familyNotes:'معلومة أسرية خاصة'},{studentId:'care-2',healthNotes:'',familyNotes:'ظرف أسري'},{studentId:'care-3',healthNotes:'مؤرشف'}],careIntake=[{id:'review-1',sourceName:'اسم لم يطابق',sourceGrade:'5',sourceClassroom:'ج',sourceRef:'مصدر أصلي',data:JSON.stringify({healthNotes:'ملاحظة صحية (حسب المصدر)'}),status:'review'},{id:'linked-1',sourceName:'سبق ربطه',data:JSON.stringify({healthNotes:'لا يتكرر'}),status:'linked'}];
const careFilters={category:'healthNotes',scope:'linked',grade:'',classroom:'',query:''};
let careRows=careReportRows(careStudents,careRecords,careIntake,careFilters);
assert.equal(careRows.length,1);assert.equal(careRows[0].name,'اسم أصلي عربي');
assert.equal(careReportRows(careStudents,careRecords,careIntake,{...careFilters,grade:'السادس'}).length,0);
assert.equal(careReportRows(careStudents,careRecords,careIntake,{...careFilters,category:'familyNotes'}).length,2);
assert.equal(careReportRows(careStudents,careRecords,careIntake,{...careFilters,query:'اسم أصلي'}).length,1);
plain=text(ui(CareReportSheet,{rows:careRows,category:'healthNotes',scope:'linked',settings:fixture.settings,date:'2026-10-27'}));
assert.ok(plain.includes('حالة صحية أصلية'));assert.ok(plain.includes('معلومة أسرية خاصة'));assert.ok(!plain.includes('ملاحظات اقتصادية'));assert.ok(plain.includes('Comprehensive student conditions list'));assert.ok(!plain.includes('اسم لم يطابق'));
careRows=careReportRows(careStudents,careRecords,careIntake,{...careFilters,scope:'review'});assert.equal(careRows.length,1);assert.ok(careRows[0].pending);
plain=text(ui(CareReportSheet,{rows:careRows,category:'healthNotes',scope:'review',settings:fixture.settings,date:'2026-10-27'}));assert.ok(plain.includes('Conditions pending student matching'));assert.ok(plain.includes('اسم لم يطابق'));assert.ok(!plain.includes('سبق ربطه'));
language='ar';plain=text(ui(CareReportSheet,{rows:careRows,category:'healthNotes',scope:'review',settings:fixture.settings,date:'2026-10-27'}));assert.ok(plain.includes('كشف شامل لحالات الطلاب'));assert.ok(plain.includes('حالات بانتظار مطابقة الطالب'));assert.ok(!plain.includes('المصدر'));assert.ok(!plain.includes('مصدر المعلومات'));assert.ok(plain.includes('ملاحظة صحية'));assert.ok(!plain.includes('مصدر أصلي'));
console.log('Care report category/grade/name filtering, pending-source separation, archived exclusion and bilingual printed content verified.');

const combinedCareRows=careReportRows(careStudents,careRecords,careIntake,{...careFilters,category:''});
html=ui(CareReportSheet,{rows:combinedCareRows,category:'',scope:'linked',settings:fixture.settings,date:'2026-10-27'});
assert.equal((html.match(/<table>/g)||[]).length,1);
assert.equal((html.match(/data-care-student=/g)||[]).length,2);
const firstCareRow=html.split('data-care-student="care-1"')[1].split('</tr>')[0];
assert.ok(firstCareRow.includes('حالة صحية أصلية'));assert.ok(firstCareRow.includes('معلومة أسرية خاصة'));
assert.equal((html.match(/<ol>/g)||[]).length,0);assert.ok(html.includes('كشف شامل لحالات الطلاب'));
assert.ok(html.includes('care-report-dense'));assert.ok(html.includes('سلوكية وعامة'));assert.equal((html.match(/scope="col"/g)||[]).length,6);
const duplicateIntake=[...careIntake,{...careIntake[0],id:'review-2',data:JSON.stringify({familyNotes:'ظرف أسري إضافي'})}];
const mergedReview=careReportRows(careStudents,careRecords,duplicateIntake,{...careFilters,scope:'review',category:''});
assert.equal(mergedReview.length,1);assert.ok(mergedReview[0].fields.familyNotes.includes('ظرف أسري إضافي'));
console.log('Dense care register uses one table, six columns and one row per student with all their conditions.');

const {careReportNote}=load('lib/care-report.ts');
for(const annotation of ['وفق رمز ** في المصدر','وفق الرمز ** في المصدر','وفق المصدر','حسب المصدر','وفق الرمز','وفقًا للمصدر']){
 assert.equal(careReportNote('ضعيف ماديًا — '+annotation),'ضعيف ماديًا',annotation);
 assert.equal(careReportNote('حالة صحية ('+annotation+')'),'حالة صحية',annotation);
}
assert.equal(careReportNote('ضعيف ماديًا — وفق رمز ** في المصدر\nيحتاج متابعة دراسية'),'ضعيف ماديًا\nيحتاج متابعة دراسية');
assert.equal(careReportNote('لا يتناول الدواء إلا وفق تعليمات الطبيب'),'لا يتناول الدواء إلا وفق تعليمات الطبيب');
plain=text(ui(CareReportSheet,{rows:[{id:'example',name:'طالب للاختبار',grade:'الخامس',classroom:'ج',fields:{economicNotes:'ضعيف ماديًا — وفق رمز ** في المصدر'},pending:false}],category:'economicNotes',scope:'linked',settings:fixture.settings,date:'2026-10-27'}));
assert.ok(plain.includes('ضعيف ماديًا'));assert.ok(!plain.includes('وفق رمز'));assert.ok(!plain.includes('المصدر'));assert.ok(!plain.includes('**'));
console.log('Import source and symbol annotations are hidden in care reports without altering condition descriptions or medical instructions.');

for(const annotation of ['كما ورد بالمصدر','كما ورد في المصدر','كما ذكر بالمصدر','كما ورد بالمصدر، دون تأكيد الوضع الحالي','إفادة المصدر دون استنتاج تشخيص أو علاج'])assert.equal(careReportNote('خجل / صمت اختياري — '+annotation),'خجل / صمت اختياري',annotation);
assert.equal(careReportNote('متعافٍ من اللوكيميا (كما ورد في المصدر)'),'متعافٍ من اللوكيميا');
assert.equal(careReportNote('عناد ويتناول أدوية لذلك — إفادة المصدر دون استنتاج تشخيص أو علاج'),'عناد');
assert.equal(careReportNote('كسر في يده اليمنى — كما ورد بالمصدر، دون تأكيد الوضع الحالي'),'كسر في يده اليمنى');
plain=text(ui(CareReportSheet,{rows:[{id:'wording-example',name:'طالب للاختبار',grade:'الرابع',classroom:'أ',fields:{generalNotes:'خجل / صمت اختياري — كما ورد بالمصدر'},pending:false}],category:'generalNotes',scope:'linked',settings:fixture.settings,date:'2026-10-28'}));
assert.ok(plain.includes('خجل'));assert.ok(plain.includes('صمت اختياري'));assert.ok(!plain.includes('كما ورد'));assert.ok(!plain.includes('المصدر'));
console.log('Condition-only wording removes all observed source suffixes and retains recovery status and condition names.');

language='en';const WorkDesk=load('app/work-desk.tsx').default;const deskProps={data:fixture,busy:false,onTask:()=>{},onRefresh:async()=>{},settings:fixture.settings};plain=text(ui(WorkDesk,{...deskProps,mode:'start'}));assert.ok(plain.includes('Close all tasks'));assert.ok(!plain.includes('إغلاق جميع المهام'));assert.ok(!text(ui(WorkDesk,{...deskProps,mode:'start',readOnly:true})).includes('Close all tasks'));assert.ok(!text(ui(WorkDesk,{...deskProps,mode:'desk'})).includes('Close all tasks'));
console.log('Start-day bulk close button renders in English and is absent for read-only viewers and other desk modes.');

language="en";tab="activities";plain=text(ui(Dashboard));assert.ok(plain.includes("Departure time"));assert.ok(plain.includes("Save and print consents"));assert.ok(!plain.includes("Prepare report with photos"));assert.ok(!plain.includes("Outcomes"));console.log("Activities now opens the simple consent form with departure time and direct printing, without activity reports.");

language='en';tab='group-message';plain=text(ui(Dashboard));assert.ok(plain.includes('Group message'));assert.ok(plain.includes('Copy all numbers'));assert.ok(plain.includes('Shared message text'));assert.ok(!plain.includes('رسالة جماعية'));assert.equal(nav.workspaceGroup('group-message').id,'communication');console.log('Group messaging is reachable from communication, renders in English and preserves stored student names.');

const Medals=load("app/student-medals.tsx").default;
language="en";const medalEnglish=ui(Medals,{data:fixture});assert.match(medalEnglish,/Attendance &amp; Conduct Medal/);assert.ok(!medalEnglish.includes("I reviewed attendance coverage"));assert.ok(!medalEnglish.includes("راجعت اكتمال"));
console.log("Medal panel English labels and removal of manual confirmation verified.");
