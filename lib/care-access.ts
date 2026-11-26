// Student care and emergency data is available only to the roles that run a school's
// student-affairs work: the system administrator and the school's Student Affairs
// Agent (deputy). Access is decided by the signed session role, never by an e-mail
// address, so no personal identity is embedded in the source code.
export function canAccessCare(role:string|null|undefined):boolean{return role==='main_admin'||role==='deputy';}
export const CARE_DENIED='بيانات الرعاية والطوارئ متاحة للوكيل المدرسي ومدير النظام فقط.';
