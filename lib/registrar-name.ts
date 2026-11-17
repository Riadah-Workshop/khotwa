const REGISTRAR_NAME='عايض عوض سعيد القحطاني';
// These are this registrar's former display names, not a replacement for other users.
export function registrarName(name:string,email=''):string{
 const alias=name.trim().replace(/\s+/g,' ').toUpperCase();
 const formerNames=['عايض القحطاني','عايض ثقفان','عايض آل ثقفان','عائض ثقفان','عائض القحطاني'].map(value=>value.toUpperCase());
 return ['ABU NOOF','AYED ALQAHTANI'].includes(alias)||formerNames.includes(alias)||['ayed6992@gmail.com','zsy4skgbdz@privaterelay.appleid.com'].includes(email.toLowerCase())?REGISTRAR_NAME:name;
}
// Normalize display copies only; stored audit history and backup records stay intact.
export function registrarDisplay<T>(value:T):T{
 if(Array.isArray(value))return value.map(item=>registrarDisplay(item)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['actor','updatedBy','deletedBy','deputy'].includes(key)&&typeof item==='string'?registrarName(item):registrarDisplay(item)])) as T;
 return value;
}
