'use client';
import {useLocale,UiText} from './locale';

import {useState} from 'react';
export default function PdfDownloadButton({records,students,settings,fourPerPage=true}:{records:any[];students:any[];settings:Record<string,string>;fourPerPage?:boolean}){const {ui,language}=useLocale();const[busy,setBusy]=useState(false),[error,setError]=useState('');return <div><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const {downloadPermitPdf}=await import('../lib/permit-pdf');await downloadPermitPdf(records,students,settings,fourPerPage);}catch(e){setError(e instanceof Error?e.message:'تعذر تجهيز ملف الطباعة. حاول مجددًا.');}finally{setBusy(false);}}}>{busy?ui("جارٍ تجهيز الملف…"):ui("تنزيل PDF للطباعة")}</button>{error&&<p role="alert" className="absent-text small">{ui(error)}</p>}<small className="muted"><UiText text={"افتح الملف ثم اختر مشاركة ← طباعة."}/></small></div>;}
