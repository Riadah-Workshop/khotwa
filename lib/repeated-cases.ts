import {blocksHonor} from './honor-candidates';
export type RepeatedCase={id:string;studentId:string;type:string;occurredAt:string;deletedAt?:string;extra?:string;details?:string;action?:string};
export type RepeatedStudent={id:string;name:string;grade:string;classroom:string;active:number;phone?:string;notes?:string};
export function repetitionCategory(c:RepeatedCase){
 if(c.deletedAt)return null;
 if(c.type==='الملاحظات')return 'notes';
 if(!blocksHonor(c))return null;
 return c.type==='المخالفات السلوكية'?'behavior':(c.type==='التأخر الصباحي'||c.type==='التأخر عن دخول الحصة')?'late':c.type==='الاستئذان'?'permission':c.type==='التواصل مع ولي الأمر'?'contact':'summons';
}
export function repeatedStudents<T extends RepeatedStudent>(students:T[],cases:RepeatedCase[],threshold=4){
 const byStudent=new Map<string,RepeatedCase[]>(),seen=new Set<string>();
 for(const c of cases){if(seen.has(c.id)||!repetitionCategory(c))continue;seen.add(c.id);if(!byStudent.has(c.studentId))byStudent.set(c.studentId,[]);byStudent.get(c.studentId)!.push(c);}
 return students.filter(s=>s.active).map(s=>{
  const records=(byStudent.get(s.id)||[]).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
  const counts={behavior:0,late:0,permission:0,contact:0,summons:0,notes:0},typeCounts=new Map<string,number>();
  for(const c of records){const category=repetitionCategory(c) as keyof typeof counts;counts[category]++;if(category==='notes')continue;const type=category==='summons'?'استدعاء ولي الأمر':c.type;typeCounts.set(type,(typeCounts.get(type)||0)+1);}
  const repeatedTypes=[...typeCounts].filter(([,count])=>count>=threshold).map(([type,count])=>({type,count})).sort((a,b)=>b.count-a.count||a.type.localeCompare(b.type,'ar'));
  const total=[...typeCounts.values()].reduce((sum,count)=>sum+count,0);
  return {...s,records,counts,total,repeatedTypes,maxRepeat:repeatedTypes[0]?.count||0,lastCase:records.find(c=>repetitionCategory(c)!=='notes')?.occurredAt||''};
 }).filter(s=>s.repeatedTypes.length>0).sort((a,b)=>b.maxRepeat-a.maxRepeat||b.total-a.total||a.name.localeCompare(b.name,'ar'));
}

// Each ranking counts exactly one category; unrelated records never break ties.
export const CASE_RANKINGS=[
 {type:'الاستئذان',label:'الأكثر استئذانًا',notify:true},
 {type:'التأخر الصباحي',label:'الأكثر تأخرًا صباحيًا',notify:true},
 {type:'التأخر عن دخول الحصة',label:'الأكثر تأخرًا عن الحصة',notify:true},
 {type:'المخالفات السلوكية',label:'الأكثر مخالفات سلوكية',notify:true},
 {type:'التواصل مع ولي الأمر',label:'الأكثر تواصلًا مع ولي الأمر',notify:true},
 {type:'استدعاء ولي الأمر',label:'الأكثر استدعاءً لولي الأمر',notify:true},
 {type:'زيارة ولي الأمر',label:'الأكثر زيارات لولي الأمر',notify:false},
 {type:'السلوك الإيجابي',label:'الأكثر سلوكًا إيجابيًا',notify:false},
 {type:'الملاحظات',label:'الأكثر ملاحظات',notify:false},
] as const;
export type CaseRankingType=typeof CASE_RANKINGS[number]['type'];
export function rankingCaseType(c:RepeatedCase):string|null{
 if(c.deletedAt)return null;
 if(c.type==='استدعاء ولي الأمر'||c.type==='استدعاء ولي أمر'||(c.type==='زيارة ولي الأمر'&&blocksHonor(c)))return 'استدعاء ولي الأمر';
 return CASE_RANKINGS.some(r=>r.type===c.type)?c.type:null;
}
export function studentsByCaseType<T extends RepeatedStudent>(students:T[],cases:RepeatedCase[],type:CaseRankingType,filters:{grade?:string;classroom?:string;query?:string;from?:string;to?:string;threshold?:number}={}){
 const normalize=(value:string)=>value.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064b-\u065f]/g,'').toLowerCase();
 const byStudent=new Map<string,RepeatedCase[]>(),seen=new Set<string>();
 for(const c of cases){if(seen.has(c.id)||rankingCaseType(c)!==type)continue;seen.add(c.id);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(c.occurredAt));if((filters.from&&date<filters.from)||(filters.to&&date>filters.to))continue;const records=byStudent.get(c.studentId)||[];records.push(c);byStudent.set(c.studentId,records);}
 const threshold=Math.max(1,filters.threshold||1);
 return students.filter(s=>s.active&&(!filters.grade||s.grade===filters.grade)&&(!filters.classroom||s.classroom===filters.classroom)&&normalize(s.name).includes(normalize(filters.query||''))).map(s=>{const records=[...(byStudent.get(s.id)||[])].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));return {...s,records,count:records.length,lastCase:records[0]?.occurredAt||'',repeatedTypes:[{type,count:records.length}]};}).filter(s=>s.count>=threshold).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ar')||a.id.localeCompare(b.id));
}
export function caseRankingCsv(rows:{name:string;grade:string;classroom:string;count:number;lastCase:string}[],type:string,from='',to=''){
 const cell=(v:unknown)=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';};
 return '\uFEFF'+[['الترتيب','اسم الطالب','الصف','الفصل','نوع الحالة','عدد الحالات من هذا النوع','آخر حالة من هذا النوع','من تاريخ','إلى تاريخ'],...rows.map((s,i)=>[i+1,s.name,s.grade,s.classroom,type,s.count,s.lastCase,from,to])].map(r=>r.map(cell).join(',')).join('\r\n');
}
