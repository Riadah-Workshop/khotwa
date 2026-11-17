import {CARE_FIELDS} from './student-care';
export type CareReportRow={id:string;studentId?:string;name:string;grade:string;classroom:string;fields:Record<string,string>;pending:boolean;sourceRef?:string};
export function careReportRows(students:any[],records:any[],intake:any[],filters:{category:string;scope:string;grade:string;classroom:string;query:string}):CareReportRow[]{
 const byId=new Map(students.map(s=>[s.id,s]));
 const rawRows:CareReportRow[]=filters.scope==='review'?intake.filter(r=>r.status==='review').map(r=>{let fields={};try{fields=JSON.parse(r.data)}catch{}return {id:r.id,name:r.sourceName,grade:r.sourceGrade,classroom:r.sourceClassroom,fields,pending:true,sourceRef:r.sourceRef}}):records.flatMap(r=>{const s=byId.get(r.studentId);return s&&s.active?[{id:r.studentId,studentId:r.studentId,name:s.name,grade:s.grade,classroom:s.classroom,fields:r,pending:false}]:[]});
 const grouped=new Map<string,CareReportRow>();
 for(const r of rawRows){const key=r.pending?JSON.stringify([r.name.trim(),r.grade,r.classroom]):r.studentId||r.id;const existing=grouped.get(key);if(!existing){grouped.set(key,{...r,fields:{...r.fields}});continue;}for(const k of CARE_FIELDS){const descriptions=[existing.fields[k],r.fields[k]].flatMap(v=>careReportNote(v).split('\n')).filter(Boolean);existing.fields[k]=[...new Set(descriptions)].join('\n');}}
 const rows=[...grouped.values()];
 const normalize=(v:string)=>String(v||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').trim().toLocaleLowerCase();
 return rows.filter(r=>CARE_FIELDS.some(k=>(!filters.category||k===filters.category)&&String(r.fields[k]||'').trim())&&(!filters.grade||r.grade===filters.grade)&&(!filters.classroom||r.classroom===filters.classroom)&&normalize(r.name).includes(normalize(filters.query))).sort((a,b)=>a.grade.localeCompare(b.grade,'ar',{numeric:true})||a.classroom.localeCompare(b.classroom,'ar')||a.name.localeCompare(b.name,'ar'));
}

// Hide import annotations in reports while retaining the original private record.
export function careReportNote(value:string){
 return String(value||'').split('\n').map(line=>line
  .replace(/[ \t]*[—–-][ \t]*(?:(?:كما|مثلما)[ \t]+(?:ورد|وردت|ذكر|ذُكر)[ \t]+(?:بالمصدر|في[ \t]+المصدر)|إفادة[ \t]+المصدر)[^\n]*$/g,'')
  .replace(/[（(][ \t]*(?:كما|مثلما)[ \t]+(?:ورد|وردت|ذكر|ذُكر)[ \t]+(?:بالمصدر|في[ \t]+المصدر)[^）)\n]*[）)]/g,'')
  .replace(/(?:[ \t]*[—–-][ \t]*)?[（(]?[ \t]*(?:حسب|بحسب|وفق(?:ًا)?|وفقا(?:ً)?)[ \t]+(?:(?:الرمز|رمز)[ \t]*[*✱★]*(?:[ \t]+في[ \t]+المصدر)?|(?:المصدر|للمصدر))[ \t]*[）)]?/g,'')
  .replace(/[（(][ \t]*[）)]/g,'')
  .replace(/[ \t]{2,}/g,' ')
  .replace(/^[ \t]*[—–-][ \t]*|[ \t]*[—–-][ \t]*$/g,'').trim()
  .replace(/^عناد ويتناول أدوية لذلك$/,'عناد')
 ).filter(Boolean).join('\n');
}

export function careConditionList(fields:Record<string,string>){return [...new Set(CARE_FIELDS.flatMap(k=>careReportNote(fields[k]).split(/\n|\s+\/\s+/)).map(s=>s.trim()).filter(Boolean))];}
