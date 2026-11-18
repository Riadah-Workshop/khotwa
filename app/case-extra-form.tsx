'use client';
import {useLocale,UiText} from './locale';

import LateTimeFields from './late-time-fields';
import IncidentFields from './incident-fields';
import {INCIDENT_TYPE} from '../lib/case-fields';
import QuickChoiceField from './quick-choice-field';
import {fieldTone} from '../lib/field-colors';
import {CLASS_LATE_TYPE,LESSONS,CASE_TYPES,LEAVE_REASONS,LATE_REASONS,RELATIONSHIPS,VIOLATIONS,BEHAVIOR_ACTIONS,type CaseExtra} from '../lib/case-fields';
export default function CaseExtraForm({type,value,action,onChange,onAction,disabled=false,schoolStart}:{schoolStart?:string;disabled?:boolean;type:string;action:string;value:CaseExtra;onChange:(v:CaseExtra)=>void;onAction:(action:string)=>void}){const {ui,language}=useLocale();
 const input=(label:string,key:keyof CaseExtra,kind='text',max=150)=><label className="field" data-field-tone={fieldTone(label)}><span>{ui(String(label))} *</span><input required disabled={disabled} type={kind} maxLength={max} value={value[key]||''} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>;
 const select=(label:string,key:keyof CaseExtra,choices:string[],onPick?:(v:string)=>void)=><QuickChoiceField translateChoices label={label} value={value[key]||''} choices={choices} required disabled={disabled} onChange={picked=>{onChange({...value,[key]:picked});onPick?.(picked)}}/>;
 if(type===INCIDENT_TYPE)return <IncidentFields value={value} onChange={onChange} disabled={disabled}/>;
 if(type===CLASS_LATE_TYPE)return <div className="case-extra-form"><h3><UiText text={"بيانات التأخر عن دخول الحصة"}/></h3><div className="form-grid">{select('الحصة','lesson',LESSONS)}{input('اسم المعلم في الفصل','teacherName')}{input('سبب التأخر','reason','text',1000)}{input('وقت التأخر','lateTime','time')}{input('وقت إذن الدخول','entryTime','time')}</div></div>;
 if(type===CASE_TYPES[0])return <div className="case-extra-form"><h3><UiText text={"بيانات التأخر الصباحي وإذن الدخول"}/></h3><div className="form-grid">{select('سبب التأخر','reason',LATE_REASONS)}<LateTimeFields value={value} onChange={onChange} schoolStart={schoolStart} disabled={disabled}/>{value.reason==='أخرى'&&input('توضيح سبب التأخر','customReason','text',1000)}</div></div>;
 if(type===CASE_TYPES[1])return <div className="case-extra-form"><h3><UiText text={"بيانات الاستئذان وتسليم الطالب"}/></h3><div className="form-grid">{select('سبب الاستئذان','reason',LEAVE_REASONS)}{input('وقت الخروج','exitTime','time')}{value.reason==='أخرى'&&input('توضيح سبب الاستئذان','customReason','text',1000)}{input('اسم المستلم','recipientName')}{select('صلة القرابة','relationship',RELATIONSHIPS)}{value.relationship==='أخرى'&&input('توضيح صلة القرابة','customRelationship')}</div></div>;
 if(type===CASE_TYPES[2])return <div className="case-extra-form"><h3><UiText text={"المخالفة والإجراء المتخذ"}/></h3><div className="form-grid">{select('المخالفة السلوكية','violation',VIOLATIONS)}{select('الإجراء المتخذ','actionChoice',BEHAVIOR_ACTIONS,a=>onAction(a==='أخرى'?'':a))}{value.violation==='أخرى'&&input('توضيح المخالفة','customViolation','text',1000)}{value.actionChoice==='أخرى'&&<label className="field" data-field-tone={fieldTone('توضيح الإجراء *')}><span><UiText text={"توضيح الإجراء *"}/></span><textarea required disabled={disabled} maxLength={3000} rows={3} value={action} onChange={e=>onAction(e.target.value)} placeholder={ui("اكتب الإجراء الذي اتخذته…")}/></label>}</div><p className="small muted"><UiText text={"حدد الواقعة والإجراء الفعلي، ثم دوّن التفاصيل أدناه. تتوفر طباعة التعهد بعد حفظ الحالة."}/></p></div>;
 if(type===CASE_TYPES[6])return <div className="case-extra-form"><h3><UiText text={"بيانات زيارة ولي الأمر"}/></h3><div className="form-grid">{input('اسم ولي الأمر الزائر','visitorName')}{input('وقت الزيارة','visitTime','time')}{input('سبب الزيارة','visitReason','text',1000)}{input('تمت مقابلة — الاسم أو الصفة','meetingWith')}</div></div>;
 return null;
}
