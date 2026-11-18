'use client';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {UI_EN} from '../lib/ui-translations';
export type Language='ar'|'en';
export function translateUi(text:string,language:Language):string{
 if(typeof text!=='string')return '';
 if(language==='ar')return text;
 const key=text.replace(/\s+/g,' ').trim();
 if(!key)return text;
 const exact=Object.hasOwn(UI_EN,key)?UI_EN[key]:undefined;
 if(exact)return (text.startsWith(' ')?' ':'')+exact+(text.endsWith(' ')?' ':'');
 // Punctuation and required markers belong to the UI label, never to record data.
 const suffix=key.match(/^(.*?)(\s*[:*])$/);
 if(suffix&&Object.hasOwn(UI_EN,suffix[1].trim())&&UI_EN[suffix[1].trim()])return UI_EN[suffix[1].trim()]+suffix[2];
 return text;
}
const LocaleContext=createContext({language:'ar' as Language,setLanguage:(_language:Language)=>{},ui:(text:string)=>text});
export function LocaleProvider({email,children}:{email:string;children:ReactNode}){
 const key='khotwa:language:v1:'+email.trim().toLowerCase();
 const [language,setLanguageState]=useState<Language>('ar');
 useEffect(()=>{try{setLanguageState(localStorage.getItem(key)==='en'?'en':'ar');}catch{}},[key]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';},[language]);
 const setLanguage=useCallback((next:Language)=>{setLanguageState(next);try{localStorage.setItem(key,next);}catch{}},[key]);
 const ui=useCallback((text:string)=>translateUi(text,language),[language]);
 return <LocaleContext.Provider value={{language,setLanguage,ui}}><div className="localized-workspace" lang={language} dir={language==='en'?'ltr':'rtl'}>{children}</div></LocaleContext.Provider>;
}
export function useLocale(){return useContext(LocaleContext);}
export function UiText({text}:{text:string}){const {ui}=useLocale();return ui(text);}
export function LanguageSwitch(){const {language,setLanguage}=useLocale();return <div className="language-switch no-print" role="group" aria-label={language==='en'?'Interface language':'لغة الواجهة'}><button type="button" lang="ar" aria-pressed={language==='ar'} onClick={()=>setLanguage('ar')}>العربية</button><button type="button" lang="en" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></div>;}
