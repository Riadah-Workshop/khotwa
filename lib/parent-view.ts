export function parentPhone(v:unknown){if(typeof v!=='string')return '';const p=v.replace(/[٠-٩]/g,x=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/[۰-۹]/g,x=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))).replace(/[\s()+-]/g,'').replace(/^00966|^966/,'0');return /^05\d{8}$/.test(p)?p:'';}
export function safeParentCase(row:any){let extra:any={};try{extra=JSON.parse(row.extra||'{}')}catch{}return {id:row.id,type:row.type,date:row.occurred_at,followStatus:row.follow_status,arrivalTime:row.type==='التأخر الصباحي'?extra.arrivalTime||'':'',exitTime:row.type==='الاستئذان'?extra.exitTime||'':''};}
export async function parentView(db:D1Database,phone:string){
 const grant=await db.prepare('SELECT * FROM parent_grants WHERE phone=? AND enabled=1').bind(phone).first<any>();if(!grant)return {students:[]};let ids:string[]=[];try{ids=JSON.parse(grant.student_ids)}catch{return {students:[]}};
 const children=[];
 for(const id of ids.slice(0,20)){
  const s=await db.prepare('SELECT id,name,grade,classroom,phone,active FROM students WHERE id=?').bind(id).first<any>();
  if(!s?.active||parentPhone(s.phone)!==phone)continue;
  const results=await db.batch([
   db.prepare('SELECT id,date,status FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 200').bind(id),
   db.prepare("SELECT id,type,occurred_at,follow_status,extra FROM cases WHERE student_id=? AND deleted_at='' ORDER BY occurred_at DESC LIMIT 200").bind(id),
   db.prepare('SELECT status,COUNT(*) total FROM attendance WHERE student_id=? GROUP BY status').bind(id),
   db.prepare("SELECT type,COUNT(*) total FROM cases WHERE student_id=? AND deleted_at='' GROUP BY type").bind(id)]);
  children.push({id:s.id,name:s.name,grade:s.grade,classroom:s.classroom,attendance:results[0].results,cases:results[1].results.map(safeParentCase),attendanceCounts:Object.fromEntries(results[2].results.map((r:any)=>[r.status,r.total])),caseCounts:Object.fromEntries(results[3].results.map((r:any)=>[r.type,r.total]))});
 }
 return {students:children,updatedAt:new Date().toISOString()};
}
