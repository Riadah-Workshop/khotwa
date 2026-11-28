// App versions and what the website / app may report about themselves. Pure logic (lib/app-version.ts, lib/app-report.ts).
import assert from 'node:assert/strict';
import {compareVersions, isVersion, parseVersion, releaseProblem, updateStatus} from '../lib/app-version.ts';
import {cleanRoute, cleanText, describeAgent, deviceProblems, fingerprint, fingerprintSource, MAX_DETAIL, MAX_MESSAGE, normalizeDevice, normalizeIssue} from '../lib/app-report.ts';

// ---- versions ---------------------------------------------------------------------------------------------------------
for (const good of ['1.0', '1.2.3', '12.34.56.78', '0.0.1']) assert.ok(isVersion(good), good);
for (const bad of ['', '1', '1.', '.1', '1.2.3.4.5', '1.2-beta', 'v1.2', '1.2.x', '1000.1', ' 1.2', null, undefined, 12, '1.2\n3']) assert.ok(!isVersion(bad), `not a version: ${JSON.stringify(bad)}`);
assert.deepEqual(parseVersion('1.2'), [1, 2, 0, 0]);
assert.equal(compareVersions('1.2', '1.2.0'), 0, '1.2 equals 1.2.0');
assert.equal(compareVersions('1.2.1', '1.2'), 1);
assert.equal(compareVersions('1.10.0', '1.9.9'), 1, 'numbers, not text: 1.10 is newer than 1.9');
assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
assert.equal(compareVersions('1.0.0.1', '1.0.0'), 1);
assert.equal(compareVersions('abc', '1.0'), null);

const release = {latest: '1.4.0', minimum: '1.2.0'};
assert.equal(updateStatus('1.4.0', release), 'current');
assert.equal(updateStatus('1.5.0', release), 'current', 'a build ahead of the store (testing) is not asked to update');
assert.equal(updateStatus('1.3.9', release), 'available');
assert.equal(updateStatus('1.2.0', release), 'available', 'the minimum itself is allowed');
assert.equal(updateStatus('1.1.9', release), 'required');
assert.equal(updateStatus('1.2.0', null), 'current', 'no release set: nothing is asked');
assert.equal(updateStatus('', release), 'unknown', 'the website (no version) is never asked');
assert.equal(updateStatus('garbage', release), 'unknown');
assert.equal(releaseProblem({latest: '1.4.0', minimum: '1.2.0'}), null);
assert.equal(releaseProblem({latest: '1.4.0', minimum: '1.4.0'}), null, 'minimum may equal latest');
assert.equal(releaseProblem({latest: '', minimum: '1.0'}), 'latest');
assert.equal(releaseProblem({latest: '1.4', minimum: 'x'}), 'minimum');
assert.equal(releaseProblem({latest: '1.0', minimum: '1.1'}), 'order', 'the minimum cannot be above the latest');

// ---- cleaning ---------------------------------------------------------------------------------------------------------
const clean = (text) => cleanText(text, MAX_MESSAGE);
assert.equal(clean('Cannot read properties of undefined (reading "name")'), 'Cannot read properties of undefined (reading "name")', 'an ordinary message is kept');
assert.equal(clean('  too   many\n spaces\t'), 'too many spaces');
assert.ok(!clean('failed for sara@school.edu.sa today').includes('@'), 'an e-mail address is removed');
assert.ok(!/\d{7}/.test(clean('call +966 51 234 5678 failed')) && clean('call +966 51 234 5678 failed').includes('<number>'), 'a phone number is removed');
assert.ok(!/\d{7}/.test(clean('parent 0512345678 not found')), 'a local phone number is removed');
assert.equal(clean('from 192.168.1.100 blocked'), 'from <ip> blocked', 'an IPv4 address is removed');
assert.equal(clean('from 2001:db8::ff00:42:8329 blocked'), 'from <ip> blocked', 'an IPv6 address is removed');
assert.equal(clean('KhotwaApp/1.4.2 crashed in main.js:12:5'), 'KhotwaApp/1.4.2 crashed in main.js:12:5', 'a version and a line position are not addresses');
assert.equal(clean('row 3f2a9c1e-1b2c-4d5e-8f90-1234567890ab missing'), 'row <id> missing', 'a uuid is removed');
assert.ok(!clean('token abcdefghijklmnopqrstuvwxyz0123456789 rejected').includes('abcdefghijklmnop'), 'a long token is removed');
assert.equal(clean('GET https://khotwa.example.com/api/fushati?phone=0512345678&x=1 failed'), 'GET /api/fushati failed', 'host and query string are removed');
assert.equal(clean('line 12:5'), 'line 12:5', 'short numbers are kept');
assert.ok(clean('word '.repeat(100)).length <= MAX_MESSAGE && clean('word '.repeat(100)).endsWith('…'), 'cut to the limit');
assert.equal(clean('a'.repeat(500)), '<token>', 'one endless word is a token, not a message');
assert.equal(clean(42), '');
assert.equal(clean('bidi ‮ text\u0000 here'), 'bidi text here', 'control and direction-override characters are removed');
assert.ok(cleanText('ab '.repeat(200), MAX_DETAIL).length <= MAX_DETAIL);

