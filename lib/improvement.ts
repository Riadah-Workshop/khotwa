/** Read-only comparison. Complete attendance provides coverage; missing cases never prove improvement. */
type Student={id:string;name:string;grade:string;classroom:string;active:number};
type RecordRow={studentId:string;roundId:string;date:string;grade:string;classroom:string;status:string};
type Round={id:string;date:string;grade:string;classroom:string;completed:number;total:number};
type CaseRow={studentId:string;type:string;occurredAt:string;deletedAt?:string};
export type ImprovementData={students:Student[];attendance:RecordRow[];attendanceRounds:Round[];cases:CaseRow[]};
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const schoolToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function comparisonWeeks(asOf:string){
 // Sunday–Thursday. Use the last two fully elapsed school weeks, never the current partial week.
 const weekday=new Date(asOf+'T12:00:00Z').getUTCDay();
 const end=shift(asOf,-((weekday+3)%7||7));
 const current=Array.from({length:5},(_,i)=>shift(end,i-4));
 return {previous:current.map(d=>shift(d,-7)),current};
}
export function improvementCandidates(data:ImprovementData,asOf=schoolToday()){
 const periods=comparisonWeeks(asOf),dates=[...periods.previous,...periods.current];
 const rounds=new Map(data.attendanceRounds.map(r=>[r.id,r]));
 const byRound=new Map<string,RecordRow[]>();for(const r of data.attendance){const rows=byRound.get(r.roundId)||[];rows.push(r);byRound.set(r.roundId,rows);}
 const complete=new Set<string>();for(const [id,r] of rounds){const rows=byRound.get(id)||[];if(r.completed===1&&r.total>0&&rows.length===r.total&&new Set(rows.map(x=>x.studentId)).size===rows.length&&rows.every(x=>x.date===r.date&&x.grade===r.grade&&x.classroom===r.classroom&&['present','late','absent'].includes(x.status)))complete.add(id);}
 const lateCases=new Set<string>();for(const c of data.cases){if(c.deletedAt||c.type!=='التأخر الصباحي')continue;const time=new Date(c.occurredAt);if(!Number.isFinite(time.getTime()))continue;const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);lateCases.add(c.studentId+'|'+date);}
 const rowsByStudent=new Map<string,RecordRow[]>();for(const r of data.attendance){if(!dates.includes(r.date))continue;const rows=rowsByStudent.get(r.studentId)||[];rows.push(r);rowsByStudent.set(r.studentId,rows);}
 let eligible=0;const candidates=[];
 for(const student of data.students.filter(s=>s.active)){
  const records=rowsByStudent.get(student.id)||[];
  // Each student must have exactly one present/late record on every day. Absence cannot masquerade as improvement.
  if(dates.some(d=>{const rows=records.filter(r=>r.date===d);return rows.length!==1||!complete.has(rows[0].roundId)||!['present','late'].includes(rows[0].status);}))continue;
  eligible++;
  const count=(days:string[])=>days.filter(d=>records.some(r=>r.date===d&&r.status==='late')||lateCases.has(student.id+'|'+d)).length;
  const before=count(periods.previous),after=count(periods.current);
  if(before>after)candidates.push({student,before,after,reduction:before-after,percent:Math.round(100*(before-after)/before)});
 }
 candidates.sort((a,b)=>b.reduction-a.reduction||b.percent-a.percent||a.student.name.localeCompare(b.student.name,'ar'));
 return {...periods,candidates,eligible,insufficient:data.students.filter(s=>s.active).length-eligible};
}
export type ImprovementCandidate=ReturnType<typeof improvementCandidates>['candidates'][number];
