import {env} from 'cloudflare:workers';
import {verifyResendWebhook} from '../../../../lib/deputy-invites';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!env.RESEND_WEBHOOK_SECRET||!env.DB)return new Response('Not configured',{status:503});
 const body=await req.text();if(body.length>15000)return new Response('Too large',{status:413});
 if(!await verifyResendWebhook(body,req.headers,env.RESEND_WEBHOOK_SECRET))return new Response('Invalid signature',{status:401});
 try{
  const event=JSON.parse(body) as {type?:string;data?:{email_id?:string}};
  const id=event.data?.email_id;if(!id||typeof id!=='string'||id.length>200)return new Response('OK');
  const status:Record<string,string>={'email.delivered':'delivered','email.bounced':'bounced','email.failed':'failed','email.delivery_delayed':'delayed'};
  const next=status[event.type||''];if(next){
   const now=new Date().toISOString();
   // Delivery is to the receiving mail server, not proof the person opened the email.
   await env.DB.batch([
    env.DB.prepare('INSERT INTO khotwa_deputy_email_events(email_id,status,seen_at) VALUES(?,?,?) ON CONFLICT(email_id) DO UPDATE SET status=excluded.status,seen_at=excluded.seen_at').bind(id,next,now),
    env.DB.prepare("UPDATE khotwa_accounts SET invitation_status=?,email_delivered_at=CASE WHEN ?='delivered' THEN ? ELSE email_delivered_at END WHERE email_provider_id=?").bind(next,next,now,id)
   ]);
  }
  return new Response('OK');
 }catch{return new Response('Invalid payload',{status:400});}
}
