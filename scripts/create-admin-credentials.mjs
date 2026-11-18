/** Run locally and copy the printed values to Coolify's secret environment variables. */
import {randomBytes,webcrypto} from 'node:crypto';
const base64url=b=>Buffer.from(b).toString('base64url');
const password=base64url(randomBytes(24));
const salt=randomBytes(16);
const iterations=240_000;
const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const result=await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
console.log('Copy these values into Coolify > Environment Variables (as secrets):\n');
console.log('KHOTWA_ADMIN_EMAIL=your-email@example.com');
console.log('KHOTWA_ADMIN_PASSWORD_HASH=pbkdf2-sha256$'+iterations+'$'+base64url(salt)+'$'+base64url(result));
console.log('KHOTWA_SESSION_SECRET='+base64url(randomBytes(48)));
console.log('\nSAVE THE FOLLOWING PASSWORD privately (it is not recoverable from the hash):');
console.log('KHOTWA_ADMIN_PASSWORD='+password);
console.log('\nOnly the first three variables are used by the app. Do NOT place KHOTWA_ADMIN_PASSWORD in Coolify or GitHub.');
