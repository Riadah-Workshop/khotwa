type Student={id:string;name:string;grade:string;classroom:string;active:number};
type Case={studentId:string;type:string;deletedAt?:string;occurredAt:string;extra?:string;details?:string;action?:string};
const blockingTypes=new Set(['التأخر عن دخول الحصة','التأخر الصباحي','الاستئذان','المخالفات السلوكية','التواصل مع ولي الأمر','استدعاء ولي الأمر','استدعاء ولي أمر']);
export function blocksHonor(c:Case){
 if(c.deletedAt)return false;
 if(blockingTypes.has(c.type))return true;
 if(c.type!=='زيارة ولي الأمر')return false;
 let reason='';try{reason=JSON.parse(c.extra||'{}').visitReason||'';}catch{}
 // A routine parent visit is not a summons. Only a documented summons counts.
 return /استدعاء/.test([reason,c.details||'',c.action||''].join(' '));
}
export function honorCandidates<T extends Student>(students:T[],cases:Case[]){
 const blocked=new Set(cases.filter(blocksHonor).map(c=>c.studentId));
 return students.filter(s=>s.active&&!blocked.has(s.id));
}
