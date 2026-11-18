'use client';
import {useCallback,useEffect,useState} from 'react';
import {parsePreferences,recentWithVisit,type ServiceId,type TextSize,type WorkspacePreferences} from '../lib/service-catalog';
export function useWorkspacePreferences(email:string){
 const key=email?'khotwa:workspace:v1:'+email.trim().toLowerCase():'';
 const [state,setState]=useState<{key:string;value:WorkspacePreferences}>({key:'',value:parsePreferences(null)});
 const [storageError,setStorageError]=useState('');
 useEffect(()=>{if(!key){setState({key:'',value:parsePreferences(null)});return;}let value=parsePreferences(null);try{value=parsePreferences(localStorage.getItem(key));setStorageError('');}catch{setStorageError('تعذّر حفظ تفضيلاتك على هذا الجهاز؛ يمكنك استخدامها خلال هذه الجلسة.');}setState({key,value});},[key]);
 useEffect(()=>{if(!key||state.key!==key)return;try{localStorage.setItem(key,JSON.stringify(state.value));setStorageError('');}catch{setStorageError('تعذّر حفظ تفضيلاتك على هذا الجهاز؛ يمكنك استخدامها خلال هذه الجلسة.');}},[key,state]);
 const recordVisit=useCallback((page:string)=>{setState(previous=>{if(!key||previous.key!==key)return previous;const recent=recentWithVisit(previous.value.recent,page);if(JSON.stringify(recent)===JSON.stringify(previous.value.recent))return previous;return {...previous,value:{...previous.value,recent}};});},[key]);
 function toggleFavorite(id:ServiceId){setState(previous=>{if(!key||previous.key!==key)return previous;const old=previous.value.favorites;if(!old.includes(id)&&old.length>=4)return previous;return {...previous,value:{...previous.value,favorites:old.includes(id)?old.filter(x=>x!==id):[...old,id]}};});}
 function setTextSize(textSize:TextSize){setState(previous=>previous.key===key?{...previous,value:{...previous.value,textSize}}:previous);}
 return {value:state.key===key?state.value:parsePreferences(null),ready:!!key&&state.key===key,toggleFavorite,setTextSize,recordVisit,storageError};
}
