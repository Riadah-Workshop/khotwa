import {roundId,attendanceId,roundClaimSql} from './attendance';
// Reconcile today's class lists only. Historical attendance, record IDs, statuses,
// notes and notification references are retained. Claims and writes are atomic.
export async function syncTodayRosters(DB:D1Database,date:string,actor:string,actorId:string){
 const snapshot=await DB.batch([DB.prepare('SELECT * FROM students WHERE active=1'),DB.prepare('SELECT * FROM attendance WHERE date=?').bind(date),DB.prepare('SELECT * FROM attendance_rounds WHERE date=?').bind(date)]);
 const students=snapshot[0].results as any[],records=snapshot[1].results as any[],rounds=snapshot[2].results as any[];
 const groups=new Map<string,{grade:string;classroom:string;rows:any[]}>();
 for(const r of rounds)groups.set(r.id,{grade:r.grade,classroom:r.classroom,rows:[]});
 for(const r of records){const s=students.find(s=>s.id===r.student_id);const grade=s?.grade||r.grade,classroom=s?.classroom||r.classroom,rid=roundId(date,grade,classroom);if(!groups.has(rid))groups.set(rid,{grade,classroom,rows:[]});groups.get(rid)!.rows.push({...r,round_id:rid,grade,classroom});}
 const now=new Date().toISOString();
 for(const [rid,g] of groups)for(const s of students.filter(s=>s.grade===g.grade&&s.classroom===g.classroom))if(!g.rows.some(r=>r.student_id===s.id))g.rows.push({id:attendanceId(date,s.id),round_id:rid,student_id:s.id,date,name:s.name,grade:s.grade,classroom:s.classroom,status:'unmarked',notes:'',actor,actor_id:actorId,updated_at:now});
 const changed=[...groups].filter(([rid,g])=>{const old=records.filter(r=>r.round_id===rid);return old.length!==g.rows.length||g.rows.some(r=>{const p=old.find(p=>p.id===r.id);return !p||p.grade!==r.grade||p.classroom!==r.classroom;});});
 if(!changed.length)return {ok:true,changed:0};
 const token=crypto.randomUUID(),commands:D1PreparedStatement[]=[];
 for(const [rid,g] of changed){const prior=rounds.find(r=>r.id===rid),revision=prior?.revision||0;commands.push(DB.prepare(roundClaimSql()).bind(rid,date,g.grade,g.classroom,revision+1,g.rows.length,actor,actorId,now,token,revision,rid,revision,revision));}
 // Force transaction rollback if any claim lost to another user. This deliberate
 // NOT NULL constraint violation executes only for an unclaimed round.
 for(const [rid] of changed)commands.push(DB.prepare("INSERT INTO attendance_audit(id,round_id,revision,actor,actor_id,saved_at,summary) SELECT ?,?,1,NULL,?,?,'roster-conflict' WHERE NOT EXISTS(SELECT 1 FROM attendance_rounds WHERE id=? AND commit_token=?)").bind(crypto.randomUUID(),rid,actorId,now,rid,token));
 for(const [rid,g] of changed){for(const r of g.rows){const old=records.find(p=>p.id===r.id);if(old){if(old.round_id!==rid)commands.push(DB.prepare('UPDATE attendance SET round_id=?,grade=?,classroom=? WHERE id=? AND date=?').bind(rid,g.grade,g.classroom,r.id,date));}else commands.push(DB.prepare('INSERT INTO attendance(id,round_id,student_id,date,name,grade,classroom,status,notes,actor,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,rid,r.student_id,date,r.name,g.grade,g.classroom,'unmarked','',actor,actorId,now));}
 commands.push(DB.prepare('UPDATE attendance_rounds SET completed=? WHERE id=? AND commit_token=?').bind(g.rows.length>0&&g.rows.every(r=>r.status!=='unmarked')?1:0,rid,token));
 commands.push(DB.prepare('INSERT INTO attendance_audit(id,round_id,revision,actor,actor_id,saved_at,summary) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),rid,(rounds.find(r=>r.id===rid)?.revision||0)+1,actor,actorId,now,JSON.stringify({operation:'تحديث قائمة الفصل بعد نقل الطلاب',before:records.filter(r=>r.round_id===rid),after:g.rows})));
 }
 await DB.batch(commands);return {ok:true,changed:changed.length};
}
