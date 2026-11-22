import {env} from 'cloudflare:workers';
import {getKhotwaAccess} from '../../../chatgpt-auth';
import {SCHOOL_TABLES,tableName} from '../../../../lib/school-tenancy';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){
 if((await getKhotwaAccess())?.role!=='main_admin')return json({error:'Admin only'},403);
 const params=new URL(req.url).searchParams,schoolId=params.get('schoolId')||'',name=params.get('table')||'',search=(params.get('q')||'').trim(),page=Number(params.get('page')||'0');
 if(!/^(?:default|[a-f0-9]{12})$/.test(schoolId)||!SCHOOL_TABLES.includes(name)||search.length>100||!Number.isSafeInteger(page)||page<0||page>10000)return json({error:'Invalid query'},400);
 try{
  const db=env.DB!,school=await db.prepare('SELECT id FROM khotwa_schools WHERE id=?').bind(schoolId).first();
  if(!school)return json({error:'School not found'},404);
  const table=tableName(schoolId,name),columns=(await db.prepare(`PRAGMA table_info("${table}")`).all<{name:string;pk:number}>()).results;
  const keys=columns.filter(c=>c.pk>0);
  if(keys.length!==1)return json({rows:[],key:null,error:'This table has no single primary key'});
  const key=keys[0].name;
  const candidates=[key,'name','title','full_name','phone','student_id','case_id'].filter(c=>columns.some(x=>x.name===c));
  const clause=search?' WHERE '+candidates.map(c=>`CAST("${c}" AS TEXT) LIKE ?`).join(' OR '):'';
  const args=search?candidates.map(()=>'%'+search.replace(/[%_]/g,'\\$&')+'%'):[];
  const rows=(await db.prepare(`SELECT * FROM "${table}"${clause} ORDER BY rowid DESC LIMIT 61 OFFSET ?`).bind(...args,page*60).all<Record<string,unknown>>()).results;
  // Avoid returning entire free-text student/care narratives; display identifying fields only.
  const pageRows=rows.slice(0,60);
  const fields=[key,'name','title','grade','classroom','student_id','case_id','type','status','date','phone','updated_at','created_at'].filter(c=>columns.some(x=>x.name===c));
  return json({key,rows:pageRows.map(r=>Object.fromEntries(fields.map(c=>[c,typeof r[c]==='string'?String(r[c]).slice(0,160):r[c]]))),hasMore:rows.length>60});
 }catch{return json({error:'Unable to load school records. Check database migrations.'},503);}
}
