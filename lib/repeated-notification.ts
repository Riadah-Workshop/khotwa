import {normalizedFamilyPhone} from './student-family';
export const repeatedNotificationPhone=(phone:string)=>normalizedFamilyPhone(phone);
export function repeatedNotification(student:{name:string;grade:string;classroom:string},repetition:{type:string;count:number},settings:Record<string,string>){
 if(!repetition.type||!Number.isInteger(repetition.count)||repetition.count<4)throw new Error('اختر نوع حالة تكرر أربع مرات أو أكثر');
 return `🔴 تنبيه رسمي بشأن تكرار حالة الطالب

ولي أمر الطالب: ${student.name}
الصف والفصل: ${student.grade} / ${student.classroom}

السلام عليكم ورحمة الله وبركاته،

نحيطكم بأن حالة «${repetition.type}» تكررت لدى ابنكم ${repetition.count} مرات وفق سجلات المدرسة، وهو تكرار يستدعي منكم متابعة جادة وعاجلة.

نؤكد ضرورة مناقشة ابنكم، ومعالجة أسباب التكرار، والتعاون مع المدرسة لمنع تكراره؛ حرصًا على انضباطه وسلوكه ومواظبته وانتظامه الدراسي.

يُعد هذا إشعارًا رسميًا بضرورة التصحيح، وفي حال استمرار التكرار ستُتخذ الإجراءات التربوية المناسبة وفق الأنظمة والتعليمات المعتمدة.

نأمل منكم تأكيد استلام الإشعار، ومتابعة التزام ابنكم ابتداءً من تاريخه.

وكيل شؤون الطلاب: ${settings.deputy||'________________'}
${settings.school||'مدرسة الحرمين الابتدائية بالخبر'}`;
}
