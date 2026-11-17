'use client';
import {useEffect} from 'react';
import {useLocale} from './locale';
import {minutesBetween,withLateMinutes} from '../lib/late-minutes';
import {CASE_TYPES,type CaseExtra} from '../lib/case-fields';
export default function LateTimeFields({value,onChange,schoolStart,disabled}:{value:CaseExtra;onChange:(v:CaseExtra)=>void;schoolStart?:string;disabled:boolean}){const {language}=useLocale(),t=(ar:string,en:string)=>language==='ar'?ar:en;
 useEffect(()=>{if(!value.schoolStartTime&&schoolStart)onChange(withLateMinutes(CASE_TYPES[0],{...value,schoolStartTime:schoolStart}));},[schoolStart,value.schoolStartTime]);
 const minutes=minutesBetween(value.schoolStartTime,value.arrivalTime);
 return <><label className="field"><span>{t('بداية الحصة الأولى','First lesson starts')}</span><input type="time" disabled={disabled} value={value.schoolStartTime||''} onChange={e=>onChange(withLateMinutes(CASE_TYPES[0],{...value,schoolStartTime:e.target.value||undefined}))}/></label><label className="field"><span>{t('وقت الوصول','Arrival time')} *</span><input type="time" required disabled={disabled} value={value.arrivalTime||''} onChange={e=>onChange(withLateMinutes(CASE_TYPES[0],{...value,arrivalTime:e.target.value}))}/></label><p role="status" className="alert">{minutes===null?t('حدد بداية الحصة لحساب الدقائق؛ السجل القديم لا يُحسب بالتوقيت الجديد تلقائيًا.','Set the lesson start to calculate minutes. Old records are not recalculated using the new schedule.'):t('مدة التأخر: ','Late by: ')+minutes+t(' دقيقة',' minutes')}</p></>;
}
