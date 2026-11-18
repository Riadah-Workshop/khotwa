// Read-only references to the user-supplied fifth edition (1447 / 2025).
// PDF page numbers are one less than printed page numbers. No disciplinary automation.
export type GuidanceCase={id:string;studentId:string;type:string;occurredAt:string;extra?:string;action:string;deletedAt?:string};
export function violationKey(type:string,extra:{violation?:string;customViolation?:string}){
 if(type==='التأخر الصباحي'||type==='التأخر عن دخول الحصة')return type;
 if(type!=='المخالفات السلوكية')return '';
 return extra.violation==='أخرى'?extra.customViolation?.trim()||'':extra.violation||'';
}
export function priorGuidanceCases(rows:GuidanceCase[],studentId:string,type:string,extra:{violation?:string;customViolation?:string},occurredAt:string,editingId?:string){
 const key=violationKey(type,extra),cutoff=Date.parse(occurredAt.length===16?occurredAt+':00+03:00':occurredAt);
 if(!studentId||!key||!Number.isFinite(cutoff))return [];
 return rows.filter(r=>{if(r.deletedAt||r.id===editingId||r.studentId!==studentId||r.type!==type||(!Number.isFinite(Date.parse(r.occurredAt))||Date.parse(r.occurredAt)>cutoff))return false;let e={};try{e=JSON.parse(r.extra||'{}')||{};}catch{}return violationKey(r.type,e)===key;}).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
}
export function guidanceReference(type:string,violation?:string){
 if(type==='التأخر الصباحي'||type==='التأخر عن دخول الحصة'||(type==='المخالفات السلوكية'&&violation==='عدم الالتزام بالزي الرسمي السعودي'))return {page:19,printed:'٢٠',article:'٦',firstDegree:true,ambiguous:false};
 if(type==='الاستئذان')return {page:48,printed:'٤٩',article:'٣٢',firstDegree:false,ambiguous:false};
 if(type==='السلوك الإيجابي')return {page:17,printed:'١٨–١٩',article:'٥',firstDegree:false,ambiguous:false};
 if(type==='المخالفات السلوكية'){
  if(violation==='الخروج من الفصل دون إذن'||violation==='العبث بممتلكات المدرسة')return {page:20,printed:'٢١',article:'٧',firstDegree:false,ambiguous:false};
  return {page:19,printed:'٢٠–٢٤',article:'٦–٩',firstDegree:false,ambiguous:true};
 }
 return null;
}
