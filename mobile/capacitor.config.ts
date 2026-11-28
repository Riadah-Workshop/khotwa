// Settings for the Khotwa app shell. The shell is a thin native container around the website: it loads KHOTWA_URL and
// adds what a website cannot do alone (the phone's scanner, position while the app is closed, in-app updates).
//
// Written without a type annotation on purpose: the Capacitor command-line tool reads this file without type-checking.
import {readFileSync} from 'fs';

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
const address = (process.env.KHOTWA_URL || '').trim();

if (!/^https:\/\/[^/\s]+\/?$/i.test(address)) {
  throw new Error('Set KHOTWA_URL to the https address of the Khotwa website, for example KHOTWA_URL=https://school.example.com');
}
const site = new URL(address);

const config = {
  // The application id is permanent once the app is published in a store: choose it before the first release.
  appId: process.env.KHOTWA_APP_ID || 'com.riadah.khotwa',
  appName: 'Khotwa',
  webDir: 'www',
  server: {
    url: site.origin,
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [site.host],
    // Shown instead of a blank screen when the phone has no connection (generated into www/ by scripts/build-www.mjs).
    errorPath: 'index.html',
  },
  // The website reads this tag to know it is inside the app, and which version (app/native/bridge.ts appVersion()).
  android: {appendUserAgent: `KhotwaApp/${version} (android)`, allowMixedContent: false},
  ios: {appendUserAgent: `KhotwaApp/${version} (ios)`, contentInset: 'always'},
};

export default config;
