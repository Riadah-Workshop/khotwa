export function repeatedAbsence<T extends {id:string;name:string;grade:string;classroom:string;active:number}>(students:T[],records:{studentId:string;roundId:string;date:string;status:string;updatedAt:string}[],rounds:{id:string;completed:number}[],threshold=3,from='',to=''){
 const approved=new Set(rounds.filter(r=>r.completed).map(r=>r.id)),daily=new Map<string,typeof records[number]>();
 for(const r of records){if(!approved.has(r.roundId)||r.status==='unmarked'||(from&&r.date<from)||(to&&r.date>to))continue;const key=r.studentId+'|'+r.date,old=daily.get(key);if(!old||r.updatedAt>old.updatedAt||(r.updatedAt===old.updatedAt&&r.status!=='absent'))daily.set(key,r);}
 return students.filter(s=>s.active).map(s=>({...s,dates:[...daily.values()].filter(r=>r.studentId===s.id&&r.status==='absent').map(r=>r.date).sort()})).filter(s=>s.dates.length>=threshold).sort((a,b)=>b.dates.length-a.dates.length||a.name.localeCompare(b.name,'ar'));
}

export type AbsenceRecord={studentId:string;roundId:string;date:string;status:string;updatedAt:string};
export function sortAbsencePatterns<T extends {name:string;total:number;longest:number}>(rows:T[]){return [...rows].sort((a,b)=>b.total-a.total||b.longest-a.longest||a.name.localeCompare(b.name,'ar'));}
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function nextSchoolDay(day:string){const date=new Date(day+'T12:00:00Z');do{date.setUTCDate(date.getUTCDate()+1);}while([5,6].includes(date.getUTCDay()));return date.toISOString().slice(0,10);}
export function absencePatterns<T extends {id:string;name:string;active:number}>(students:T[],records:AbsenceRecord[],rounds:{id:string;completed:number}[],from='',to=''){
 const approved=new Set(rounds.filter(r=>r.completed).map(r=>r.id)),daily=new Map<string,AbsenceRecord>();
 for(const r of records){if(!approved.has(r.roundId)||!validDate(r.date)||(from&&r.date<from)||(to&&r.date>to)||[5,6].includes(new Date(r.date+'T12:00:00Z').getUTCDay()))continue;const key=r.studentId+'|'+r.date,old=daily.get(key);if(!old||r.updatedAt>old.updatedAt||(r.updatedAt===old.updatedAt&&r.status!=='absent'))daily.set(key,r);}
 return students.filter(s=>s.active).map(s=>{const dates=[...daily.values()].filter(r=>r.studentId===s.id&&r.status==='absent').map(r=>r.date).sort();let run:string[]=[],longestDates:string[]=[];for(const date of dates){run=run.length&&nextSchoolDay(run.at(-1)!)===date?[...run,date]:[date];if(run.length>=longestDates.length)longestDates=[...run];}return {...s,dates,total:dates.length,longest:longestDates.length,longestDates,consecutive:longestDates.length>=3,intermittent:dates.length>=10,lastAbsent:dates.at(-1)||''};});
}
// Trusted SQL fragment shared by transactional attendance follow-up creation.
export function absenceQualificationSql(studentExpression:string){
 const approved=(alias:string)=>`${alias}.status='absent' AND strftime('%w',${alias}.date) NOT IN ('5','6') AND EXISTS(SELECT 1 FROM attendance_rounds rr WHERE rr.id=${alias}.round_id AND rr.completed=1)`;
 const previous=(alias:string)=>`date(${alias}.date,CASE WHEN strftime('%w',${alias}.date)='0' THEN '-3 days' ELSE '-1 day' END)`;
 return `((SELECT COUNT(DISTINCT aa.date) FROM attendance aa WHERE aa.student_id=${studentExpression} AND ${approved('aa')})>=10 OR EXISTS(SELECT 1 FROM attendance a JOIN attendance b ON b.student_id=a.student_id AND b.date=${previous('a')} JOIN attendance c ON c.student_id=a.student_id AND c.date=${previous('b')} WHERE a.student_id=${studentExpression} AND ${approved('a')} AND ${approved('b')} AND ${approved('c')}))`;
}
