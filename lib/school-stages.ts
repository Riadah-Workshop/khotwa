export const SCHOOL_STAGES = [
 {id:'kindergarten',ar:'رياض الأطفال',en:'Kindergarten'},
 {id:'elementary',ar:'الابتدائية',en:'Elementary'},
 {id:'intermediate',ar:'المتوسطة',en:'Intermediate'},
 {id:'secondary',ar:'الثانوية',en:'Secondary / High school'},
 {id:'general',ar:'أخرى / جميع المراحل',en:'Other / All stages'},
] as const;
export type SchoolStage = typeof SCHOOL_STAGES[number]['id'];
