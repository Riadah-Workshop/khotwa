export function fieldTone(label:string){
 if(/المعلم|المعلّم/.test(label))return 'blue';
 if(/الطالب|اسم المتدرب/.test(label))return 'student';
 if(/الفصل/.test(label))return 'classroom';
 if(/الصف/.test(label))return 'grade';
 if(/التاريخ|تاريخ/.test(label))return 'sky';
 if(/وقت/.test(label))return 'cyan';
 if(/الحصة|نوع الحالة|نوع الرسالة|نوع الإجراء/.test(label))return 'violet';
 if(/متابعة|حالة الرسالة/.test(label))return 'amber';
 if(/سبب|مخالفة|المخالفة/.test(label))return 'rose';
 if(/تفاصيل|ملاحظ|نتيجة|نص الرسالة/.test(label))return 'slate';
 if(/إجراء|الإجراء/.test(label))return 'emerald';
 if(/جوال|رقم التواصل/.test(label))return 'plum';
 if(/اسم|صلة|صفة/.test(label))return 'teal';
 return 'sky';
}
