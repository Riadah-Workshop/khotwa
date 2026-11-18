export const ATTENDANCE_NOTIFICATION_KINDS=['attendance-notification-opened','attendance-notification-sent'] as const;
export type NotificationEvent={studentId:string;kind:string;notes:string;createdAt:string;actor:string};
export function attendanceNotification(record:{id:string;studentId:string;date:string},events:NotificationEvent[]){
 let latest:NotificationEvent|undefined,sent:NotificationEvent|undefined;
 for(const event of events){if(event.studentId!==record.studentId||!ATTENDANCE_NOTIFICATION_KINDS.includes(event.kind as any))continue;try{const payload=JSON.parse(event.notes);if(payload.attendanceId!==record.id||payload.date!==record.date)continue;}catch{continue;}if(!latest||event.createdAt>latest.createdAt)latest=event;if(event.kind==='attendance-notification-sent'&&(!sent||event.createdAt>sent.createdAt))sent=event;}
 return {status:sent?'sent':latest?'opened':'none',event:sent||latest} as const;
}
export function notificationLabel(status:string){return status==='sent'?'إرسال مؤكد يدويًا':status==='opened'?'فُتح واتساب — لم يؤكد الإرسال':'لم يتم إشعاره';}
