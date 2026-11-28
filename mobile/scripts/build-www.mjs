// Writes www/index.html (the "no connection" page) with the website address filled in. Capacitor needs a web folder
// even though the app loads the live website, and this page is what shows when the phone is offline.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const address = (process.env.KHOTWA_URL || '').trim();
if (!/^https:\/\/[^/\s'"<>]+\/?$/i.test(address)) {
  console.error('Set KHOTWA_URL to the https address of the Khotwa website, for example KHOTWA_URL=https://school.example.com');
  process.exit(1);
}
const page = readFileSync(join(root, 'offline.html'), 'utf8').replace('__KHOTWA_URL__', new URL(address).origin);
mkdirSync(join(root, 'www'), {recursive: true});
writeFileSync(join(root, 'www', 'index.html'), page);
console.log('www/index.html written for', new URL(address).origin);
