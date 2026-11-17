'use client';
import {useLocale,UiText} from './locale';

import {type TextSize} from '../lib/service-catalog';
export default function TextSizeControl({value,onChange}:{value:TextSize;onChange:(size:TextSize)=>void}){const {ui,language}=useLocale();
 return <div className="text-size-control no-print"><span><UiText text={"حجم الخط"}/></span><div role="group" aria-label={ui("حجم الخط")}>{(['normal','medium','large'] as const).map((size,index)=><button type="button" key={size} aria-pressed={value===size} className={value===size?'selected':''} onClick={()=>onChange(size)}>{ui(['عادي','متوسط','كبير'][index])}</button>)}</div></div>;
}
