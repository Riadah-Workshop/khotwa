// After an Android build: checks the merged manifest really holds every permission and the background-location
// service, so a missing piece fails the build instead of failing on someone's phone.
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {missingFromManifest} from './patch.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[2] !== 'android') {
  console.error('Usage: node scripts/verify.mjs android');
  process.exit(1);
}

function find(dir, name, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) find(path, name, found);
    else if (entry === name) found.push(path);
  }
  return found;
}

const merged = find(join(root, 'android/app/build/intermediates/merged_manifests/debug'), 'AndroidManifest.xml');
if (!merged.length) {
  console.error('No merged manifest found: run the Android build first.');
  process.exit(1);
}
const missing = missingFromManifest(readFileSync(merged[0], 'utf8'));
if (missing.length) {
  console.error('The built app is missing:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log('Merged manifest has every permission and the background-location service.');
