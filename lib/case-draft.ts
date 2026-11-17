import {z} from 'zod';
import {CASE_TYPES,CLASS_LATE_TYPE,caseExtraSchema,type CaseExtra} from './case-fields';

export const DRAFT_TTL=24*60*60*1000;
export type DraftLane='case'|'class-late';
const formSchema=z.object({studentId:z.string().max(200),type:z.enum(CASE_TYPES),occurredAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).refine(s=>Number.isFinite(Date.parse(s+':00+03:00'))),details:z.string().max(3000),action:z.string().max(3000),extra:caseExtraSchema,followStatus:z.enum(['none','open','done'])});
export type DraftForm=Omit<z.infer<typeof formSchema>,'type'|'followStatus'|'extra'>&{type:string;followStatus:string;extra:CaseExtra};
export type CaseDraft={version:1;savedAt:number;form:DraftForm};
export function draftKey(owner:string,lane:DraftLane){return 'khotwa:case-draft:v1:'+encodeURIComponent(owner.trim().toLowerCase())+':'+lane;}
export function parseDraft(raw:string|null,lane:DraftLane,now=Date.now()):CaseDraft|null{
 if(!raw||raw.length>30000)return null;
 try{const value=z.object({version:z.literal(1),savedAt:z.number().finite(),form:formSchema}).parse(JSON.parse(raw));
  if(value.savedAt>now+60000||now-value.savedAt>=DRAFT_TTL||(value.form.type===CLASS_LATE_TYPE)!==(lane==='class-late'))return null;
  return value;
 }catch{return null;}
}
