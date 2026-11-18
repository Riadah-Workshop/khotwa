'use client';
import {useCallback,useEffect,useState} from 'react';
import {requestApi} from '../lib/client-api';
export type SchoolWorkData={trips:any[];participants:any[];tasks:any[];evidence:any[]};
export function useSchoolWork(){const [data,setData]=useState<SchoolWorkData>({trips:[],participants:[],tasks:[],evidence:[]}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);try{const v:any=await requestApi('/api/school-work');setData(v);setError('');}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل السجلات. أعد المحاولة.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function save(op:string,payload:any){if(busy)return null;setBusy(true);setError('');try{const result:any=await requestApi('/api/school-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,data:payload})});await load();return result;}catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ');return null;}finally{setBusy(false);}}
 return {data,busy,loading,error,setError,load,save};
}
