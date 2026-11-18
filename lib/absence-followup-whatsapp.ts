// Normalize display input only. Student records remain unchanged.
export function absenceFollowupPhone(value:string):string {
 let digits=value.trim().replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/[۰-۹]/g,n=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)));
 if(/[^\d\s()+.\-]/.test(digits))return '';
 digits=digits.replace(/\D/g,'');
 if(digits.startsWith('00'))digits=digits.slice(2);
 if(/^05\d{8}$/.test(digits))digits='966'+digits.slice(1);
 else if(/^5\d{8}$/.test(digits))digits='966'+digits;
 else if(/^96605\d{8}$/.test(digits))digits='966'+digits.slice(4);
 return /^[1-9]\d{8,14}$/.test(digits)?digits:'';
}
export function absenceFollowupMessage(student:{name:string},follow:{totalCount:number;lastAbsent:string},school:string):string {
 return `ولي أمر الطالب ${student.name}، السلام عليكم.\n${school}\nبلغ غياب الطالب ${follow.totalCount} أيام، وآخر غياب بتاريخ ${follow.lastAbsent}. نأمل التواصل مع شؤون الطلاب لتوضيح الأسباب ومتابعة انتظام الطالب.\nمع تحيات شؤون الطلاب.`;
}
export function absenceFollowupWhatsappUrl(phone:string,message:string):string {
 const normalized=absenceFollowupPhone(phone);
 return normalized?'https://wa.me/'+normalized+'?text='+encodeURIComponent(message):'';
}
