/** Direct TLS SMTP submission from the Cloudflare Worker-compatible runtime.
 * No HTTP mail proxy and no third-party API key are required.
 * A 250 after DATA means accepted by the outgoing SMTP server, not delivered.
 */
export type SmtpOptions={host:string;port:number;user:string;password:string;from:string;to:string;subject:string;html:string;text:string};
type SocketLike={opened:Promise<unknown>;readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;close:()=>void|Promise<void>};
export type SmtpConnector=(address:{hostname:string;port:number},options:{secureTransport:'on'})=>SocketLike;
export type SmtpStage='CONNECT'|'GREETING'|'EHLO'|'AUTH'|'MAIL_FROM'|'RCPT_TO'|'DATA'|'ACCEPT';
/** A safe, machine-readable stage only; never attach SMTP credentials or raw server text. */
export class SmtpStageError extends Error {
 readonly stage:SmtpStage;
 readonly failureType:'timeout'|'network'|'runtime'|'other';
 constructor(stage:SmtpStage,failureType:'timeout'|'network'|'runtime'|'other'){
  super(`SMTP transport failure at ${stage}: ${failureType}`);
  this.name='SmtpStageError';
  this.stage=stage;
  this.failureType=failureType;
 }
}
const classifyTransportFailure=(err:unknown,timedOut:boolean):'timeout'|'network'|'runtime'|'other'=>{
 if(timedOut)return 'timeout';
 const name=err instanceof Error?err.name:'';
 const code=(typeof err==='object'&&err!==null&&'code' in err&&typeof err.code==='string')?err.code:'';
 if(/^(TimeoutError|AbortError)$/.test(name)||/^(ETIMEDOUT|ESOCKETTIMEDOUT)$/.test(code))return 'timeout';
 if(/^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/.test(code))return 'network';
 if(/^(TypeError|ReferenceError|SyntaxError)$/.test(name))return 'runtime';
 return 'other';
};
const encoder=new TextEncoder();
const decode=new TextDecoder();
const b64=(value:string)=>{
 const bytes=encoder.encode(value);
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
};
const foldBase64=(value:string)=>b64(value).match(/.{1,76}/g)?.join('\r\n')||'';
const mailbox=(value:string)=>{
 if(!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value)||value.length>254)throw new Error('Invalid SMTP mailbox');
 return value;
};
async function workerConnect(address:{hostname:string;port:number},options:{secureTransport:'on'}):Promise<SocketLike>{
 // Dynamically loaded so offline Node tests can supply an isolated socket.
 const {connect}=await import('cloudflare:sockets');
 return connect(address,options);
}
export async function sendHostingerSmtp(options:SmtpOptions,connector?:SmtpConnector):Promise<void>{
 const host=options.host.trim();
 if(!/^[a-z0-9.-]+$/i.test(host)||host.length>253||options.port!==465)throw new Error('Only implicit TLS SMTP port 465 is supported');
 const from=mailbox(options.from),to=mailbox(options.to),user=mailbox(options.user);
 if(!options.password||options.password.length>512||/[\r\n]/.test(options.password))throw new Error('Missing SMTP credentials');
 if(from.toLowerCase()!==user.toLowerCase())throw new Error('SMTP_FROM must match SMTP_USER');
 // The outgoing SMTP server cannot be trusted for mail-delivery or read receipts.
 let socket:SocketLike|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let timedOut=false;
 let stage:SmtpStage='CONNECT';
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 let writer:WritableStreamDefaultWriter<Uint8Array>|undefined;
 try{
  socket=connector?connector({hostname:host,port:options.port},{secureTransport:'on'}):await workerConnect({hostname:host,port:options.port},{secureTransport:'on'});
  timer=setTimeout(()=>{timedOut=true;try{void Promise.resolve(socket?.close()).catch(()=>{});}catch{}},18000);
  // Cloudflare Socket API exposes .opened, not .ready. Wait for TLS negotiation.
  await socket.opened;
  reader=socket.readable.getReader();writer=socket.writable.getWriter();
  let buffer='';let replyBytes=0;
  const readLine=async()=>{
   while(!buffer.includes('\n')){
    const next=await reader!.read();
    if(next.done)throw new Error('SMTP connection closed');
    replyBytes+=next.value.byteLength;
    if(replyBytes>40000)throw new Error('SMTP response too large');
    buffer+=decode.decode(next.value,{stream:true});
   }
   const index=buffer.indexOf('\n');const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);
   return line;
  };
  const reply=async(expected:number)=>{
   const lines:string[]=[];
   for(;;){
    const line=await readLine();const m=line.match(/^(\d{3})([ -])(.*)$/);
    if(!m)throw new Error('Invalid SMTP reply');
    lines.push(m[3]);
    if(m[2]==='-')continue;
    if(Number(m[1])!==expected)throw new Error(`SMTP server returned ${m[1]} (expected ${expected})`);
    return lines;
   }
  };
  const send=async(command:string)=>{await writer!.write(encoder.encode(command+'\r\n'));};
  stage='GREETING';
  await reply(220);
  stage='EHLO';
  await send('EHLO khotwa.local');
  const features=(await reply(250)).join('\n').toUpperCase();
  // Never transmit credentials before TLS: the socket is TLS from connection start.
  stage='AUTH';
  if(/AUTH[^\r\n]*\bPLAIN\b/.test(features)){
   await send('AUTH PLAIN '+b64('\0'+user+'\0'+options.password));
   await reply(235);
  }else if(/AUTH[^\r\n]*\bLOGIN\b/.test(features)){
   await send('AUTH LOGIN');await reply(334);
   await send(b64(user));await reply(334);
   await send(b64(options.password));await reply(235);
  }else throw new Error('SMTP server did not advertise supported authentication');
  stage='MAIL_FROM';
  await send('MAIL FROM:<'+from+'>');await reply(250);
  stage='RCPT_TO';
  await send('RCPT TO:<'+to+'>');await reply(250);
  stage='DATA';
  await send('DATA');await reply(354);
  const boundary='khotwa-'+crypto.randomUUID().replace(/-/g,'');
  const now=new Date().toUTCString();
  const headers=[
   'From: =?UTF-8?B?'+b64('Khotwa School Management')+'?= <'+from+'>',
   'To: <'+to+'>',
   'Subject: =?UTF-8?B?'+b64(options.subject)+'?=',
   'Date: '+now,
   'MIME-Version: 1.0',
   'Content-Type: multipart/alternative; boundary="'+boundary+'"',
   'Auto-Submitted: auto-generated',
   'X-Auto-Response-Suppress: All'
  ];
  const parts=[
   '--'+boundary,
   'Content-Type: text/plain; charset=UTF-8',
   'Content-Transfer-Encoding: base64','',foldBase64(options.text),
   '--'+boundary,
   'Content-Type: text/html; charset=UTF-8',
   'Content-Transfer-Encoding: base64','',foldBase64(options.html),
   '--'+boundary+'--'
  ];
  await writer.write(encoder.encode(headers.join('\r\n')+'\r\n\r\n'+parts.join('\r\n')+'\r\n.\r\n'));
  stage='ACCEPT';
  await reply(250);
  // Once DATA was accepted, SMTP has accepted responsibility for relaying.
  try{await send('QUIT');await reply(221);}catch{/* The DATA 250 is the acceptance signal. */}
 }catch(error){
  // Preserve explicit, internally generated SMTP errors (535, 550, etc.).
  // Do not return free-form remote responses or raw exception text to administrators.
  if(error instanceof Error&&/^(SMTP server returned \d{3} \(expected \d{3}\)|Invalid SMTP reply|SMTP response too large|SMTP server did not advertise supported authentication)$/.test(error.message))throw error;
  throw new SmtpStageError(stage,classifyTransportFailure(error,timedOut));
 }finally{
  if(timer!==undefined)clearTimeout(timer);
  try{reader?.releaseLock();}catch{}
  try{writer?.releaseLock();}catch{}
  try{void Promise.resolve(socket?.close()).catch(()=>{});}catch{}
 }
}
