// Run once after `cap add android` / `cap add ios`: fills in permissions, texts and the version.
//   node scripts/prepare.mjs android
//   node scripts/prepare.mjs ios
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchAndroidGradle, patchAndroidManifest, patchAndroidStrings, patchInfoPlist, patchIosProject, versionCodeFor} from './patch.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2];
const {version} = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function edit(relative, change) {
  const file = join(root, relative);
  if (!existsSync(file)) throw new Error(`${relative} is missing. Run "npm run add:${platform}" first.`);
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
  console.log(after === before ? 'unchanged' : 'updated  ', relative);
}

if (platform === 'android') {
  edit('android/app/src/main/AndroidManifest.xml', patchAndroidManifest);
  edit('android/app/src/main/res/values/strings.xml', patchAndroidStrings);
  edit('android/app/build.gradle', (text) => patchAndroidGradle(text, version));
  console.log(`Android version ${version} (code ${versionCodeFor(version)})`);
} else if (platform === 'ios') {
  edit('ios/App/App/Info.plist', patchInfoPlist);
  edit('ios/App/App.xcodeproj/project.pbxproj', (text) => patchIosProject(text, version, process.env.KHOTWA_BUILD || String(versionCodeFor(version))));
  console.log(`iOS version ${version}`);
} else {
  console.error('Usage: node scripts/prepare.mjs android|ios');
  process.exit(1);
}
