/** Administrator credentials are optionally overridden in D1 after a verified in-app change.
 * Coolify environment credentials are used only until a database override is saved.
 * Recovering a lost administrator password after that requires a controlled database recovery. */
export type AdminCredentials={email:string;passwordHash:string;version:number;fromDatabase:boolean};
export async function adminCredentials(env:{DB?:D1Database;KHOTWA_ADMIN_EMAIL?:string;KHOTWA_ADMIN_PASSWORD_HASH?:string}):Promise<AdminCredentials>{
 const fallback={email:(env.KHOTWA_ADMIN_EMAIL||'').trim().toLowerCase(),passwordHash:env.KHOTWA_ADMIN_PASSWORD_HASH||'',version:1,fromDatabase:false};
 if(!env.DB)return fallback;
 const row=await env.DB.prepare('SELECT email,password_hash,session_version FROM khotwa_admin_credentials WHERE id=1').bind().first<{email:string;password_hash:string;session_version:number}>();
 return row?{email:row.email,passwordHash:row.password_hash,version:row.session_version,fromDatabase:true}:fallback;
}
