// Registrar identities already recognized by this installation. Fail closed for
// viewers and other editors; care information never rides on general API data.
const CARE_OWNERS=new Set(['ayed6992@gmail.com','zsy4skgbdz@privaterelay.appleid.com']);
export function canAccessCare(email:string|null|undefined){return CARE_OWNERS.has(email?.trim().toLowerCase()||'');}
export const CARE_DENIED='بيانات الرعاية والطوارئ خاصة بمالك البرنامج.';
