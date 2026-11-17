export type FamilyMember={studentId:string;familyId:string;actor:string;updatedAt:string};
export type FamilyStudent={id:string;name:string;grade:string;classroom:string;phone:string;active:number};
export function normalizedFamilyPhone(value:string){let p=value.replace(/\D/g,'');if(p.startsWith('00'))p=p.slice(2);if(/^05\d{8}$/.test(p))p='966'+p.slice(1);if(/^5\d{8}$/.test(p))p='966'+p;return /^\d{9,15}$/.test(p)?p:'';}
export function familyFor(studentId:string,students:FamilyStudent[],members:FamilyMember[]){const group=members.find(m=>m.studentId===studentId)?.familyId;if(!group)return [];const ids=new Set(members.filter(m=>m.familyId===group).map(m=>m.studentId));return students.filter(s=>s.id!==studentId&&!!s.active&&ids.has(s.id));}
export function siblingSuggestions(studentId:string,students:FamilyStudent[],members:FamilyMember[]){const s=students.find(s=>s.id===studentId),phone=normalizedFamilyPhone(s?.phone||''),linked=new Set(familyFor(studentId,students,members).map(s=>s.id));return phone?students.filter(other=>other.id!==studentId&&!!other.active&&!linked.has(other.id)&&normalizedFamilyPhone(other.phone)===phone):[];}
// Every statement runs in the same D1 transaction. Materialize both groups before
// changing memberships so joining two existing families cannot split either one.
export const familyLinkInsert=`INSERT INTO student_families(student_id,family_id,actor,updated_at)
 SELECT id,?,?,? FROM students WHERE id IN (?,?) AND active=1 AND (SELECT COUNT(*) FROM students WHERE id IN (?,?) AND active=1)=2
 ON CONFLICT(student_id) DO UPDATE SET family_id=CASE WHEN student_families.family_id='' THEN excluded.family_id ELSE student_families.family_id END`;
export const familyLinkMerge=`WITH groups AS MATERIALIZED (SELECT family_id FROM student_families WHERE student_id IN (?,?) AND family_id<>''), anchor AS MATERIALIZED (SELECT family_id FROM student_families WHERE student_id=?)
 UPDATE student_families SET family_id=(SELECT family_id FROM anchor),actor=?,updated_at=? WHERE family_id IN (SELECT family_id FROM groups) AND (SELECT COUNT(*) FROM students WHERE id IN (?,?) AND active=1)=2`;
