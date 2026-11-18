import {absencePatterns} from './repeated-absence';
import {type NotificationEvent} from './attendance-notifications';
import {riyadhDay} from './period-reports';
export type DeskMessage={id:string;studentName:string;teacherName?:string;senderRole?:string;phone?:string;grade:string;kind:string;details:string;status:string;notes:string;createdAt:string;updatedAt:string;actor:string;revision:number;attachmentKey?:string};
export type DeskTask={id:string;kind:'message'|'thanks'|'follow'|'case-notify'|'absence-notify'|'absence-follow';recordId:string;version?:string;studentId?:string;title:string;detail:string;at:string;phoneMissing?:boolean};
type Case={id:string;studentId:string;type:string;details:string;occurredAt:string;followStatus:string;revision?:number;updatedAt?:string;deletedAt?:string};
type Attendance={id:string;studentId:string;date:string;name:string;grade:string;classroom:string;status:string;updatedAt:string;roundId?:string};
type Student={id:string;name:string;phone:string;active:number};
type MessageEvent={messageId:string;kind?:string;status:string;at:string};
export type DeskData={deskClosures?:{taskId:string;version:string;kind:string;recordId:string;outcome:string;actor:string;createdAt:string}[];attendanceRounds?:{id:string;completed:number}[];students:Student[];cases:Case[];contacts:{caseId:string;status:string;createdAt:string}[];followups:{caseId:string;status:string;createdAt:string}[];attendance:Attendance[];absenceFollowups:{studentId:string;status:string;lastAbsent:string;totalCount:number;updatedAt:string}[];absenceEvents:NotificationEvent[]};
export const DESK_LABELS:Record<DeskTask['kind'],string>={'message':'رسائل أولياء الأمور','thanks':'شكر المعلّمين','follow':'متابعة الحالات','case-notify':'إشعارات حالات اليوم','absence-notify':'إشعارات غياب اليوم','absence-follow':'متابعة الغياب'};
const phoneReady=(s:Student|undefined)=>{let p=s?.phone?.replace(/\D/g,'')||'';if(p.startsWith('00'))p=p.slice(2);if(p.startsWith('05'))p='966'+p.slice(1);return /^\d{9,15}$/.test(p);};
const day=(s:string)=>Number.isFinite(Date.parse(s))?riyadhDay(new Date(s)):'';
export function buildWorkDesk(data:DeskData,messages:DeskMessage[],events:MessageEvent[],now=new Date(),ui:(text:string)=>string=text=>text){
 const today=riyadhDay(now),students=new Map(data.students.map(s=>[s.id,s])),activeCases=new Map(data.cases.filter(c=>!c.deletedAt).map(c=>[c.id,c])),tasks:DeskTask[]=[];
 const sentCases=new Set(data.contacts.filter(e=>e.status==='sent').map(e=>e.caseId));
 const attendanceById=new Map(data.attendance.map(r=>[r.id,r]));
 const sentAttendance=new Set<string>();for(const e of data.absenceEvents)if(e.kind==='attendance-notification-sent')try{const p=JSON.parse(e.notes),r=attendanceById.get(p.attendanceId);if(r&&r.studentId===e.studentId&&r.date===p.date)sentAttendance.add(r.id);}catch{}
 for(const c of activeCases.values()){
  const s=students.get(c.studentId);if(c.followStatus==='open')tasks.push({id:'follow:'+c.id,kind:'follow',recordId:c.id,studentId:c.studentId,title:s?.name||ui('طالب من السجل'),detail:ui(c.type)+' • '+c.details,at:c.occurredAt});
  if(c.followStatus!=='done'&&day(c.occurredAt)===today&&!sentCases.has(c.id))tasks.push({id:'case-notify:'+c.id,kind:'case-notify',recordId:c.id,studentId:c.studentId,title:s?.name||ui('طالب من السجل'),detail:ui(c.type),at:c.occurredAt,phoneMissing:!phoneReady(s)});
 }
 for(const r of attendanceById.values())if(r.date===today&&r.status==='absent'&&!sentAttendance.has(r.id))tasks.push({id:'absence-notify:'+r.id,kind:'absence-notify',recordId:r.id,studentId:r.studentId,title:r.name,detail:r.grade+' / '+r.classroom+' • '+ui('غياب اليوم'),at:r.updatedAt,phoneMissing:!phoneReady(students.get(r.studentId))});
 const eligibleAbsence=new Set(absencePatterns(data.students,data.attendance.map(r=>({...r,roundId:r.roundId||''})),data.attendanceRounds||[]).filter(s=>s.consecutive||s.intermittent).map(s=>s.id));
 for(const f of data.absenceFollowups){const s=students.get(f.studentId);if(f.status==='open'&&s&&eligibleAbsence.has(f.studentId))tasks.push({id:'absence-follow:'+f.studentId,kind:'absence-follow',recordId:f.studentId,studentId:f.studentId,title:s.name,detail:ui('إجمالي الغياب: ')+f.totalCount+' • '+ui('آخر غياب: ')+f.lastAbsent,at:f.updatedAt});}
 const byMessage=new Map(messages.map(m=>[m.id,m]));for(const m of byMessage.values())if(m.status==='new'||m.status==='processing')tasks.push({id:'message:'+m.id,kind:(m.kind==='شكر لمعلم'||m.kind==='اترك أثرًا')?'thanks':'message',recordId:m.id,title:m.studentName,detail:(m.kind==='شكر لمعلم'||m.kind==='اترك أثرًا')?ui('كلمة تقدير إلى ')+(m.teacherName||''):ui(m.kind)+' • '+m.details,at:m.createdAt});
 const sourceMessages=new Map(messages.map(m=>[m.id,m]));
 for(const task of tasks){const c=activeCases.get(task.recordId),a=attendanceById.get(task.recordId),f=data.absenceFollowups.find(f=>f.studentId===task.recordId),m=sourceMessages.get(task.recordId);task.version=JSON.stringify(task.kind==='follow'||task.kind==='case-notify'?[c?.revision||0,c?.updatedAt||c?.occurredAt,c?.followStatus,c?.details]:task.kind==='absence-notify'?[a?.updatedAt,a?.status]:task.kind==='absence-follow'?[f?.updatedAt,f?.status,f?.lastAbsent,f?.totalCount]:[m?.revision,m?.updatedAt,m?.status]);}
 const dismissed=new Set((data.deskClosures||[]).map(c=>JSON.stringify([c.taskId,c.version])));for(let i=tasks.length-1;i>=0;i--)if(dismissed.has(JSON.stringify([tasks[i].id,tasks[i].version])))tasks.splice(i,1);
 tasks.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 // Distinct documented tasks, not clicks or WhatsApp windows. Team-wide, today in Riyadh.
 const completed=new Set<string>();
 for(const f of data.followups)if(f.status==='done'&&day(f.createdAt)===today&&activeCases.get(f.caseId)?.followStatus==='done')completed.add('follow:'+f.caseId);
 for(const e of data.contacts)if(e.status==='sent'&&day(e.createdAt)===today&&activeCases.has(e.caseId))completed.add('case-notify:'+e.caseId);
 for(const e of data.absenceEvents)if(day(e.createdAt)===today){
  if(e.kind==='attendance-notification-sent')try{const p=JSON.parse(e.notes);const r=attendanceById.get(p.attendanceId);if(r&&r.studentId===e.studentId&&r.date===p.date)completed.add('absence-notify:'+r.id);}catch{}
 }
 for(const f of data.absenceFollowups)if(f.status==='done'&&day(f.updatedAt)===today)completed.add('absence-follow:'+f.studentId);
 for(const e of events)if(day(e.at)===today){if(e.kind==='reply-sent'&&byMessage.has(e.messageId))completed.add('message-reply:'+e.messageId);if((!e.kind||e.kind==='update')&&e.status==='done'&&byMessage.get(e.messageId)?.status==='done')completed.add('message:'+e.messageId);}
 const counts=Object.fromEntries(Object.keys(DESK_LABELS).map(k=>[k,tasks.filter(t=>t.kind===k).length])) as Record<DeskTask['kind'],number>;
 return {tasks,counts,completed:completed.size,today};
}
