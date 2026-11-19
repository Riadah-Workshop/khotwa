/** Password hashing shared by main-admin managed deputy and parent identities. */
const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');};
const fromB64=(s:string)=>{try{if(!/^[A-Za-z0-9_-]+$/.test(s))return null;const v=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(v,c=>c.charCodeAt(0));}catch{return null;}};
export async function verifyPassword(password:string,record:string):Promise<boolean>{
 if(password.length>1024||!record)return false;
 const parts=record.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256')return false;
 const iterations=Number(parts[1]),salt=fromB64(parts[2]),expected=fromB64(parts[3]);
 if(!Number.isInteger(iterations)||iterations<200000||iterations>1000000||!salt||salt.length<16||!expected||expected.length!==32)return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
 let mismatch=0;for(let i=0;i<32;i++)mismatch|=derived[i]^expected[i];return mismatch===0;
}
export async function hashPassword(password:string):Promise<string>{
 if(password.length<12||password.length>1024)throw new Error('Password length must be 12–1024 characters');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:240000},key,256));
 return 'pbkdf2-sha256$240000$'+b64(salt)+'$'+b64(bits);
}
export function temporaryPassword():string {
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return [...bytes].map(b=>alphabet[b%alphabet.length]).join('');
}
