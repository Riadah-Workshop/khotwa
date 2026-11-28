// Edits to the native projects that `cap add` generates: permissions, usage texts, version numbers.
// Every function takes the file's text and returns the new text, and running one twice changes nothing more, so they
// are tested without a phone or a build (scripts/test-mobile-patch.mjs in the main project).

export const ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];

/** What the merged Android manifest must contain for the features to work; checked after the build (verify.mjs). */
export const ANDROID_REQUIRED = [
  ...ANDROID_PERMISSIONS,
  'BackgroundGeolocationService',
];

export const IOS_USAGE_TEXTS = {
  NSCameraUsageDescription: 'Khotwa uses the camera to scan product barcodes. | يستخدم التطبيق الكاميرا لمسح باركود المنتجات.',
  NSLocationWhenInUseUsageDescription: 'Khotwa uses your location to record arrival at the school or cafeteria. | يستخدم التطبيق موقعك لتسجيل الوصول إلى المدرسة أو المقصف.',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'Khotwa uses your location to record arrival at the school or cafeteria, even when the app is closed. | يستخدم التطبيق موقعك لتسجيل الوصول إلى المدرسة أو المقصف حتى عند إغلاق التطبيق.',
};

const MARK = 'khotwa-shell';

/** Android: permissions, an optional camera, and the request to fetch Google's barcode scanner when the app is installed. */
export function patchAndroidManifest(xml) {
  if (xml.includes(MARK)) return xml;
  const missing = ANDROID_PERMISSIONS.filter((name) => !xml.includes(`"${name}"`));
  const uses = [
    ...missing.map((name) => `    <uses-permission android:name="${name}" />`),
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
  ].join('\n');
  const withPermissions = xml.replace(/<application\b/, `<!-- ${MARK}: permissions -->\n${uses}\n\n    <application`);
  if (withPermissions === xml) throw new Error('AndroidManifest.xml has no <application> element');
  const meta = `        <!-- ${MARK}: download Google's barcode scanner together with the app -->\n        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />\n    `;
  const withMeta = withPermissions.replace(/<\/application>/, `${meta}</application>`);
  if (withMeta === withPermissions) throw new Error('AndroidManifest.xml has no </application> element');
  return withMeta;
}

/** Android: the text of the standing notification the system requires while the position is followed in the background. */
export function patchAndroidStrings(xml) {
  if (xml.includes('capacitor_background_geolocation_notification_channel_name')) return xml;
  const add = '    <string name="capacitor_background_geolocation_notification_channel_name">Khotwa</string>\n';
  const out = xml.replace(/<\/resources>/, `${add}</resources>`);
  if (out === xml) throw new Error('strings.xml has no </resources> element');
  return out;
}

/** The whole number Android needs for ordering releases: 1.2.3 -> 1002003. Larger versions always get a larger number. */
export function versionCodeFor(version) {
  const match = /^(\d{1,4})\.(\d{1,3})\.(\d{1,3})$/.exec(version);
  if (!match) throw new Error(`The app version must look like 1.2.3 (got "${version}")`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 999 || patch > 999) throw new Error('Minor and patch numbers must be below 1000');
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (code > 2_100_000_000) throw new Error('The version is too large for an Android version code');
  return code;
}

/** Android: put the version from package.json into app/build.gradle. */
export function patchAndroidGradle(gradle, version) {
  const code = versionCodeFor(version);
  let hits = 0;
  const out = gradle
    .replace(/versionCode\s+\d+/, () => { hits += 1; return `versionCode ${code}`; })
    .replace(/versionName\s+"[^"]*"/, () => { hits += 1; return `versionName "${version}"`; });
  if (hits !== 2) throw new Error('app/build.gradle has no versionCode / versionName to update');
  return out;
}

const plistKey = (xml, key) => new RegExp(`<key>${key}</key>`).test(xml);

/** iOS: the texts iOS shows when it asks for the camera and location, and permission to keep following the position. */
export function patchInfoPlist(xml) {
  const parts = [];
  for (const [key, text] of Object.entries(IOS_USAGE_TEXTS)) {
    if (!plistKey(xml, key)) parts.push(`\t<key>${key}</key>\n\t<string>${text}</string>`);
  }
  if (!plistKey(xml, 'UIBackgroundModes')) parts.push('\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>');
  if (!parts.length) return xml;
  const end = xml.lastIndexOf('</dict>\n</plist>');
  const at = end >= 0 ? end : xml.lastIndexOf('</dict>');
  if (at < 0) throw new Error('Info.plist has no closing </dict>');
  return `${xml.slice(0, at)}${parts.join('\n')}\n${xml.slice(at)}`;
}

/** iOS: put the version into the Xcode project. `build` is the build number the App Store wants to grow with every upload. */
export function patchIosProject(pbxproj, version, build) {
  versionCodeFor(version);
  let hits = 0;
  const out = pbxproj
    .replace(/MARKETING_VERSION = [^;]+;/g, () => { hits += 1; return `MARKETING_VERSION = ${version};`; })
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, () => `CURRENT_PROJECT_VERSION = ${build};`);
  if (!hits) throw new Error('project.pbxproj has no MARKETING_VERSION to update');
  return out;
}

/** The oldest iOS the app runs on. Google's ML Kit scanner needs more than Capacitor's default, and CocoaPods refuses to install without it. */
export const IOS_DEPLOYMENT_TARGET = '16.0';

/** iOS: the Podfile's minimum iOS version. */
export function patchPodfile(text, target = IOS_DEPLOYMENT_TARGET) {
  let hits = 0;
  const out = text.replace(/^(\s*)platform :ios, '[^']*'/m, (_match, space) => { hits += 1; return `${space}platform :ios, '${target}'`; });
  if (!hits) throw new Error("Podfile has no \"platform :ios, '...'\" line");
  return out;
}

/** iOS: the same minimum version inside the Xcode project, which must not be lower than the Podfile's. */
export function patchIosDeploymentTarget(pbxproj, target = IOS_DEPLOYMENT_TARGET) {
  let hits = 0;
  const out = pbxproj.replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, () => { hits += 1; return `IPHONEOS_DEPLOYMENT_TARGET = ${target};`; });
  if (!hits) throw new Error('project.pbxproj has no IPHONEOS_DEPLOYMENT_TARGET to update');
  return out;
}

/** What is missing from a built (merged) Android manifest; an empty list means the app can do everything the website asks. */
export function missingFromManifest(xml) {
  return ANDROID_REQUIRED.filter((needle) => !xml.includes(needle));
}
