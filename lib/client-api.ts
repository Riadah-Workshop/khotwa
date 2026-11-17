export class ApiResponseError extends Error {
 constructor(message:string,public reauthenticate=false,public retryable=false){super(message);this.name='ApiResponseError';}
}
export async function readApiResponse(response:Response){
 const type=response.headers.get('content-type')||'';
 const login=response.status===401||(/signin|login|oauth|authorize/.test(response.url)&&response.redirected);
 if(login)throw new ApiResponseError('تعذّر التحقق من جلسة الدخول. حاول تحميل البيانات مجددًا؛ وإذا استمر التنبيه استخدم تجديد الدخول.',true);
 if(!/application\/(?:[\w.+-]*\+)?json/i.test(type))throw new ApiResponseError('تعذّر تحميل البيانات بسبب استجابة غير مكتملة من الاتصال. أعد المحاولة عند استقرار الاتصال.',false,true);
 let data:any;try{data=await response.json();}catch{throw new ApiResponseError('لم تصل البيانات كاملة. أعد المحاولة.',false,true);}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiResponseError('تعذّر قراءة بيانات البرنامج. أعد المحاولة.',false,true);
 if(!response.ok)throw new ApiResponseError(typeof data.error==='string'?data.error:'تعذّر تنفيذ الطلب. أعد المحاولة.',false,response.status>=500);
 return data;
}
export async function requestApi(url:string,init:RequestInit={}){
 const readOnly=!init.method||init.method.toUpperCase()==='GET';
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new ApiResponseError('الإنترنت غير متصل. ستُحدّث البيانات بعد عودة الاتصال؛ بيانات الصفحة باقية كما هي.',false,true);
 for(let attempt=0;attempt<(readOnly?2:1);attempt++){
  const controller=new AbortController(),abort=()=>controller.abort();init.signal?.addEventListener('abort',abort,{once:true});if(init.signal?.aborted)controller.abort();const timer=setTimeout(abort,15000);
  try{const headers=new Headers(init.headers);headers.set('Accept','application/json');return await readApiResponse(await fetch(url,{...init,signal:controller.signal,credentials:'same-origin',cache:'no-store',headers}));}
  catch(error){if(readOnly&&attempt===0&&!init.signal?.aborted&&(!(error instanceof ApiResponseError)||error.retryable||error.reauthenticate))continue;if(error instanceof ApiResponseError)throw error;throw new ApiResponseError(readOnly?'تعذّر الاتصال بالبرنامج. تحقق من اتصال الإنترنت ثم أعد المحاولة.':'تعذّر التأكد من نتيجة الحفظ بسبب الاتصال. تحقق من السجل قبل إعادة الحفظ لتجنب التكرار.');}
  finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
 }
 throw new ApiResponseError('تعذّر تحميل البيانات. أعد المحاولة.');
}
