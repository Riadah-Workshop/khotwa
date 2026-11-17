export type EvidenceAttachment={file:File;id?:string};
export function validateEvidenceAttachments(files:File[]){
 if(files.length>20)return 'اختر حتى 20 ملفًا في الدفعة الواحدة';
 if(files.some(f=>f.size>8*1024*1024))return 'الحد الأقصى للمرفق 8 ميجابايت';
 if(files.some(f=>!['application/pdf','image/png','image/jpeg','image/webp'].includes(f.type)))return 'الملفات المدعومة PDF وPNG وJPEG وWebP فقط';
 return '';
}
// Keep the saved record ID on failed uploads so retries never create duplicate records.
export async function saveEvidenceAttachments(entries:EvidenceAttachment[],create:(file:File)=>Promise<string|null>,upload:(id:string,file:File)=>Promise<boolean>,progress:(completed:number,total:number)=>void){
 const remaining:EvidenceAttachment[]=[];let saved=0;
 for(const entry of entries){let id=entry.id;try{id=id||await create(entry.file)||undefined;if(id&&await upload(id,entry.file))saved++;else remaining.push({...entry,id});}catch{remaining.push({...entry,id});}progress(saved,entries.length);}
 return {saved,remaining};
}
