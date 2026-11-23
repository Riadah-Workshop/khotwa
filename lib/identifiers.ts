/** Canonical Saudi mobile or national ID / Iqama identifier. */
export function normalizeAgentIdentifier(input:string|null|undefined):string|null{
 const raw=(input||'').trim().replace(/[\s()-]/g,'');
 const digits=raw.replace(/^\+/, '');
 if(/^05\d{8}$/.test(digits))return 'phone:+966'+digits.slice(1);
 if(/^9665\d{8}$/.test(digits))return 'phone:+'+digits;
 if(/^[12]\d{9}$/.test(digits))return 'iqama:'+digits;
 return null;
}
