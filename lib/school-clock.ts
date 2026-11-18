export const SCHOOL_TIME_ZONE='Asia/Riyadh';
const formats=(language:'ar'|'en')=>{
 const locale=language==='en'?'en-SA':'ar-SA';
 return {hijri:new Intl.DateTimeFormat(locale+'-u-ca-islamic-umalqura',{timeZone:SCHOOL_TIME_ZONE,weekday:'long',year:'numeric',month:'long',day:'numeric'}),gregorian:new Intl.DateTimeFormat(locale+'-u-ca-gregory',{timeZone:SCHOOL_TIME_ZONE,year:'numeric',month:'long',day:'numeric'}),clock:new Intl.DateTimeFormat(locale,{timeZone:SCHOOL_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})};
};
const clockFormats={ar:formats('ar'),en:formats('en')};
export function schoolClock(now:Date,language:'ar'|'en'='ar'){const f=clockFormats[language];return {hijri:f.hijri.format(now),gregorian:f.gregorian.format(now),time:f.clock.format(now)};}
const handClock=new Intl.DateTimeFormat('en-GB',{timeZone:SCHOOL_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function schoolClockHands(now:Date){
 const parts=Object.fromEntries(handClock.formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 return {hour:(parts.hour%12)*30+parts.minute/2,minute:parts.minute*6+parts.second/10,second:parts.second*6};
}
