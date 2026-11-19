import assert from 'node:assert/strict';
import {sendHostingerSmtp} from '../lib/hostinger-smtp.ts';
const enc=new TextEncoder(),dec=new TextDecoder();
let outbound='';let auth='';let recipient='';let socketClosed=false;let methods=[];
const fakeConnect=(address,options)=>{
 assert.deepEqual(address,{hostname:'smtp.hostinger.com',port:465});
 assert.equal(options.secureTransport,'on');
 let controller, dataMode=false;
 const readable=new ReadableStream({start(c){controller=c;c.enqueue(enc.encode('220 smtp.hostinger.com ESMTP ready\r\n'));}});
 const emit=(v)=>controller.enqueue(enc.encode(v));
 const writable=new WritableStream({write(chunk){
  const input=dec.decode(chunk);methods.push(input.split(/[ \r\n]/)[0]);
  if(dataMode){
   outbound=input;
   assert.match(outbound,/Subject: =\?UTF-8\?B\?/);
   assert.match(outbound,/Content-Type: multipart\/alternative/);
   assert.match(outbound,/\r\n\.\r\n$/);
   emit('250 2.0.0 queued for delivery\r\n');dataMode=false;
  }else if(input.startsWith('EHLO '))emit('250-smtp.hostinger.com\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 35000000\r\n');
  else if(input.startsWith('AUTH PLAIN ')){
   auth=atob(input.slice('AUTH PLAIN '.length).trim());
   emit('235 2.7.0 Authentication successful\r\n');
  }else if(input.startsWith('MAIL FROM:'))emit('250 2.1.0 Sender ok\r\n');
  else if(input.startsWith('RCPT TO:')){recipient=input;emit('250 2.1.5 Recipient ok\r\n');}
  else if(input.startsWith('DATA')){dataMode=true;emit('354 End with <CR><LF>.<CR><LF>\r\n');}
  else if(input.startsWith('QUIT'))emit('221 bye\r\n');
  else throw new Error('unexpected SMTP command '+input.slice(0,15));
 }});
 return {readable,writable,ready:Promise.resolve(),close(){if(!socketClosed){socketClosed=true;try{controller.close();}catch{}}}};
};
const config={host:'smtp.hostinger.com',port:465,user:'noreply@example.test',password:'fake-mailbox-secret',from:'noreply@example.test',to:'deputy@example.test',subject:'خطوة | تفعيل حساب وكيل شؤون الطلاب',text:'رابط التفعيل: https://example.test/activate?token=123',html:'<div dir="rtl">مرحباً <a href="https://example.test/activate?token=123">تفعيل</a></div>'};
await sendHostingerSmtp(config,fakeConnect);
assert.equal(auth,'\0noreply@example.test\0fake-mailbox-secret');
assert.match(recipient,/RCPT TO:<deputy@example\.test>/);
assert.ok(socketClosed);
assert.ok(methods.includes('DATA'));
await assert.rejects(()=>sendHostingerSmtp({...config,port:25},fakeConnect),/TLS SMTP port 465/);
await assert.rejects(()=>sendHostingerSmtp({...config,from:'injected@example.test'},fakeConnect),/must match/);
console.log('Hostinger SMTP tests passed: TLS connection, authentication, recipient, MIME body, SMTP acceptance, invalid port/sender');