assert.equal(cleanRoute('/fushati/agent?token=abc'), '/fushati/agent');
assert.equal(cleanRoute('/api/fushati/receipts/12345'), '/api/fushati/receipts/:id', 'a numeric id becomes :id');
assert.equal(cleanRoute('/api/x/3f2a9c1e-1b2c-4d5e-8f90-1234567890ab/y'), '/api/x/:id/y');
assert.equal(cleanRoute('https://evil.example/steal'), '/steal', 'only the path is kept');
assert.equal(cleanRoute(42), '');
assert.ok(cleanRoute('/' + 'a/'.repeat(100)).length <= 80);
assert.ok(!/[<> ]/.test(cleanRoute('/a b<script>')));

// ---- issues -----------------------------------------------------------------------------------------------------------
assert.equal(normalizeIssue(null), null);
assert.equal(normalizeIssue({kind: 'script', message: ''}), null, 'an empty message is nothing');
assert.equal(normalizeIssue({kind: 'virus', message: 'x'}), null, 'an unknown kind is refused');
assert.equal(normalizeIssue('text'), null);
const issue = normalizeIssue({kind: 'api', message: 'POST /api/fushati 500', detail: 'ab '.repeat(150), route: '/fushati/agent?x=1', extra: 'ignored'});
assert.deepEqual(Object.keys(issue).sort(), ['detail', 'kind', 'message', 'route'], 'nothing else is carried');
assert.ok(issue.detail.length <= MAX_DETAIL && issue.detail.length > MAX_DETAIL - 3);
assert.equal(issue.route, '/fushati/agent');

// The same bug from two people is one problem; a different channel or route is another.
const a = normalizeIssue({kind: 'script', message: 'Failed for user 4821 at row 17', route: '/x'});
const b = normalizeIssue({kind: 'script', message: 'Failed for user 9034 at row 22', route: '/x'});
assert.equal(fingerprintSource(a, 'web'), fingerprintSource(b, 'web'), 'digits do not split one bug into many');
assert.equal(await fingerprint(a, 'web'), await fingerprint(b, 'web'));
assert.notEqual(await fingerprint(a, 'web'), await fingerprint(a, 'android'), 'the same message in the app is its own problem');
assert.notEqual(await fingerprint(a, 'web'), await fingerprint({...a, route: '/y'}, 'web'));
assert.match(await fingerprint(a, 'web'), /^[0-9a-f]{20}$/);

// ---- devices ----------------------------------------------------------------------------------------------------------
const device = normalizeDevice({osVersion: 'Android 14', deviceModel: 'Pixel 8 <b>', location: 'denied', backgroundLocation: 'weird', notifications: 'granted', camera: 'prompt', batterySaver: 'on', extra: 1});
assert.deepEqual(device, {osVersion: 'Android 14', deviceModel: 'Pixel 8 b', location: 'denied', backgroundLocation: 'unknown', notifications: 'granted', camera: 'prompt', batterySaver: 'on'}, 'unknown values become "unknown", labels lose odd characters');
assert.equal(normalizeDevice('x'), null);

const base = {role: 'fushati_agent', channel: 'android', location: 'granted', backgroundLocation: 'granted', notifications: 'granted', camera: 'granted', batterySaver: 'off'};
assert.deepEqual(deviceProblems(base, 'current'), [], 'a healthy phone has no findings');
assert.deepEqual(deviceProblems({...base, location: 'denied'}, 'current'), ['location_not_allowed']);
assert.deepEqual(deviceProblems({...base, location: 'prompt'}, 'current'), ['location_not_allowed'], 'never asked is as bad as refused for arrivals');
assert.deepEqual(deviceProblems({...base, location: 'unsupported'}, 'current'), [], 'a browser that cannot say is not a problem');
assert.deepEqual(deviceProblems({...base, backgroundLocation: 'denied'}, 'current'), ['background_not_allowed']);
assert.deepEqual(deviceProblems({...base, camera: 'denied'}, 'current'), ['camera_not_allowed']);
assert.deepEqual(deviceProblems({...base, camera: 'prompt'}, 'current'), [], 'the camera is asked for when scanning');
assert.deepEqual(deviceProblems({...base, batterySaver: 'on'}, 'current'), ['battery_saver']);
assert.deepEqual(deviceProblems({...base, notifications: 'denied'}, 'required'), ['notifications_off', 'update_required']);
assert.deepEqual(deviceProblems({...base, role: 'parent', location: 'denied', camera: 'denied', batterySaver: 'on'}, 'available'), ['update_available'], 'a parent does not need location, the camera or the battery: only updates matter');
assert.deepEqual(deviceProblems({...base, channel: 'web', backgroundLocation: 'denied', batterySaver: 'on', notifications: 'denied'}, 'current'), [], 'in a browser neither background position, battery nor notifications are asked');

assert.equal(describeAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome/126.0.0.0 Mobile Safari/537.36'), 'Android 14 · Chrome 126');
assert.equal(describeAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit Version/17.5 Mobile Safari/604.1'), 'iOS 17 · Safari 17');
assert.equal(describeAgent('Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile KhotwaApp/1.0.0 (android)'), 'Android 14 · App');
assert.equal(describeAgent(''), '');
assert.equal(describeAgent(null), '');

console.log('App version and report rules passed: versions compare by number, the update decision is exact, reports lose phone numbers, e-mails, ids and query strings, and one bug is one problem.');
