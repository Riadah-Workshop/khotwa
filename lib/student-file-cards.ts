export type FileCardStudent={id:string;name:string;grade:string;classroom:string;phone:string;guardian:string;active:number};
const order:Record<string,number>={'الأول':1,'الثاني':2,'الثالث':3,'الرابع':4,'الخامس':5,'السادس':6};
const normalize=(s:string)=>s.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064b-\u065f]/g,'').toLowerCase();
export function fileCardRoster(students:FileCardStudent[],grade='',classroom='',query=''){
 return students.filter(s=>s.active&&(!grade||s.grade===grade)&&(!classroom||s.classroom===classroom)&&normalize([s.name,s.phone,s.guardian].join(' ')).includes(normalize(query))).sort((a,b)=>(order[a.grade]||99)-(order[b.grade]||99)||a.classroom.localeCompare(b.classroom,'ar')||a.name.localeCompare(b.name,'ar'));
}
export function fileCardPages(students:FileCardStudent[],selected:ReadonlySet<string>){
 const chosen=fileCardRoster(students).filter(s=>selected.has(s.id)),pages:FileCardStudent[][]=[];for(let i=0;i<chosen.length;i+=16)pages.push(chosen.slice(i,i+16).map(s=>({...s})));return pages;
}
