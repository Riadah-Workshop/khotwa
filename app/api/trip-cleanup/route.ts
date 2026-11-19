import {getTenantDb} from '../../../lib/school-tenancy';
import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
// One-time maintenance: the owner configures one target and a short-lived secret.
// No request can select another trip. Disabled when the secret is removed.
export async function POST(req:Request){
 const e=({...env as unknown as {DB:D1Database;BUCKET:R2Bucket;TRIP_PURGE_KEY?:string;TRIP_PURGE_ID?:string;TRIP_PURGE_EXPIRES_AT?:string},DB:getTenantDb()});
 const expires=Date.parse(e.TRIP_PURGE_EXPIRES_AT||'');
 if(!e.TRIP_PURGE_KEY||!e.TRIP_PURGE_ID||!Number.isFinite(expires)||expires<Date.now()||expires>Date.now()+3600000||req.headers.get('authorization')!=='Bearer '+e.TRIP_PURGE_KEY)return json({error:'غير مسموح'},403);
 try{
 const id=e.TRIP_PURGE_ID,trip=await e.DB.prepare('SELECT id FROM school_trips WHERE id=?').bind(id).first();
 if(!trip)return json({ok:true,alreadyDeleted:true});
 await e.DB.prepare("UPDATE school_trips SET status='closed',execution_status='completed',revision=revision+1 WHERE id=?").bind(id).run();
 const rows=(await e.DB.prepare('SELECT id,file_key FROM school_evidence WHERE trip_id=?').bind(id).all()).results as {id:string;file_key:string}[];
 let deletedFiles=0;
 for(const row of rows){let cursor:string|undefined;do{const page=await e.BUCKET.list({prefix:'evidence/'+row.id+'/',cursor});for(const object of page.objects){await e.BUCKET.delete(object.key);if(await e.BUCKET.head(object.key))throw new Error('file deletion incomplete');deletedFiles++;}cursor=page.truncated?page.cursor:undefined;}while(cursor);}
 const result=await e.DB.batch([e.DB.prepare('DELETE FROM school_evidence WHERE trip_id=?').bind(id),e.DB.prepare('DELETE FROM school_trip_students WHERE trip_id=?').bind(id),e.DB.prepare('DELETE FROM school_trips WHERE id=?').bind(id)]);
 return json({ok:true,deletedFiles,deletedEvidence:result[0].meta.changes,deletedParticipants:result[1].meta.changes,deletedTrips:result[2].meta.changes});
 }catch{return json({error:'لم يكتمل الحذف. أعد المحاولة.'},503);}
}
