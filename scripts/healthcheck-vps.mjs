try{
 const res=await fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(2500)});
 if(!res.ok)process.exit(1);
 const status=await res.json();
 if(status.service!=='khotwa')process.exit(1);
}catch{process.exit(1);}
