/** Pure SQL token rewriting: no database or runtime imports. */
export const LEGACY_SCHOOL_ID='default';
const SCHOOL_ID=/^[a-f0-9]{12}$/;
const TABLES=['students','cases','contacts','followups','settings','attendance','attendance_rounds','attendance_audit','absence_followups','absence_events','case_revisions','parent_grants','student_families','school_trips','school_trip_students','school_tasks','school_evidence','student_care','care_intake','desk_closures','platform_papers','compatibility_runs','student_movements'];
const TABLE_SET=new Set(TABLES);

export function tenantPrefix(schoolId:string):string {
 if(schoolId===LEGACY_SCHOOL_ID)return '';
 if(!SCHOOL_ID.test(schoolId))throw new Error('Invalid school identity');
 return 'tenant_'+schoolId+'_';
}
export function tableName(schoolId:string,name:string):string {
 if(!TABLE_SET.has(name))throw new Error('Unrecognized school table');
 return tenantPrefix(schoolId)+name;
}
export function rewriteSchoolSql(sql:string,schoolId:string):string {
 const prefix=tenantPrefix(schoolId);
 if(!prefix)return sql;
 const token=/('(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]+\]|[A-Za-z_][A-Za-z_0-9]*)/g;
 return sql.replace(token,raw=>{
  if(raw.startsWith("'")||raw.startsWith('--')||raw.startsWith('/*'))return raw;
  const q=raw[0],quoted=q==='"'||q==='`'||q==='[';
  const name=quoted?raw.slice(1,-1):raw;
  if(!TABLE_SET.has(name))return raw;
  return quoted?q+prefix+name+(q==='['?']':q):prefix+name;
 });
}

export const SCHOOL_TABLES=Object.freeze([...TABLES]);
