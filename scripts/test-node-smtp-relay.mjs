import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {once} from 'node:events';
import {createRelayServer,RelayMailError,sendViaNodeTls} from './smtp-relay.mjs';
import {sendHostingerSmtp,SmtpRelayError} from '../lib/hostinger-smtp.ts';

const env={KHOTWA_SMTP_HOST:'smtp.hostinger.com',KHOTWA_SMTP_PORT:'465',KHOTWA_SMTP_USER:'noreply@example.test',KHOTWA_FROM_EMAIL:'noreply@example.test',KHOTWA_SMTP_PASSWORD:'fake-secret'};
const mail={to:'teacher@example.test',subject:'خطوة | تفعيل الحساب',html:'<div>Welcome</div>',text:'Activation'};
let calls=[];
class FakeTls extends EventEmitter{
 authorized=true;encrypted=true;
 constructor(){super();queueMicrotask(()=>this.emit('secureConnect'));setImmediate(()=>this.emit('data',Buffer.from('220 Fake SMTP ready\r\n')));}
 write(command,callback){
  calls.push(command.substring(0,20));
  const send=t=>queueMicrotask(()=>this.emit('data',Buffer.from(t)));
  if(command.startsWith('EHLO '))send('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1000\r\n');
  else if(command.startsWith('AUTH PLAIN '))send('235 2.7.0 OK\r\n');
  else if(command.startsWith('MAIL FROM:'))send('250 OK\r\n');
  else if(command.startsWith('RCPT TO:'))send('250 OK\r\n');
  else if(command.startsWith('DATA\r\n'))send('354 Go ahead\r\n');
  else if(command.startsWith('From: '))send('250 Queued\r\n');
  else if(command.startsWith('QUIT\r\n'))send('221 Closing\r\n');
  else throw new Error('Unexpected SMTP command');
  queueMicrotask(()=>callback?.());return true;
 }
 destroy(){this.emit('close');}
}
await sendViaNodeTls(mail,env,()=>new FakeTls());
assert(calls.some(v=>v.startsWith('AUTH PLAIN')));
assert(calls.some(v=>v.startsWith('From:')));
await assert.rejects(()=>sendViaNodeTls(mail,{...env,KHOTWA_FROM_EMAIL:'other@example.test'},()=>new FakeTls()),e=>e.code==='SMTP_SENDER_MISMATCH');

const token='test-secure-relay-token-is-32-chars-long';
let delivered=0;
const relay=createRelayServer({token,deliver:async message=>{assert.equal(message.to,mail.to);delivered++;}});
relay.listen(0,'127.0.0.1');await once(relay,'listening');
const port=relay.address().port;
const relayUrl=`http://127.0.0.1:${port}/internal/mail`;
try {
 const unauthorized=await fetch(relayUrl,{method:'POST',body:JSON.stringify(mail)});
 assert.equal(unauthorized.status,401);
 const config={host:'smtp.hostinger.com',port:465,user:env.KHOTWA_SMTP_USER,password:env.KHOTWA_SMTP_PASSWORD,from:env.KHOTWA_FROM_EMAIL,...mail,relayUrl,relayToken:token};
 await sendHostingerSmtp(config);
 assert.equal(delivered,1);
 await assert.rejects(()=>sendHostingerSmtp({...config,relayToken:'incorrect-token-of-length-32-chars'}),e=>e instanceof SmtpRelayError);
 const bad=await fetch(relayUrl,{method:'POST',headers:{'X-Khotwa-Relay-Token':token},body:JSON.stringify({...mail,to:'evil\r\nheader@example.test'})});
 assert.equal(bad.status,400);
 assert.equal(delivered,1);
}finally{relay.close();}
console.log('Node SMTP relay tests passed: native TLS SMTP dialogue, localhost authentication, Worker request, invalid mail rejection.');
