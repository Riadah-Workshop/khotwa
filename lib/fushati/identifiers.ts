/** Canonical Saudi mobile or national ID / Iqama identifier. */
export function normalizeAgentIdentifier(input:string|null|undefined):string|null{
 const raw=(input||'').trim().replace(/[\s()-]/g,'');
 const digits=raw.replace(/^\+/, '');
 if(/^05\d{8}$/.test(digits))return 'phone:+966'+digits.slice(1);
 if(/^9665\d{8}$/.test(digits))return 'phone:+'+digits;
 if(/^[12]\d{9}$/.test(digits))return 'iqama:'+digits;
 return null;
}

/** A phone number to show next to a name: Saudi mobile in international form (+9665XXXXXXXX), or '' when it is not one. */
export function normalizeContactPhone(input:string|null|undefined):string{
 const raw=(input||'').trim().replace(/[\s()-]/g,'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
 const digits=raw.replace(/^\+/,'').replace(/^00/,'');
 if(/^05\d{8}$/.test(digits))return '+966'+digits.slice(1);
 if(/^5\d{8}$/.test(digits))return '+966'+digits;
 if(/^9665\d{8}$/.test(digits))return '+'+digits;
 return '';
}
/** The number to call an agent on: the contact phone if one was set, else the login number when he signs in with a mobile. */
export function agentContactPhone(row:{phone?:string|null;login_identifier?:string|null}):string{
 if(row.phone)return row.phone;
 const login=row.login_identifier||'';
 return login.startsWith('phone:')?login.slice('phone:'.length):'';
}
