'use client';
import {useEffect,useRef,useState} from 'react';
import {draftKey,parseDraft,type CaseDraft,type DraftForm,type DraftLane} from '../lib/case-draft';

export function useCaseDraft(owner:string,lane:DraftLane,form:DraftForm,editing:boolean){
 const key=owner?draftKey(owner,lane):'';
 const scope=key+':'+String(editing);
 const [pending,setPending]=useState<CaseDraft|null>(null),[savedAt,setSavedAt]=useState<number|null>(null),[warning,setWarning]=useState(''),[dirty,setDirty]=useState(false),[loadedKey,setLoadedKey]=useState('');
 const activeKey=useRef('');
 useEffect(()=>{activeKey.current=key;setDirty(false);setSavedAt(null);setPending(null);setWarning('');setLoadedKey('');if(!key)return;
  try{const raw=localStorage.getItem(key),draft=parseDraft(raw,lane);if(raw&&!draft)localStorage.removeItem(key);setPending(draft);}catch{setWarning('تعذّر حفظ المسودة على هذا الجهاز. أبقِ الصفحة مفتوحة حتى تحفظ الحالة.');}setLoadedKey(scope);
 },[key,lane,editing,scope]);
 useEffect(()=>{if(!key||loadedKey!==scope||!dirty||editing||pending)return;
  try{const savedAt=Date.now();localStorage.setItem(key,JSON.stringify({version:1,savedAt,form}));setSavedAt(savedAt);setWarning('');}catch{setWarning('تعذّر حفظ المسودة على هذا الجهاز. أبقِ الصفحة مفتوحة حتى تحفظ الحالة.');}
 },[key,scope,loadedKey,form,dirty,editing,pending]);
 function clear(){if(key){try{localStorage.removeItem(key);}catch{setWarning('تعذّر إزالة المسودة من هذا الجهاز.');}}setPending(null);setDirty(false);setSavedAt(null);}
 function take(){if(!pending||activeKey.current!==key)return null;const current=parseDraft(JSON.stringify(pending),lane);if(!current){clear();return null;}setPending(null);setDirty(true);return current.form;}
 return {pending,savedAt,warning,markChanged:()=>setDirty(true),clear,take,hasWork:!!pending||dirty};
}
