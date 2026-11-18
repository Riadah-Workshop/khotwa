// Keep existing page hashes so bookmarked links and workflow shortcuts still work.
export const WORKSPACE_GROUPS = [
 {id:'home',label:'الرئيسية',description:'ملخص يومك ومساعد الوكيل',defaultPage:'home',pages:['home','desk','day-start','day-end']},
 {id:'students',label:'الطلاب',description:'البحث وبيانات الطلاب وملفاتهم',defaultPage:'search',pages:['search','students','student-movements','file-cards','barcodes']},
 {id:'attendance',label:'الحضور والانصراف',description:'الحضور والغياب والتأخر ومتابعتها',defaultPage:'attendance',pages:['attendance','class-late','repeated-absence']},
 {id:'cases',label:'الحالات والمتابعة',description:'تسجيل الحالات ومعالجتها ومتابعة تكرارها',defaultPage:'case',pages:['case','platform-papers','incidents','batch-cases','today','follow','repeated']},
 {id:'communication',label:'التواصل والزوار',description:'رسائل أولياء الأمور والزيارات وبوابة الأسرة',defaultPage:'messages',pages:['messages','group-message','visitors','parents']},
 {id:'activities',label:'الرحلات والأنشطة',description:'تجهيز وطباعة موافقات أولياء الأمور بأسماء الطلاب',defaultPage:'activities',pages:['activities']},
 {id:'reports',label:'التقارير',description:'التقارير والإحصائيات والحصاد والتكريم',defaultPage:'reports',pages:['compatibility','reports','harvest','honor','improvement','evidence']},
] as const;
export function workspaceGroup(page:string,studentProfile=false){
 if(page==='trip-consents')page='activities';
 if(studentProfile)return WORKSPACE_GROUPS[1];
 return WORKSPACE_GROUPS.find(group=>(group.pages as readonly string[]).includes(page));
}
