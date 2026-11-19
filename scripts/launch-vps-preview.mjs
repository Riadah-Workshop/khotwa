import {spawnSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
// This launcher is intentionally for a PASSWORD-PROTECTED STAGING preview.
// Wrangler dev + Miniflare is not a supported hardened production server.
const required=['KHOTWA_ADMIN_EMAIL','KHOTWA_ADMIN_PASSWORD_HASH','KHOTWA_SESSION_SECRET'];
for(const key of required)if(!process.env[key]){console.error('Missing required environment variable:',key);process.exit(1);}
// A PBKDF2 hash contains three literal '$' separators. Coolify / Compose can
// mistakenly expand unquoted hash fragments as variable names. Detect corruption
// before starting rather than allowing all administrator logins to fail.
const adminHash=process.env.KHOTWA_ADMIN_PASSWORD_HASH||'';
const hashParts=adminHash.split('$');
if(hashParts.length!==4||hashParts[0]!=='pbkdf2-sha256'||!/^\d+$/.test(hashParts[1])||
   !/^[A-Za-z0-9_-]{22,}$/.test(hashParts[2])||! /^[A-Za-z0-9_-]{43}$/.test(hashParts[3])){
  console.error('Invalid KHOTWA_ADMIN_PASSWORD_HASH: expected PBKDF2 record with literal dollar-sign separators. Check Coolify literal variable / Docker Compose interpolation.');
  process.exit(1);
}
const vars=[...required,'KHOTWA_PUBLIC_ORIGINS','VISITOR_PORTAL_URL','VISITOR_ADMIN_KEY','PARENT_SERVICE_KEY','BACKUP_EXPORT_KEY','BACKUP_EXPORT_EXPIRES_AT','CARE_IMPORT_KEY'];
const file='dist/server/.dev.vars';
mkdirSync('dist/server',{recursive:true});
// Wrangler reads vars for the Worker from the same directory as its config.
writeFileSync(file,vars.filter(key=>process.env[key]!=null).map(key=>key+'='+JSON.stringify(process.env[key])).join('\n')+'\n',{mode:0o600});
chmodSync(file,0o600);
mkdirSync('/data/state',{recursive:true});
const cli='./node_modules/wrangler/bin/wrangler.js';
const config='dist/server/wrangler.json';
console.log('Applying any pending Khotwa migrations against the persistent local D1 store...');
const migrations=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--config',config,'--persist-to','/data/state'],{stdio:'inherit',env:{...process.env,CI:'true'}});
if(migrations.status!==0){console.error('Migrations did not complete, refusing to launch.');process.exit(migrations.status||1);}
console.log('Starting Khotwa STAGING preview on port 3000. Do not use as a production server.');
const app=spawn(process.execPath,[cli,'dev','--config',config,'--local','--persist-to','/data/state','--ip','0.0.0.0','--port','3000','--inspector-port','0'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.kill(signal));
app.on('exit',(code,signal)=>{console.log('Preview server stopped',code,signal||'');process.exit(code??1);});
