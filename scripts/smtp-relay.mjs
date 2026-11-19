/**
 * Local-only, token-protected SMTP transport for the VPS staging deployment.
 * A Worker calls this private HTTP endpoint; the Node process handles TLS.
 * Never bind this listener to 0.0.0.0 or publish it from Docker.
 */
import http from 'node:http';
import tls from 'node:tls';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const BIND = '127.0.0.1';
const DEFAULT_PORT = 3765;
const MAX_REQUEST = 256 * 1024;
const TIMEOUT_MS = 20000;
const VALID_CODES = new Set(['SMTP_STAGE_CONNECT','SMTP_STAGE_GREETING','SMTP_STAGE_EHLO','SMTP_STAGE_AUTH',
  'SMTP_STAGE_MAIL_FROM','SMTP_STAGE_RCPT_TO','SMTP_STAGE_DATA','SMTP_STAGE_ACCEPT',
  'SMTP_AUTH_FAILED','SMTP_SERVER_REJECTED','SMTP_SENDER_MISMATCH','SMTP_CREDENTIALS_INCOMPLETE',
  'SMTP_TLS_FAILED','SMTP_CONNECTION_TIMEOUT','SMTP_PROTOCOL_ERROR']);
export class RelayMailError extends Error {
  constructor(code){super(code);this.code=code;this.name='RelayMailError';}
}
const mailbox=s=>typeof s==='string'&&s.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(s);
const mimeB64=s=>Buffer.from(s,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
const replyError=(stage,n)=>new RelayMailError(stage==='AUTH'&&[530,534,535].includes(n)?'SMTP_AUTH_FAILED':'SMTP_SERVER_REJECTED');
function waitForSecure(socket){
  return new Promise((resolve,reject)=>{
    if(socket.encrypted&&socket.authorized){resolve();return;}
    const ok=()=>{cleanup();resolve();};
    const bad=e=>{cleanup();reject(e);};
    const closed=()=>bad(new Error('Connection closed'));
    const cleanup=()=>{socket.off('secureConnect',ok);socket.off('error',bad);socket.off('close',closed);};
    socket.once('secureConnect',ok);socket.once('error',bad);socket.once('close',closed);
  });
}

export async function sendViaNodeTls(mail,env=process.env,connect=tls.connect){
  const host=env.KHOTWA_SMTP_HOST||'smtp.hostinger.com';
  const port=Number(env.KHOTWA_SMTP_PORT||'465');
  const user=env.KHOTWA_SMTP_USER;
  const from=env.KHOTWA_FROM_EMAIL;
  const password=env.KHOTWA_SMTP_PASSWORD;
  if(!mailbox(user)||!mailbox(from)||!password)throw new RelayMailError('SMTP_CREDENTIALS_INCOMPLETE');
  if(from.toLowerCase()!==user.toLowerCase())throw new RelayMailError('SMTP_SENDER_MISMATCH');
  if(!mailbox(mail.to)||typeof mail.subject!=='string'||typeof mail.html!=='string'||typeof mail.text!=='string')throw new RelayMailError('SMTP_PROTOCOL_ERROR');
  if(port!==465||!/^([a-z0-9.-]+)$/i.test(host))throw new RelayMailError('SMTP_PROTOCOL_ERROR');
  let stage='CONNECT';
  let socket;
  try {
    socket=connect({host,port,servername:host,rejectUnauthorized:true,timeout:TIMEOUT_MS});
    socket.on('timeout',()=>socket.destroy(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})));
    // A TCP connection alone is insufficient. Wait for authenticated TLS.
    await waitForSecure(socket);
    if(!socket.authorized)throw new RelayMailError('SMTP_TLS_FAILED');

    let buffer='';const lines=[];let waiting=null;let failure=null;
    const finishError=err=>{failure=err;if(waiting){const w=waiting;waiting=null;w.reject(err);}};
    const onData=chunk=>{
      buffer+=chunk.toString('utf8');
      if(buffer.length>65536){finishError(new Error('SMTP response oversized'));socket.destroy();return;}
      let i;
      while((i=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);
        if(waiting){const w=waiting;waiting=null;w.resolve(line);}else lines.push(line);
      }
    };
    const onError=err=>finishError(err);
    const onClose=()=>finishError(new Error('SMTP connection closed'));
    socket.on('data',onData);socket.on('error',onError);socket.on('close',onClose);
    async function line(){
      if(lines.length)return lines.shift();
      if(failure)throw failure;
      return new Promise((resolve,reject)=>{waiting={resolve,reject};});
    }
    async function reply(expected){
      const out=[];
      for(let n=0;n<40;n++){
        const l=await line();const m=/^(\d{3})([- ])(.*)$/.exec(l);
        if(!m)throw new RelayMailError('SMTP_PROTOCOL_ERROR');
        out.push(m[3]);
        if(m[2]==='-')continue;
        if(Number(m[1])!==expected)throw replyError(stage,Number(m[1]));
        return out;
      }
      throw new RelayMailError('SMTP_PROTOCOL_ERROR');
    }
    const write=message=>new Promise((resolve,reject)=>socket.write(message+'\r\n',e=>e?reject(e):resolve()));
    stage='GREETING';await reply(220);
    stage='EHLO';await write('EHLO khotwa.local');const features=(await reply(250)).join('\n').toUpperCase();
    stage='AUTH';
    if(/AUTH[^\r\n]*\bPLAIN\b/.test(features)){
      await write('AUTH PLAIN '+Buffer.from('\0'+user+'\0'+password).toString('base64'));await reply(235);
    }else if(/AUTH[^\r\n]*\bLOGIN\b/.test(features)){
      await write('AUTH LOGIN');await reply(334);
      await write(Buffer.from(user).toString('base64'));await reply(334);
      await write(Buffer.from(password).toString('base64'));await reply(235);
    }else throw new RelayMailError('SMTP_PROTOCOL_ERROR');
    stage='MAIL_FROM';await write('MAIL FROM:<'+from+'>');await reply(250);
    stage='RCPT_TO';await write('RCPT TO:<'+mail.to+'>');await reply(250);
    stage='DATA';await write('DATA');await reply(354);
    const boundary='khotwa-'+randomUUID().replaceAll('-','');
    const headers=[
      `From: =?UTF-8?B?${Buffer.from('Khotwa School Management').toString('base64')}?= <${from}>`,
      `To: <${mail.to}>`,`Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,
      `Date: ${new Date().toUTCString()}`,'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      'Auto-Submitted: auto-generated','X-Auto-Response-Suppress: All'];
    const parts=[`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',mimeB64(mail.text),
      `--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',mimeB64(mail.html),`--${boundary}--`];
    // Both bodies are base64 encoded, so SMTP dot-stuffing is unnecessary.
    const data=headers.join('\r\n')+'\r\n\r\n'+parts.join('\r\n')+'\r\n.\r\n';
    await new Promise((resolve,reject)=>socket.write(data,e=>e?reject(e):resolve()));
    stage='ACCEPT';await reply(250);
    try {await write('QUIT');await reply(221);} catch {/* DATA 250 is the acceptance marker. */}
  }catch(error){
    if(error instanceof RelayMailError)throw error;
    if(error?.code==='ETIMEDOUT'||error?.code==='ESOCKETTIMEDOUT'||String(error?.message||'').includes('timeout'))throw new RelayMailError('SMTP_CONNECTION_TIMEOUT');
    if(error?.code==='ERR_TLS_CERT_ALTNAME_INVALID'||error?.code==='UNABLE_TO_VERIFY_LEAF_SIGNATURE'||error?.code==='CERT_HAS_EXPIRED')throw new RelayMailError('SMTP_TLS_FAILED');
    throw new RelayMailError('SMTP_STAGE_'+stage);
  }finally{socket?.destroy();}
}

function tokenEquals(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function createRelayServer({token=process.env.KHOTWA_SMTP_RELAY_TOKEN,deliver=sendViaNodeTls}={}){
  if(!token||token.length<32)throw new Error('Missing internal relay authorization token');
  return http.createServer(async(req,res)=>{
    const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(req.url==='/internal/health'&&req.method==='GET')return reply(200,{ok:true});
    if(req.url!=='/internal/mail'||req.method!=='POST')return reply(404,{code:'NOT_FOUND'});
    if(!tokenEquals(req.headers['x-khotwa-relay-token'],token))return reply(401,{code:'UNAUTHORIZED'});
    let size=0;const chunks=[];
    try {
      for await(const chunk of req){size+=chunk.length;if(size>MAX_REQUEST)return reply(413,{code:'PAYLOAD_TOO_LARGE'});chunks.push(chunk);}
      const mail=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!mail||typeof mail!=='object'||!mailbox(mail.to)||!['subject','html','text'].every(k=>typeof mail[k]==='string'&&mail[k].length<140000)||mail.subject.length>300)return reply(400,{code:'INVALID_MESSAGE'});
      await deliver({to:mail.to,subject:mail.subject,html:mail.html,text:mail.text});
      return reply(200,{status:'smtp_accepted'});
    }catch(err){
      const code=err instanceof RelayMailError&&VALID_CODES.has(err.code)?err.code:'SMTP_PROTOCOL_ERROR';
      console.error('khotwa_local_smtp_relay_failed',{code});
      return reply(502,{code});
    }
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const relay=createRelayServer();
  relay.listen(DEFAULT_PORT,BIND,()=>console.log(`Khotwa private SMTP relay listening on ${BIND}:${DEFAULT_PORT}`));
}
