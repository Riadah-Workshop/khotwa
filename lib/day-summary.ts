import {buildWorkDesk,type DeskData,type DeskMessage} from './work-desk';
import {riyadhDay} from './period-reports';
export function buildDaySummary(data:DeskData,messages:DeskMessage[],events:{messageId:string;kind?:string;status:string;at:string}[],now=new Date()){
 const day=riyadhDay(now),desk=buildWorkDesk(data,messages,events,now),sameDay=(s:string)=>Number.isFinite(Date.parse(s))&&riyadhDay(new Date(s))===day;
 const cases=data.cases.filter(c=>!c.deletedAt&&sameDay(c.occurredAt));
 const records=new Map<string,DeskData['attendance'][number]>();for(const r of data.attendance.filter(r=>r.date===day)){const old=records.get(r.studentId);if(!old||r.updatedAt>old.updatedAt)records.set(r.studentId,r);}
 const active=data.students.filter(s=>s.active),marked=new Set([...records.values()].filter(r=>r.status!=='unmarked').map(r=>r.studentId));
 const counts={present:0,late:0,absent:0};for(const r of records.values())if(r.status==='present'||r.status==='late'||r.status==='absent')counts[r.status]++;
 return {day,desk,cases:cases.length,studentsWithCases:new Set(cases.map(c=>c.studentId)).size,attendance:counts,unmarked:active.filter(s=>!marked.has(s.id)).length,messagesReceived:messages.filter(m=>sameDay(m.createdAt)).length};
}
