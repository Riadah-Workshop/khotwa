/** Saudi-only school location options. `id` values are stable database keys.
 * Selected cities are populated places (not an exhaustive district directory).
 * Administrators can extend this list in a later release without DB changes.
 */
export type SaudiCity={id:string;ar:string;en:string};
export type SaudiRegion={id:string;ar:string;en:string;cities:SaudiCity[]};
const city=(ar:string,en:string):SaudiCity=>({id:en.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),ar,en});
const region=(id:string,ar:string,en:string,items:[string,string][]):SaudiRegion=>({id,ar,en,cities:items.map(([a,e])=>city(a,e))});
export const SAUDI_REGIONS:SaudiRegion[]=[
 region('riyadh','منطقة الرياض','Riyadh Region',[
  ['الرياض','Riyadh'],['الدرعية','Diriyah'],['الخرج','Al Kharj'],['الدوادمي','Al Dawadmi'],['المجمعة','Al Majmaah'],['القويعية','Al Quwayiyah'],['وادي الدواسر','Wadi Al Dawasir'],['الأفلاج','Al Aflaj'],['الزلفي','Az Zulfi'],['شقراء','Shaqra'],['حوطة بني تميم','Hawtat Bani Tamim'],['عفيف','Afif'],['السليل','As Sulayyil'],['رماح','Rumah'],['ثادق','Thadiq'],['الحريق','Al Hariq'],['مرات','Marrat']]),
 region('makkah','منطقة مكة المكرمة','Makkah Region',[
  ['مكة المكرمة','Makkah'],['جدة','Jeddah'],['الطائف','Taif'],['رابغ','Rabigh'],['القنفذة','Al Qunfudhah'],['الليث','Al Lith'],['خليص','Khulais'],['الجموم','Al Jumum'],['الكامل','Al Kamil'],['بحرة','Bahrah'],['تربة','Turbah'],['رنية','Ranyah'],['الخرمة','Al Khurmah'],['أضم','Adham']]),
 region('madinah','منطقة المدينة المنورة','Madinah Region',[
  ['المدينة المنورة','Madinah'],['ينبع','Yanbu'],['العلا','Al Ula'],['بدر','Badr'],['خيبر','Khaybar'],['المهد','Mahd Adh Dhahab'],['الحناكية','Al Hanakiyah'],['العيص','Al Ais'],['وادي الفرع','Wadi Al Fara']]),
 region('eastern','المنطقة الشرقية','Eastern Province',[
  ['الدمام','Dammam'],['الخبر','Al Khobar'],['الظهران','Dhahran'],['القطيف','Qatif'],['الجبيل','Jubail'],['الأحساء','Al Ahsa'],['الهفوف','Hofuf'],['المبرز','Al Mubarraz'],['حفر الباطن','Hafar Al Batin'],['بقيق','Abqaiq'],['رأس تنورة','Ras Tanura'],['الخفجي','Khafji'],['النعيرية','Nuayriyah'],['قرية العليا','Qaryat Al Ulya'],['صفوى','Safwa'],['سيهات','Saihat'],['تاروت','Tarout'],['العيون','Al Uyun'],['سلوى','Salwa'],['دارين','Darin']]),
 region('qassim','منطقة القصيم','Qassim Region',[
  ['بريدة','Buraydah'],['عنيزة','Unaizah'],['الرس','Ar Rass'],['البكيرية','Al Bukayriyah'],['البدائع','Al Badai'],['المذنب','Al Mithnab'],['رياض الخبراء','Riyadh Al Khabra'],['الأسياح','Al Asyah'],['عيون الجواء','Uyun Al Jiwa'],['الشماسية','Ash Shimasiyah'],['النبهانية','An Nabhaniyah']]),
 region('asir','منطقة عسير','Asir Region',[
  ['أبها','Abha'],['خميس مشيط','Khamis Mushait'],['بيشة','Bisha'],['محايل عسير','Muhayil Asir'],['النماص','Al Namas'],['بلقرن','Balqarn'],['ظهران الجنوب','Dhahran Al Janub'],['سراة عبيدة','Sarat Abidah'],['أحد رفيدة','Ahad Rufaydah'],['رجال ألمع','Rijal Almaa'],['تثليث','Tathlith'],['المجاردة','Al Majardah'],['تنومة','Tanumah'],['بارق','Bariq']]),
 region('tabuk','منطقة تبوك','Tabuk Region',[
  ['تبوك','Tabuk'],['ضباء','Duba'],['الوجه','Al Wajh'],['أملج','Umluj'],['حقل','Haql'],['تيماء','Tayma'],['البدع','Al Bad']]),
 region('hail','منطقة حائل','Hail Region',[
  ['حائل','Hail'],['بقعاء','Baqaa'],['الغزالة','Al Ghazalah'],['الشنان','Ash Shinan'],['السليمي','As Sulaymi'],['الشملي','Ash Shamli'],['موقق','Mawqaq']]),
 region('northern','منطقة الحدود الشمالية','Northern Borders Region',[
  ['عرعر','Arar'],['رفحاء','Rafha'],['طريف','Turaif'],['العويقيلة','Al Uwayqilah']]),
 region('jazan','منطقة جازان','Jazan Region',[
  ['جازان','Jazan'],['صبيا','Sabya'],['أبو عريش','Abu Arish'],['صامطة','Samtah'],['بيش','Baish'],['العارضة','Al Ardah'],['أحد المسارحة','Ahad Al Masarihah'],['فرسان','Farasan'],['الدرب','Ad Darb'],['الريث','Ar Rayth'],['فيفاء','Fayfa'],['ضمد','Damad'],['العيدابي','Al Aidabi']]),
 region('najran','منطقة نجران','Najran Region',[
  ['نجران','Najran'],['شرورة','Sharurah'],['حبونا','Hubuna'],['بدر الجنوب','Badr Al Janub'],['يدمة','Yadamah'],['ثار','Thar'],['خباش','Khubash']]),
 region('bahah','منطقة الباحة','Al Bahah Region',[
  ['الباحة','Al Bahah'],['بلجرشي','Baljurashi'],['المندق','Al Mandaq'],['المخواة','Al Makhwah'],['قلوة','Qilwah'],['العقيق','Al Aqiq'],['القرى','Al Qura'],['الحجرة','Al Hajrah']]),
 region('jouf','منطقة الجوف','Al Jouf Region',[
  ['سكاكا','Sakaka'],['القريات','Qurayyat'],['دومة الجندل','Dumat Al Jandal'],['طبرجل','Tabarjal']])
];
export function saudiRegion(id:string){return SAUDI_REGIONS.find(region=>region.id===id);}
export function saudiCity(regionId:string,cityId:string){return saudiRegion(regionId)?.cities.find(city=>city.id===cityId);}
export function validSaudiLocation(regionId:string,cityId:string){return !!saudiCity(regionId,cityId);}
