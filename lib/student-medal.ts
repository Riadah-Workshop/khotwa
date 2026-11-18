export type MedalStudent={id:string;name:string;grade:string;classroom:string;active:number};
export type MedalAttendance={studentId:string;roundId:string;date:string;status:string;updatedAt:string};
export type MedalRound={id:string;date:string;grade:string;classroom:string;completed:number};
export function medalCandidates<T extends MedalStudent>(students:T[],records:MedalAttendance[],rounds:MedalRound[],cases:{studentId:string;type:string;occurredAt:string;deletedAt?:string}[],from:string,to:string){
 if(!from||!to||from>to)return [];
 const within=(d:string)=>d>=from&&d<=to;
 const scoped=rounds.filter(r=>within(r.date)),approved=new Set(scoped.filter(r=>r.completed).map(r=>r.id));
 const daily=new Map<string,MedalAttendance>();
 for(const r of records){if(!within(r.date)||!approved.has(r.roundId))continue;const key=r.studentId+'|'+r.date,old=daily.get(key);if(!old||r.updatedAt>old.updatedAt||(r.updatedAt===old.updatedAt&&r.status!=='absent'))daily.set(key,r);}
 const blockingCases=cases.filter(c=>{if(c.deletedAt)return false;const d=new Date(c.occurredAt);return Number.isFinite(d.getTime())&&within(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d));});const blocked=new Set(blockingCases.map(c=>c.studentId));
 return students.filter(s=>s.active).map(s=>{const own=[...daily.values()].filter(r=>r.studentId===s.id);const classRounds=scoped.filter(r=>r.grade===s.grade&&r.classroom===s.classroom);const dates=new Set(classRounds.map(r=>r.date));own.forEach(r=>dates.add(r.date));const present=new Set(own.filter(r=>r.status==='present'||r.status==='late').map(r=>r.date));const absent=own.filter(r=>r.status==='absent').length;const late=own.filter(r=>r.status==='late').length;const caseTypes=[...new Set(blockingCases.filter(c=>c.studentId===s.id).map(c=>c.type))];const missing=[...dates].filter(d=>!own.some(r=>r.date===d&&r.status!=='unmarked')).length;const incomplete=classRounds.some(r=>!r.completed);const eligible=dates.size>0&&present.size>0&&!absent&&!late&&!blocked.has(s.id)&&!missing&&!incomplete;return {...s,eligible,days:present.size,absent,late,caseTypes,behavior:blocked.has(s.id),needsReview:!dates.size||!!missing||incomplete||!present.size};});
}
