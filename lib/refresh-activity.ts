const IDLE_AFTER=5*60*1000;
let lastActive=Date.now();
export function canBackgroundRefresh(){return typeof document!=='undefined'&&document.visibilityState==='visible'&&navigator.onLine!==false&&Date.now()-lastActive<IDLE_AFTER;}
export function monitorRefreshActivity(onResume:()=>void){
 lastActive=Date.now();let lastResume=0;
 const resume=()=>{if(document.visibilityState!=='visible'||navigator.onLine===false)return;const now=Date.now();lastActive=now;if(now-lastResume<15000)return;lastResume=now;onResume();};
 const activity=()=>{const idle=Date.now()-lastActive>60000;lastActive=Date.now();if(idle)resume();};
 const visible=()=>{if(document.visibilityState==='visible')resume();};
 const events=['pointerdown','keydown','scroll'];events.forEach(name=>window.addEventListener(name,activity,{passive:true}));
 window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',visible);
 return ()=>{events.forEach(name=>window.removeEventListener(name,activity));window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',visible);};
}
