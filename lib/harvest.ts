import {riyadhDay} from './period-reports';
export const HARVEST_KINDS=['cases','messages','followups','rounds','notifications','absenceFollowups','activities'] as const;
export type HarvestKind=typeof HARVEST_KINDS[number];
export const HARVEST_LABELS:Record<HarvestKind,string>={cases:'حالات وُثّقت',messages:'رسائل عولجت',followups:'متابعات حالات أُغلقت',rounds:'فصول اكتمل حصرها',notifications:'إشعارات أُكّد إرسالها',activities:'أنشطة نُفذت وأُغلقت',absenceFollowups:'متابعات غياب أُغلقت'};
export type HarvestEvidence={id:string;kind:HarvestKind;at:string;actor:string;studentId?:string;activityId?:string;label:string};
export type HarvestData={activities?:{id:string;title:string;executionStatus:string;actualDate:string;completedAt:string;completedBy:string}[];cases:{id:string;studentId:string;type:string;createdAt:string;followStatus:string;deletedAt?:string;actor:string}[];followups:{id:string;caseId:string;status:string;createdAt:string;actor:string}[];contacts:{id:string;caseId:string;status:string;createdAt:string;actor:string}[];attendanceRounds:{id:string;date:string;grade:string;classroom:string;completed:number;savedAt:string;actor:string}[];attendance:{id:string;studentId:string;date:string}[];absenceEvents:{id:string;studentId:string;kind:string;notes:string;createdAt:string;actor:string}[];absenceFollowups:{studentId:string;status:string;updatedAt:string;actor:string}[]};
export type HarvestMessage={id:string;status:string};
export type HarvestMessageEvent={id:string;messageId:string;kind?:string;status:string;at:string;actor:string};
const day=(s:string)=>Number.isFinite(Date.parse(s))?riyadhDay(new Date(s)):'';
export function harvestRange(mode:'today'|'week',now=new Date()){const to=riyadhDay(now),d=new Date(to+'T12:00:00Z');return {from:mode==='today'?to:new Date(d.getTime()-d.getUTCDay()*86400000).toISOString().slice(0,10),to};}
export function buildHarvest(data:HarvestData,messages:HarvestMessage[],events:HarvestMessageEvent[],range:{from:string;to:string},ui:(text:string)=>string=text=>text){
 const evidence:HarvestEvidence[]=[],activeCases=new Map(data.cases.filter(c=>!c.deletedAt).map(c=>[c.id,c]));
 const inRange=(at:string)=>{const d=day(at);return !!d&&d>=range.from&&d<=range.to};
 const add=(r:HarvestEvidence)=>{if(inRange(r.at))evidence.push(r)};
 for(const c of activeCases.values())add({id:'case:'+c.id,kind:'cases',at:c.createdAt,actor:c.actor,studentId:c.studentId,label:ui(c.type)});
 // Latest state/event per record. Reopening removes a closure from the current summary.
 const latest=new Map<string,HarvestData['followups'][number]>();for(const f of data.followups)if(!latest.has(f.caseId)||f.createdAt>latest.get(f.caseId)!.createdAt)latest.set(f.caseId,f);
 for(const f of latest.values()){const c=activeCases.get(f.caseId);if(c?.followStatus==='done'&&f.status==='done')add({id:'follow:'+f.caseId,kind:'followups',at:f.createdAt,actor:f.actor,studentId:c.studentId,label:ui('إغلاق متابعة ')+ui(c.type)});}
 const currentMessages=new Map(messages.map(m=>[m.id,m])),latestMessage=new Map<string,HarvestMessageEvent>();for(const e of events)if(!e.kind||e.kind==='update'){if(!latestMessage.has(e.messageId)||e.at>latestMessage.get(e.messageId)!.at)latestMessage.set(e.messageId,e);}
 for(const e of latestMessage.values())if(e.status==='done'&&currentMessages.get(e.messageId)?.status==='done')add({id:'message:'+e.messageId,kind:'messages',at:e.at,actor:e.actor,label:ui('معالجة رسالة ولي أمر')});
 for(const r of data.attendanceRounds)if(r.completed===1)add({id:'round:'+r.id,kind:'rounds',at:r.savedAt,actor:r.actor,label:ui('حصر ')+r.grade+' / '+r.classroom+' • '+r.date});
 const sent=new Map<string,HarvestEvidence>();
 for(const c of data.contacts)if(c.status==='sent'&&activeCases.has(c.caseId)&&inRange(c.createdAt)){const id='notify-case:'+c.caseId,old=sent.get(id);if(!old||c.createdAt>old.at)sent.set(id,{id,kind:'notifications',at:c.createdAt,actor:c.actor,studentId:activeCases.get(c.caseId)!.studentId,label:ui('إرسال إشعار حالة مؤكّد يدويًا')});}
 const attendance=new Map(data.attendance.map(r=>[r.id,r]));
 for(const e of data.absenceEvents)if(e.kind==='attendance-notification-sent'&&inRange(e.createdAt))try{const p=JSON.parse(e.notes),r=attendance.get(p.attendanceId);if(r&&r.studentId===e.studentId&&r.date===p.date){const id='notify-attendance:'+r.id,old=sent.get(id);if(!old||e.createdAt>old.at)sent.set(id,{id,kind:'notifications',at:e.createdAt,actor:e.actor,studentId:r.studentId,label:ui('إرسال إشعار غياب مؤكّد يدويًا')});}}catch{}
 for(const r of sent.values())add(r);
 for(const f of data.absenceFollowups)if(f.status==='done')add({id:'absence-follow:'+f.studentId,kind:'absenceFollowups',at:f.updatedAt,actor:f.actor,studentId:f.studentId,label:ui('إغلاق متابعة غياب')});
 for(const a of new Map((data.activities||[]).map(a=>[a.id,a])).values())if(a.executionStatus==='completed'&&a.completedAt&&a.actualDate&&a.actualDate>=range.from&&a.actualDate<=range.to)evidence.push({id:'activity:'+a.id,kind:'activities',activityId:a.id,at:a.actualDate+'T12:00:00Z',actor:a.completedBy,label:a.title});
 evidence.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 const counts=Object.fromEntries(HARVEST_KINDS.map(k=>[k,evidence.filter(e=>e.kind===k).length])) as Record<HarvestKind,number>;
 return {evidence,counts,total:evidence.length,range};
}
