'use client';
import {useLocale} from './locale';

import {useId} from 'react';
import {fieldTone} from '../lib/field-colors';
/** Native radios keep required validation, keyboard navigation and form change events. */
export default function QuickChoiceField({label,value,choices,onChange,required=false,disabled=false,compact=false,translateChoices=false}:{label:string;value:string;choices:string[];onChange:(value:string)=>void;required?:boolean;disabled?:boolean;compact?:boolean;translateChoices?:boolean}){const {ui,language}=useLocale();
 const id=useId(),primary=choices.length<=4?choices:choices.slice(0,3),more=choices.slice(primary.length),otherSelected=more.includes(value);
 const option=(choice:string)=><label className={'quick-choice-option '+(value===choice?'chosen':'')} key={choice}><input type="radio" name={id} value={choice} checked={value===choice} required={required} disabled={disabled} onChange={()=>{if(!disabled)onChange(choice)}}/><span>{translateChoices?ui(choice):choice}</span></label>;
 return <fieldset className={'field quick-choice-field '+(compact?'compact-choice':'')} data-field-tone={fieldTone(label)} disabled={disabled}><legend>{ui(String(label))}{required?' *':''}</legend><div className="quick-choice-options">{primary.map(option)}</div>{more.length>0&&<details className="quick-choice-more"><summary>{otherSelected?ui("المختار: ")+(translateChoices?ui(value):value):ui("خيارات أخرى (")+more.length+')'}</summary><div className="quick-choice-options">{more.map(option)}</div></details>}</fieldset>;
}
