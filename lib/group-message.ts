import {absenceFollowupPhone} from './absence-followup-whatsapp';
export type GroupMessageStudent={id:string;name:string;grade:string;classroom:string;phone:string;active:number};
export function groupMessagePhone(value:string){
 const raw=value.trim().replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[۰-۹]/g,n=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)));
 const phone=absenceFollowupPhone(raw);
 // Do not reinterpret an incomplete local Saudi number as a foreign number.
 if(/^0(?!0)/.test(raw.replace(/[\s()+.\-]/g,''))&&!/^05\d{8}$/.test(raw.replace(/\D/g,'')))return '';
 if(phone.startsWith('966')&&!/^9665\d{8}$/.test(phone))return '';
 return phone;
}
export function groupMessageRecipients(students:GroupMessageStudent[],ids:readonly string[]){
 const chosen=new Set(ids),selected=students.filter(s=>s.active&&chosen.has(s.id)),byPhone=new Map<string,GroupMessageStudent[]>(),missing:GroupMessageStudent[]=[],invalid:GroupMessageStudent[]=[];
 for(const s of selected){if(!s.phone?.trim()){missing.push(s);continue;}const phone=groupMessagePhone(s.phone);if(!phone){invalid.push(s);continue;}const existing=byPhone.get(phone)||[];existing.push(s);byPhone.set(phone,existing);}
 const recipients=[...byPhone].map(([phone,students])=>({phone,students}));
 return {selected,recipients,missing,invalid,duplicates:recipients.reduce((n,r)=>n+r.students.length-1,0)};
}
export function groupMessageNumbers(recipients:{phone:string}[],format:'local'|'international',separator:string){return recipients.map(({phone})=>format==='local'&&/^9665\d{8}$/.test(phone)?'0'+phone.slice(3):'+'+phone).join(separator);}
