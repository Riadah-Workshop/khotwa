import {env} from 'cloudflare:workers';
import {tableName} from '../school-sql';
import {parentPhone} from '../parent-view';
import {parentLinkedSchools} from '../parent-identities';
import type {SchoolRole} from '../school-tenancy';

export type FushatiAccess={role:SchoolRole;schoolId:string;parentPhone:string;userId:string};
export const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export const now=()=>new Date().toISOString();
export const keyDate=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const item=(key:string)=>parts.find(p=>p.type===key)?.value||'';
 const day=[item('year'),item('month'),item('day')].join('-');
 return {day,month:day.slice(0,7)};
};
export const moneyMinor=(value:unknown):number|null=>{
 const str=String(value??'').trim();
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(str))return null;
 const [sar,hal='']=str.split('.');
 return Number(sar)*100+Number(hal.padEnd(2,'0'));
};
export const moneySar=(minor:number)=>Number((minor/100).toFixed(2));
export const db=()=>env.DB!;
export const isCafeAdmin=(access:FushatiAccess)=>access.role==='main_admin'||access.role==='fushati_admin';
export const isCafeStaff=(access:FushatiAccess)=>isCafeAdmin(access)||access.role==='fushati_agent';
export async function permittedCafeteria(access:FushatiAccess,cafeteriaId:string,includeInactive=false){
 if(!isCafeStaff(access))return null;
 const query=access.role==='fushati_agent'
  ?'SELECT c.* FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id AND s.active=1 JOIN fushati_assignments a ON a.cafeteria_id=c.id WHERE c.id=? AND c.active=1 AND a.user_id=?'
  :`SELECT c.* FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id WHERE c.id=? AND s.active=1 ${includeInactive?'':'AND c.active=1'}`;
 const row=await db().prepare(query).bind(...(access.role==='fushati_agent'?[cafeteriaId,access.userId]:[cafeteriaId])).first<any>();
 return row||null;
}
export async function permittedStudent(phone:string,schoolId:string,studentId:string){
 const canonical=parentPhone(phone);
 if(!canonical)return null;
 const schools=await parentLinkedSchools(db(),canonical);
 if(!schools.some(s=>s.id===schoolId))return null;
 const grant=await db().prepare(`SELECT student_ids FROM "${tableName(schoolId,'parent_grants')}" WHERE phone=? AND enabled=1`).bind(canonical).first<{student_ids:string}>();
 if(!grant)return null;
 let ids:string[]=[];try{ids=JSON.parse(grant.student_ids);}catch{return null;}
 if(!Array.isArray(ids)||!ids.includes(studentId))return null;
 const row=await db().prepare(`SELECT id,name,grade,classroom,active,phone FROM "${tableName(schoolId,'students')}" WHERE id=?`).bind(studentId).first<any>();
 return row?.active===1&&parentPhone(row.phone)===canonical?row:null;
}
export async function activeStudent(schoolId:string,studentId:string){
 if(!/^(?:default|[a-f0-9]{12})$/.test(schoolId))return null;
 return db().prepare(`SELECT id,name,grade,classroom,active FROM "${tableName(schoolId,'students')}" WHERE id=? AND active=1`).bind(studentId).first<any>();
}
export async function getOrCreateAccount(schoolId:string,cafeteriaId:string,studentId:string){
 const id=crypto.randomUUID();
 await db().prepare('INSERT INTO fushati_accounts(id,school_id,cafeteria_id,student_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fushati_cafeterias WHERE id=? AND school_id=? AND active=1) ON CONFLICT(cafeteria_id,student_id) DO NOTHING').bind(id,schoolId,cafeteriaId,studentId,now(),cafeteriaId,schoolId).run();
 return db().prepare('SELECT * FROM fushati_accounts WHERE cafeteria_id=? AND student_id=? AND school_id=?').bind(cafeteriaId,studentId,schoolId).first<any>();
}
export async function audit(actor:string,op:string,type:string,id:string,detail=''){
 await db().prepare('INSERT INTO fushati_audit(id,actor_id,operation,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,op,type,id,detail.slice(0,500),now()).run();
}
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
async function hmac(message:string):Promise<string>{
 const secret=env.KHOTWA_SESSION_SECRET;
 if(!secret||secret.length<32)throw new Error('Session key not configured');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))));
}
/** Short-lived QR token, signed by the same authenticated backend secret. */
export async function makeQrToken(cafeId:string,studentId:string){
 const expiry=Math.floor(Date.now()/60000)+10;
 const message=`f1.${cafeId}.${studentId}.${expiry}`;
 return message+'.'+await hmac(message);
}
export async function readQrToken(token:string){
 const pieces=token.split('.');if(pieces.length!==5||pieces[0]!=='f1'||token.length>350)return null;
 const [_,cafeteriaId,studentId,expiryRaw,signature]=pieces;
 const expiry=Number(expiryRaw);
 if(!Number.isSafeInteger(expiry)||expiry<Math.floor(Date.now()/60000)||expiry>Math.floor(Date.now()/60000)+11||!/^[a-f0-9-]{36}$/.test(cafeteriaId)||!/^[\w-]{1,120}$/.test(studentId))return null;
 const message=pieces.slice(0,4).join('.');
 const expected=await hmac(message);
 // Ensure signature comparison is constant time through WebCrypto.verify.
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.KHOTWA_SESSION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const sig=signature.replace(/-/g,'+').replace(/_/g,'/');let raw='';try{raw=atob(sig+'='.repeat((4-sig.length%4)%4));}catch{return null;}
 if(signature.length!==expected.length)return null;
 const valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(raw,x=>x.charCodeAt(0)),new TextEncoder().encode(message));
 return valid?{cafeteriaId,studentId}:null;
}
