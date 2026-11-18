import {z} from 'zod';
import {schoolDateSchema} from './school-work';
export const MOVEMENT_KINDS=['admission','incoming','outgoing'] as const;
export const MOVEMENT_STATUSES=['new','progress','completed','cancelled'] as const;
export const MOVEMENT_CHECKS=['documents','official','file','family'] as const;
export const movementInput=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative(),studentId:z.string().max(100).default(''),name:z.string().trim().min(2).max(150),grade:z.string().trim().max(50),classroom:z.string().trim().max(50),kind:z.enum(MOVEMENT_KINDS),date:schoolDateSchema,school:z.string().trim().max(200),responsible:z.string().trim().max(150),status:z.enum(MOVEMENT_STATUSES),checks:z.array(z.enum(MOVEMENT_CHECKS)).max(4),notes:z.string().trim().max(3000)}).superRefine((v,c)=>{if(v.kind!=='admission'&&!v.school)c.addIssue({code:'custom',path:['school'],message:'حدد المدرسة الأخرى'});if(v.kind==='outgoing'&&!v.studentId)c.addIssue({code:'custom',path:['studentId'],message:'اختر الطالب من دليل خطوة'});if(v.status==='completed'&&MOVEMENT_CHECKS.some(k=>!v.checks.includes(k)))c.addIssue({code:'custom',path:['checks'],message:'أكمل قائمة التحقق قبل إغلاق الطلب'});});
export type Movement=z.infer<typeof movementInput>;
export const movementBackup=z.object({id:z.string().uuid(),payload:z.string().max(15000),revision:z.number().int().positive(),updatedAt:z.string().datetime(),actor:z.string().max(200)}).superRefine((v,c)=>{try{const m=movementInput.parse(JSON.parse(v.payload));if(m.id!==v.id||m.revision!==v.revision)throw Error();}catch{c.addIssue({code:'custom',message:'سجل قبول أو نقل غير صالح'});}});
export async function saveMovement(db:D1Database,input:unknown,actor:string){
 const v=movementInput.parse(input);
 if(v.studentId){const s=await db.prepare('SELECT name,grade,classroom FROM students WHERE id=?').bind(v.studentId).first<any>();if(!s)throw Error('الطالب غير موجود في دليل خطوة');v.name=s.name;v.grade=s.grade;v.classroom=s.classroom;}
 const existing=await db.prepare('SELECT payload,revision FROM student_movements WHERE id=?').bind(v.id).first<any>();
 const row={...v,revision:v.revision+1};
 if(v.revision===0&&existing){if(existing.payload===JSON.stringify(row))return JSON.parse(existing.payload);throw Error('تغير السجل. حدّث القائمة ثم أعد فتح الطلب');}
 const now=new Date().toISOString();
 const r=v.revision===0?await db.prepare('INSERT INTO student_movements(id,payload,revision,updated_at,actor) VALUES(?,?,1,?,?)').bind(v.id,JSON.stringify(row),now,actor).run():await db.prepare('UPDATE student_movements SET payload=?,revision=?,updated_at=?,actor=? WHERE id=? AND revision=?').bind(JSON.stringify(row),row.revision,now,actor,v.id,v.revision).run();
 if(r.meta.changes!==1)throw Error('تغير السجل. حدّث القائمة ثم أعد فتح الطلب');
 return row;
}
