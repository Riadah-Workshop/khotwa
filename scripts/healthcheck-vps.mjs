// Docker health checks are separate from Coolify deployment success.
// This file does not print environment values or credentials.
try {
 const res=await fetch('http://127.0.0.1:3000/readyz',{signal:AbortSignal.timeout(3500)});
 if(!res.ok){console.error(`[khotwa-health] readiness returned HTTP ${res.status}`);process.exit(1);}
 const status=await res.json();
 if(status.service!=='khotwa'||status.status!=='ready'){
  console.error('[khotwa-health] unexpected readiness response');
  process.exit(1);
 }
}catch(error){
 console.error('[khotwa-health] readiness request failed:',error?.name||'error');
 process.exit(1);
}
