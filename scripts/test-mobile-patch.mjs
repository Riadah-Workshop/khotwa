// The Android / iOS app shell: the edits applied to the generated native projects, the phone-scanner helpers, and the
// wiring between the website's bridge (app/native/*) and mobile/package.json. No phone and no build are needed.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {
  ANDROID_PERMISSIONS, IOS_USAGE_TEXTS, missingFromManifest, patchAndroidGradle, patchAndroidManifest, patchAndroidStrings,
  patchInfoPlist, patchIosProject, versionCodeFor,
} from '../mobile/scripts/patch.mjs';
import {SCAN_FORMATS, classifyScanError, firstBarcode} from '../lib/fushati/native-scan.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log('ok  ', name); };

// What `cap add android` / `cap add ios` generate (shape of the Capacitor templates).
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;
const strings = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Khotwa</string>
</resources>
`;
const gradle = `android {
    defaultConfig {
        applicationId "com.riadah.khotwa"
        versionCode 1
        versionName "1.0"
    }
}
`;
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>Khotwa</string>
</dict>
</plist>
`;
const pbx = `buildSettings = { CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0; };\nbuildSettings = { CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0; };`;

check('Android manifest gets every permission once, an optional camera and the scanner download', () => {
  const out = patchAndroidManifest(manifest);
  for (const name of ANDROID_PERMISSIONS) assert.equal(out.split(`"${name}"`).length - 1, 1, name);
  assert.match(out, /android.hardware.camera" android:required="false"/);
  assert.match(out, /com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui"/);
  assert.ok(out.indexOf('ACCESS_FINE_LOCATION') < out.indexOf('<application'), 'permissions come before <application>');
  assert.ok(out.indexOf('barcode_ui') < out.indexOf('</application>'), 'meta-data sits inside <application>');
});
check('patching twice changes nothing', () => {
  assert.equal(patchAndroidManifest(patchAndroidManifest(manifest)), patchAndroidManifest(manifest));
  assert.equal(patchAndroidStrings(patchAndroidStrings(strings)), patchAndroidStrings(strings));
  assert.equal(patchInfoPlist(patchInfoPlist(plist)), patchInfoPlist(plist));
  assert.equal(patchAndroidGradle(patchAndroidGradle(gradle, '1.2.3'), '1.2.3'), patchAndroidGradle(gradle, '1.2.3'));
});
check('a manifest without <application> is refused instead of silently skipped', () => {
  assert.throws(() => patchAndroidManifest('<manifest></manifest>'), /<application>/);
});
check('the standing notification channel gets a neutral name', () => {
  assert.match(patchAndroidStrings(strings), /notification_channel_name">Khotwa</);
});
check('version codes grow with the version and stay inside Android\'s limit', () => {
  assert.equal(versionCodeFor('1.0.0'), 1_000_000);
  assert.ok(versionCodeFor('1.0.1') > versionCodeFor('1.0.0'));
  assert.ok(versionCodeFor('1.1.0') > versionCodeFor('1.0.999'));
  assert.ok(versionCodeFor('2.0.0') > versionCodeFor('1.999.999'));
  for (const bad of ['1.0', '1.0.0.1', 'v1.0.0', '1.1000.0', '1.0.1000', '9999.0.0', '']) assert.throws(() => versionCodeFor(bad), undefined, bad);
});
check('gradle gets the version name and code', () => {
  const out = patchAndroidGradle(gradle, '1.4.2');
  assert.match(out, /versionCode 1004002/);
  assert.match(out, /versionName "1.4.2"/);
  assert.throws(() => patchAndroidGradle('android {}', '1.0.0'), /versionCode/);
});
check('Info.plist gets the camera and location texts (Arabic and English) and background location, nothing else', () => {
  const out = patchInfoPlist(plist);
  for (const [key, text] of Object.entries(IOS_USAGE_TEXTS)) {
    assert.ok(out.includes(`<key>${key}</key>`), key);
    assert.match(text, /[؀-ۿ]/, `${key} has Arabic`);
    assert.match(text, /[A-Za-z]/, `${key} has English`);
  }
  assert.match(out, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>/);
  assert.ok(out.includes('<key>CFBundleName</key>') && out.trimEnd().endsWith('</dict>\n</plist>'));
  const already = plist.replace('</dict>', `\t<key>NSCameraUsageDescription</key>\n\t<string>mine</string>\n</dict>`);
  assert.equal((patchInfoPlist(already).match(/NSCameraUsageDescription/g) || []).length, 1, 'an existing text is kept');
});
check('the Xcode project gets the marketing version and a build number', () => {
  const out = patchIosProject(pbx, '1.4.2', '1004002');
  assert.equal((out.match(/MARKETING_VERSION = 1.4.2;/g) || []).length, 2);
  assert.equal((out.match(/CURRENT_PROJECT_VERSION = 1004002;/g) || []).length, 2);
  assert.throws(() => patchIosProject('nothing', '1.0.0', '1'), /MARKETING_VERSION/);
});
check('the built-manifest check names exactly what is missing', () => {
  assert.deepEqual(missingFromManifest(patchAndroidManifest(manifest) + 'BackgroundGeolocationService'), []);
  const missing = missingFromManifest(patchAndroidManifest(manifest));
  assert.deepEqual(missing, ['BackgroundGeolocationService']);
  assert.ok(missingFromManifest('<manifest/>').includes('android.permission.CAMERA'));
});

check('scanner answers: first usable code wins, nothing usable is empty', () => {
  assert.equal(firstBarcode({barcodes: [{rawValue: ' 6281000000000 '}]}), '6281000000000');
  assert.equal(firstBarcode({barcodes: [{rawValue: '', displayValue: '4006381333931'}]}), '4006381333931');
  assert.equal(firstBarcode({barcodes: [{rawValue: 5}, {rawValue: '96385074'}]}), '96385074');
  for (const none of [null, undefined, {}, {barcodes: []}, {barcodes: 'x'}, {barcodes: [null]}, {barcodes: [{rawValue: '  '}]}]) assert.equal(firstBarcode(none), '');
});
check('scanner errors are told apart', () => {
  assert.equal(classifyScanError(new Error('scan canceled.')), 'cancelled');
  assert.equal(classifyScanError({message: 'User denied camera permission'}), 'denied');
  assert.equal(classifyScanError('"BarcodeScanner" plugin is not implemented on web'), 'unavailable');
  assert.equal(classifyScanError(new Error('Failed to scan code.')), 'failed');
  assert.equal(classifyScanError(undefined), 'failed');
});
check('the scanner only looks for product barcodes', () => {
  assert.ok(SCAN_FORMATS.includes('EAN_13') && SCAN_FORMATS.includes('UPC_A') && SCAN_FORMATS.includes('CODE_128'));
  assert.ok(!SCAN_FORMATS.includes('QR_CODE'));
});

// The website calls these plugins by name (app/native/*.ts and the arrival screen); the shell must contain each one.
const PACKAGE_FOR = {
  BackgroundGeolocation: '@capacitor-community/background-geolocation',
  BarcodeScanner: '@capacitor-mlkit/barcode-scanning',
  AppUpdate: '@capawesome/capacitor-app-update',
  Browser: '@capacitor/browser',
  Device: '@capacitor/device',
  Geolocation: '@capacitor/geolocation',
  LocalNotifications: '@capacitor/local-notifications',
};
function sources(dir, found = []) {
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const path = join(dir, entry);
    if (statSync(new URL(`../${path}`, import.meta.url)).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}
const pkg = JSON.parse(read('mobile/package.json'));
check('every plugin the website asks for is in the app, and nothing asks for an unknown one', () => {
  const wanted = new Set();
  for (const file of [...sources('app'), ...sources('lib')]) {
    for (const match of read(file).matchAll(/\bplugin\('([A-Za-z]+)'\)|nativeState\('([A-Za-z]+)'/g)) wanted.add(match[1] || match[2]);
  }
  assert.ok(wanted.size >= 6, `found ${[...wanted]}`);
  for (const name of wanted) {
    assert.ok(PACKAGE_FOR[name], `the website uses plugin ${name} but the test does not know which package provides it`);
    assert.ok(pkg.dependencies[PACKAGE_FOR[name]], `mobile/package.json is missing ${PACKAGE_FOR[name]} (plugin ${name})`);
  }
});
check('the app announces itself the way the website reads it', () => {
  const config = read('mobile/capacitor.config.ts');
  assert.ok(config.includes('`KhotwaApp/${version} (android)`') && config.includes('`KhotwaApp/${version} (ios)`'));
  const reader = /KhotwaApp\/(\d{1,3}(?:\.\d{1,3}){1,3}) \((?:android|ios)\)/;
  assert.ok(read('app/native/bridge.ts').includes('KhotwaApp\\/(\\d{1,3}(?:\\.\\d{1,3}){1,3}) \\((?:android|ios)\\)'), 'the website still reads the same tag');
  assert.equal(reader.exec(`KhotwaApp/${pkg.version} (android)`)?.[1], pkg.version);
  assert.equal(reader.exec(`KhotwaApp/${pkg.version} (ios)`)?.[1], pkg.version);
});
check('the shell loads the live website over https only and refuses a missing address', () => {
  const config = read('mobile/capacitor.config.ts');
  assert.match(config, /cleartext: false/);
  assert.match(config, /\^https:/);
  assert.match(config, /throw new Error\('Set KHOTWA_URL/);
  assert.match(read('mobile/scripts/build-www.mjs'), /\^https:/);
});
check('the website build, type check, lint and Docker image all leave the shell out', () => {
  assert.ok(JSON.parse(read('tsconfig.json')).exclude.includes('mobile'));
  assert.match(read('eslint.config.mjs'), /"mobile\/\*\*"/);
  assert.match(read('.dockerignore'), /^mobile$/m);
});
check('the build workflow pins every action to a commit like the main CI does', () => {
  const workflow = read('.github/workflows/mobile.yml');
  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(uses.length >= 2);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/, action);
  assert.ok(!/KEYSTORE|PASSWORD|PRIVATE_KEY/i.test(workflow.replace(/#.*$/gm, '').replace(/secrets\.[A-Z_]+/g, '')), 'signing material only ever comes from secrets');
});

console.log(`${checks} checks passed`);
