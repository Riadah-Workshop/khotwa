export type ReportPreset='today'|'week'|'month'|'all'|'custom';
export function riyadhDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function periodRange(preset:ReportPreset,now=new Date()){
 const to=riyadhDay(now);if(preset==='all')return {from:'',to:''};
 let from=to;if(preset==='month')from=to.slice(0,8)+'01';
 if(preset==='week'){const d=new Date(to+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());from=d.toISOString().slice(0,10);}
 return {from,to};
}
export type PeriodRow={id:string;createdAt:string;status:string;phone?:string;notes?:string;actor?:string;updatedAt?:string;studentName?:string;senderRole?:string;grade?:string;kind?:string;details?:string;teacherName?:string;replyCount?:number;attachmentKey?:string;name?:string;reason?:string;target?:string;source?:string;childName?:string;childClass?:string;enteredAt?:string;meetingAt?:string;leftAt?:string};
export function reportSummary(rows:PeriodRow[],type:'messages'|'visitors'){
 const statuses:Record<string,number>={},categories:Record<string,number>={};
 for(const row of rows){statuses[row.status]=(statuses[row.status]||0)+1;const category=(type==='messages'?row.kind:row.reason)||'غير محدد';categories[category]=(categories[category]||0)+1;}
 return {total:rows.length,statuses,categories,replied:rows.filter(r=>(r.replyCount||0)>0).length,entered:rows.filter(r=>!!r.enteredAt).length,qr:rows.filter(r=>r.source==='qr').length};
}
