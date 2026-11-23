export const FUSHATI_CATEGORIES=[
 {id:'وجبات',en:'Meals'}, {id:'سندويشات',en:'Sandwiches'},
 {id:'مشروبات',en:'Drinks'}, {id:'فواكه وخضار',en:'Fruit and vegetables'},
 {id:'وجبات خفيفة',en:'Snacks'}, {id:'حلويات',en:'Desserts'},
 {id:'ألبان',en:'Dairy'}, {id:'مستلزمات مدرسية',en:'School supplies'},
 {id:'أخرى',en:'Other'},
] as const;
export const categoryEnglish=(value:string)=>FUSHATI_CATEGORIES.find(c=>c.id===value)?.en||value;
