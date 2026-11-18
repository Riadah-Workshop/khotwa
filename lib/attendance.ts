import {z} from 'zod';
export const attendanceInput=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),grade:z.string().trim().min(1).max(50),classroom:z.string().trim().min(1).max(50),revision:z.number().int().nonnegative(),records:z.array(z.object({studentId:z.string().min(1).max(100),status:z.enum(['present','late','absent','unmarked']),notes:z.string().trim().max(1000)})).min(1).max(200)});
export function validateRoster(records:{studentId:string}[],rosterIds:string[]){const ids=new Set(records.map(r=>r.studentId));return ids.size===records.length&&ids.size===rosterIds.length&&rosterIds.every(id=>ids.has(id));}
export function validSchoolDate(date:string,today:string){const parsed=new Date(date+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&date<=today;}
export function roundId(date:string,grade:string,classroom:string){return JSON.stringify([date,grade,classroom]);}
export function attendanceId(date:string,studentId:string){return date+':'+studentId;}
// All statements are one D1 transaction. The token makes every row write conditional on the revision claim.
export function roundClaimSql(){return `INSERT INTO attendance_rounds (id,date,grade,classroom,revision,total,actor,actor_id,saved_at,commit_token) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM attendance_rounds WHERE id=? AND revision=?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,total=excluded.total,actor=excluded.actor,actor_id=excluded.actor_id,saved_at=excluded.saved_at,commit_token=excluded.commit_token WHERE attendance_rounds.revision=?`;}
export function recordWriteSql(){return `INSERT INTO attendance (id,round_id,student_id,date,name,grade,classroom,status,notes,actor,actor_id,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM attendance_rounds WHERE id=? AND commit_token=?) ON CONFLICT(student_id,date) DO UPDATE SET status=excluded.status,notes=excluded.notes,actor=excluded.actor,actor_id=excluded.actor_id,updated_at=excluded.updated_at WHERE attendance.round_id=excluded.round_id AND EXISTS (SELECT 1 FROM attendance_rounds WHERE id=? AND commit_token=?)`;}
export function barcodeForStudent(id:string){const hex=id.replace(/-/g,'').slice(0,12);if(!/^[0-9a-f]{12}$/i.test(hex))return id;return BigInt('0x'+hex).toString().padStart(16,'0');}

export function isPresent(status:string){return status==='present'||status==='late';}
export function attendanceLabel(status:string){return status==='late'?'حضر متأخرًا':status==='present'?'حاضر':status==='absent'?'غائب':'لم يُحصر';}
