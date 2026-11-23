import {spawnSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
// This launcher is intentionally for a PASSWORD-PROTECTED STAGING preview.
// Wrangler dev + Miniflare is not a supported hardened production server.
console.log('[khotwa-startup] Checking required runtime configuration (names only; values redacted).');
const required=['KHOTWA_ADMIN_EMAIL','KHOTWA_ADMIN_PASSWORD_HASH','KHOTWA_SESSION_SECRET'];
for(const key of required)if(!process.env[key]){console.error('Missing required environment variable:',key);process.exit(1);}
// A PBKDF2 hash contains three literal '$' separators. Coolify / Compose can
// mistakenly expand unquoted hash fragments as variable names. Detect corruption
// before starting rather than allowing all administrator logins to fail.
if((process.env.KHOTWA_SESSION_SECRET||'').length<32){console.error('[khotwa-startup] KHOTWA_SESSION_SECRET must have at least 32 characters.');process.exit(1);}
const adminHash=process.env.KHOTWA_ADMIN_PASSWORD_HASH||'';
const hashParts=adminHash.split('$');
if(hashParts.length!==4||hashParts[0]!=='pbkdf2-sha256'||!/^\d+$/.test(hashParts[1])||
   !/^[A-Za-z0-9_-]{22,}$/.test(hashParts[2])||! /^[A-Za-z0-9_-]{43}$/.test(hashParts[3])){
  console.error('Invalid KHOTWA_ADMIN_PASSWORD_HASH: expected PBKDF2 record with literal dollar-sign separators. Check Coolify literal variable / Docker Compose interpolation.');
  process.exit(1);
}
const runtimeEnv={...process.env, KHOTWA_SMTP_RELAY_TOKEN:randomBytes(32).toString('hex'), KHOTWA_SMTP_RELAY_URL:'http://127.0.0.1:3765/internal/mail'};
const vars=[...required,'KHOTWA_SMTP_RELAY_TOKEN','KHOTWA_SMTP_RELAY_URL','KHOTWA_PUBLIC_ORIGINS','KHOTWA_APP_URL','KHOTWA_FROM_EMAIL','KHOTWA_SMTP_HOST','KHOTWA_SMTP_PORT','KHOTWA_SMTP_USER','KHOTWA_SMTP_PASSWORD','RESEND_API_KEY','RESEND_WEBHOOK_SECRET','VISITOR_PORTAL_URL','VISITOR_ADMIN_KEY','PARENT_SERVICE_KEY','BACKUP_EXPORT_KEY','BACKUP_EXPORT_EXPIRES_AT','CARE_IMPORT_KEY'];
const file='dist/server/.dev.vars';
try {mkdirSync('dist/server',{recursive:true});} catch(error){console.error('[khotwa-startup] Cannot create Wrangler runtime directory:',error?.code||'error');process.exit(1);}
// Wrangler reads vars for the Worker from the same directory as its config.
try {
 writeFileSync(file,vars.filter(key=>runtimeEnv[key]!=null).map(key=>key+'='+JSON.stringify(runtimeEnv[key])).join('\n')+'\n',{mode:0o600});
 chmodSync(file,0o600);
 mkdirSync('/data/state',{recursive:true});
} catch(error){console.error('[khotwa-startup] Could not initialize runtime files or persisted storage:',error?.code||'error');process.exit(1);}
const cli='./node_modules/wrangler/bin/wrangler.js';
const config='dist/server/wrangler.json';
console.log('[khotwa-startup] Applying pending D1 migrations to /data/state (persistent data is preserved)...');
const migrations=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--config',config,'--persist-to','/data/state'],{stdio:'inherit',env:{...process.env,CI:'true'}});
if(migrations.error||migrations.signal||migrations.status!==0){
 console.error('[khotwa-startup] D1 migration failed. Look ABOVE this line for Wrangler SQL errors. No stored data was intentionally deleted.',{exitCode:migrations.status,signal:migrations.signal,errorCode:migrations.error?.code||null});
 process.exit(migrations.status||1);
}
console.log('[khotwa-startup] D1 migrations complete.');
// The private SMTP relay runs in the Node runtime (native TLS) alongside Wrangler.
// It is strictly loopback-only and the Worker uses an ephemeral bearer token.
const relay=spawn(process.execPath,['scripts/smtp-relay.mjs'],{stdio:'inherit',env:runtimeEnv});
relay.on('error',err=>{console.error('Private SMTP relay failed to start:',err.code||'error');process.exit(1);});
for(let tries=0;tries<40;tries++){
 try{
  const res=await fetch('http://127.0.0.1:3765/internal/health',{signal:AbortSignal.timeout(500)});
  if(res.ok)break;
 }catch{}
 if(relay.exitCode!==null){console.error('Private SMTP relay exited prematurely.');process.exit(1);}
 if(tries===39){console.error('Private SMTP relay health check failed.');relay.kill();process.exit(1);}
 await new Promise(resolve=>setTimeout(resolve,150));
}
console.log('[khotwa-startup] SMTP relay is ready. Starting Khotwa preview on port 3000 (not a hardened production runtime).');
const app=spawn(process.execPath,[cli,'dev','--config',config,'--local','--persist-to','/data/state','--ip','0.0.0.0','--port','3000','--inspector-port','0'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{app.kill(signal);relay.kill(signal);});
app.on('error',error=>{console.error('[khotwa-startup] Wrangler process failed to launch:',error?.code||'error');relay.kill();process.exit(1);});
app.on('exit',(code,signal)=>{relay.kill();console.error('[khotwa-startup] Wrangler stopped.',{exitCode:code,signal:signal||null});process.exit(code??1);});
relay.on('exit',(code)=>{if(app.exitCode===null){console.error('Private SMTP relay stopped unexpectedly',code);app.kill();process.exit(1);}});
