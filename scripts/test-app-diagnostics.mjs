// App diagnostics and the version check, through the real gateway and route handlers on a real database.
//
//   - the version check is public (the app asks before anybody signs in) and answers current / available / required
//   - every signed-in role may report a problem (the read-only manager too); nobody signed out may
//   - a problem is cleaned (no phone, e-mail, address, id), counted by fingerprint, and remembers how many people met it
//   - a phone's state is kept for the app and for the cafeteria agent's browser, and for nobody else's browser
//   - only the system administrator can read diagnostics or change anything in them
//   - releases are validated, a missing table is reported, and a broken diagnostics table never breaks a report
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './support/school-harness.mjs';

const APP_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit Chrome/126.0 Mobile Safari/537.36 KhotwaApp/1.4.2 (android)';
const harness = await createHarness();
try {
  const {DB, sessions, serve, gate, phones, fushatiIds: ids} = harness;
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  const call = async (cookie, path, {method = 'GET', body, ua} = {}) => {
    const response = await serve(cookie, path, {method, body, headers: ua ? {'user-agent': ua} : {}});
    const text = await response.text();
    return {status: response.status, text, json: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : null};
  };
  const report = (cookie, body, ua) => call(cookie, '/api/app/report', {method: 'POST', body, ua});
  const system = sessions.admin.default;
  const snapshot = async (query = '') => (await call(system, '/api/admin/diagnostics' + query)).json;
  const admin = (op, data) => call(system, '/api/admin/diagnostics', {method: 'POST', body: {op, data}});

  // ---- 1. The version check is public, and says current / available / required -------------------------------------------
  const open = await call('', '/api/app/version?platform=android&version=1.0.0');
  assert.equal(open.status, 200, 'no sign-in is needed to ask which version is current');
  assert.equal(open.json.status, 'current', 'with no release set nothing is asked of anybody');
  assert.equal((await gate('', '/api/app/version', {method: 'POST'})).status, 401, 'only reading is public');
  assert.equal((await gate('', '/api/app/report', {method: 'POST'})).status, 401, 'reporting needs a sign-in');
  assert.equal((await gate('', '/api/admin/diagnostics')).status, 401);

  // ---- 2. Releases: who may set them, and what is refused ------------------------------------------------------------------
  for (const [who, cookie] of [['a school agent', sessions.deputy.a], ['a manager', sessions.manager.a], ['a parent', sessions.parent.a], ['a cafeteria administrator', sessions.fushatiAdmin], ['a cafeteria agent', sessions.fushatiAgent]]) {
    assert.equal((await call(cookie, '/api/admin/diagnostics')).status, 403, `${who} cannot read diagnostics`);
    assert.equal((await call(cookie, '/api/admin/diagnostics', {method: 'POST', body: {op: 'set-release', data: {platform: 'android', latest: '9.9.9'}}})).status, 403, `${who} cannot set a release`);
  }
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_releases'))[0].n, 0, 'nothing was saved by the refused attempts');
  const bad = async (data) => (await admin('set-release', data));
  assert.deepEqual([(await bad({platform: 'windows', latest: '1.0'})).json.error, (await bad({platform: 'android', latest: ''})).json.error, (await bad({platform: 'android', latest: 'abc'})).json.error], ['platform', 'latest', 'latest']);
  assert.equal((await bad({platform: 'android', latest: '1.4.0', minimum: '2.0'})).json.error, 'order', 'the oldest allowed cannot be above the newest');
  assert.equal((await bad({platform: 'android', latest: '1.4.0', minimum: 'x'})).json.error, 'minimum');
  for (const link of ['http://play.google.com/x', 'javascript:alert(1)', 'https://user:pw@example.com/x', 'https://example.com/a b', 'ftp://example.com']) assert.equal((await bad({platform: 'android', latest: '1.4.0', minimum: '1.2.0', storeUrl: link})).json.error, 'url', `link refused: ${link}`);
  const saved = await admin('set-release', {platform: 'android', latest: '1.4.0', minimum: '1.2.0', storeUrl: 'https://play.google.com/store/apps/details?id=sa.khotwa', notesAr: 'تحسينات', notesEn: 'x'.repeat(400)});
  assert.equal(saved.status, 200);
  assert.equal(saved.json.release.latest, '1.4.0');
  assert.equal(saved.json.release.notesEn.length, 240, 'a note is cut to 240 characters');
  const defaulted = await admin('set-release', {platform: 'ios', latest: '2.0'});
  assert.equal(defaulted.json.release.minimum, '1.0', 'with no minimum given everything from 1.0 is allowed');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_releases'))[0].n, 2);
  await admin('set-release', {platform: 'ios', latest: '2.1', minimum: '2.0'});
  assert.equal((await rows("SELECT latest_version FROM khotwa_app_releases WHERE platform='ios'"))[0].latest_version, '2.1', 'saving again replaces the release');

  // ---- 3. The answer the app gets ------------------------------------------------------------------------------------------
  const ask = async (query, ua) => (await call('', '/api/app/version' + query, {ua})).json;
  assert.equal((await ask('?platform=android&version=1.0.0')).status, 'required');
  assert.equal((await ask('?platform=android&version=1.3.0')).status, 'available');
  assert.equal((await ask('?platform=android&version=1.4.0')).status, 'current');
  assert.equal((await ask('?platform=android&version=1.0.0', APP_UA)).status, 'current', "the app's own user-agent (1.4.2) outranks what the address says");
  assert.equal((await ask('?platform=ios&version=1.9.0')).status, 'required');
  assert.equal((await ask('?platform=android')).status, 'unknown', 'no version: nothing is asked');
  assert.equal((await ask('')).status, 'current', 'the website is never asked to update');
  assert.equal((await ask('?platform=windows&version=1.0')).status, 'current', 'an unknown platform is never asked either');
  assert.equal((await ask('?platform=android&version=1.0<script>')).status, 'unknown', 'a malformed version is not trusted');
  const answer = await ask('?platform=android&version=1.3.0');
  assert.deepEqual([answer.latest, answer.minimum, answer.storeUrl, answer.notes.ar], ['1.4.0', '1.2.0', 'https://play.google.com/store/apps/details?id=sa.khotwa', 'تحسينات']);
  assert.ok(!JSON.stringify(answer).includes('updated_at') && Object.keys(answer).sort().join() === 'latest,minimum,notes,platform,status,storeUrl', 'the answer holds exactly what the app needs');

  // ---- 4. Every signed-in role may report; nobody else ---------------------------------------------------------------------
  const boom = (n) => ({issue: {kind: 'script', message: `Cannot read properties of undefined (reading 'name') in row ${n}`, detail: 'main.js:12:5', route: '/fushati/agent'}});
  assert.equal((await report('', boom(1))).status, 401, 'a signed-out visitor cannot report');
  const everyone = [['deputy', sessions.deputy.a], ['manager', sessions.manager.a], ['parent', sessions.parent.a], ['fushati_admin', sessions.fushatiAdmin], ['fushati_agent', sessions.fushatiAgent], ['main_admin', system]];
  for (const [index, [role, cookie]] of everyone.entries()) {
    const sent = await report(cookie, boom(index + 100));
    assert.equal(sent.status, 200, `${role} may report (the read-only manager too): ${sent.text}`);
    assert.equal(sent.json.issue, true);
  }
  const stored = await rows('SELECT * FROM khotwa_app_issues');
  assert.equal(stored.length, 1, 'the same bug from six people is one problem (digits do not split it)');
  assert.equal(stored[0].occurrences, 6);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issue_accounts'))[0].n, 6, 'six different people');
  await report(sessions.deputy.a, boom(7));
  assert.equal((await rows('SELECT occurrences FROM khotwa_app_issues'))[0].occurrences, 7);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issue_accounts'))[0].n, 6, 'the same person again is another time, not another person');
  assert.deepEqual([stored[0].role !== '', stored[0].channel], [true, 'web']);

  // Refused or ignored
  assert.equal((await report(system, {})).status, 400, 'nothing to record');
  assert.equal((await report(system, {issue: {kind: 'virus', message: 'x'}})).status, 400, 'an unknown kind');
  assert.equal((await report(system, 'just text')).status, 400);
  assert.equal((await report(system, {issue: {kind: 'script', message: 'z'.repeat(6000)}})).status, 413, 'a report over 4 KB is refused');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issues'))[0].n, 1, 'refused reports store nothing');

  // ---- 5. What is stored carries no phone number, e-mail, address or id --------------------------------------------------
  const phone = Object.values(phones)[0];
  await report(sessions.parent.a, {issue: {kind: 'api', message: `POST /api/fushati 500 for ${phone} and sara@school.edu.sa from 10.1.2.3 id 3f2a9c1e-1b2c-4d5e-8f90-1234567890ab`, detail: `https://khotwa.example.com/_next/static/app.js?token=SECRET123&phone=${phone}:9:4`, route: `/parent?phone=${phone}`}});
  const dirty = (await rows("SELECT * FROM khotwa_app_issues WHERE kind='api'"))[0];
  const everything = JSON.stringify(dirty);
  for (const secret of [phone, 'sara@', '10.1.2.3', '3f2a9c1e', 'SECRET123', 'khotwa.example.com']) assert.ok(!everything.includes(secret), `${secret} is not stored: ${everything}`);
  assert.equal(dirty.route, '/parent', 'the route keeps the path only');
  assert.deepEqual((await rows('PRAGMA table_info(khotwa_app_issues)')).map((c) => c.name).sort(), ['app_version', 'channel', 'detail', 'fingerprint', 'first_seen', 'kind', 'last_seen', 'message', 'occurrences', 'platform', 'resolved_at', 'role', 'route'], 'no position, address or device identifier column');
  assert.deepEqual((await rows('PRAGMA table_info(khotwa_app_devices)')).map((c) => c.name).sort(), ['account_key', 'app_version', 'background_location', 'battery_saver', 'camera', 'channel', 'device_model', 'location_permission', 'notifications', 'os_version', 'reported_at', 'role', 'school_id'], 'a device row holds permissions and versions, never a position or an identifier');

  // ---- 6. The app and the browser are told apart -----------------------------------------------------------------------------
  await report(sessions.fushatiAgent, boom(1), APP_UA);
  const fromApp = (await rows("SELECT * FROM khotwa_app_issues WHERE channel='android'"))[0];
  assert.deepEqual([fromApp.app_version, fromApp.platform], ['1.4.2', 'Android 14 · App'], 'the app version comes from its user-agent tag, not from the body');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE channel=\'web\' AND message LIKE \'Cannot read%\''))[0].n, 1, 'the same message in the app is its own problem');

  // ---- 7. Phones: the app for everybody, a browser only for the cafeteria agent -----------------------------------------------
  const state = {osVersion: 'Android 14', deviceModel: 'Pixel 8', location: 'denied', backgroundLocation: 'unknown', notifications: 'granted', camera: 'granted', batterySaver: 'unknown'};
  assert.equal((await report(sessions.fushatiAgent, {device: state})).json.device, true, "the agent's browser is recorded: his arrival alerts depend on its location permission");
  assert.equal((await report(sessions.parent.a, {device: state})).json.device, false, "a parent's browser is not recorded");
  assert.equal((await report(sessions.deputy.a, {device: state})).json.device, false, "a school agent's browser is not recorded");
  assert.equal((await report(sessions.parent.a, {device: {...state, notifications: 'denied'}}, APP_UA)).json.device, true, "a parent's app is recorded");
  assert.equal((await report(sessions.fushatiAgent, {device: {...state, location: 'granted', camera: 'denied'}}, APP_UA)).json.device, true);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_devices'))[0].n, 3, 'agent (browser), parent (app), agent (app)');
  await report(sessions.fushatiAgent, {device: {...state, location: 'granted'}});
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_devices'))[0].n, 3, 'a new report replaces the last one of the same account and channel');
  assert.equal((await rows("SELECT location_permission AS l FROM khotwa_app_devices WHERE account_key=? AND channel='web'", ids.agent1))[0].l, 'granted');
  await report(sessions.fushatiAgent, {device: {...state, location: 'denied'}});

  // ---- 8. What the system administrator sees ----------------------------------------------------------------------------------
  const snap = await snapshot();
  assert.equal(snap.health.database.ok, true);
  assert.deepEqual(snap.health.schemaMissing, [], 'every migration ran');
  assert.deepEqual(Object.keys(snap.health.environment).sort(), ['mail', 'origins', 'storage']);
  assert.ok(Object.values(snap.health.environment).every((value) => typeof value === 'boolean'), 'settings are shown as yes/no, never as values');
  const top = snap.issues.find((issue) => issue.message.startsWith('Cannot read') && issue.channel === 'web');
  assert.deepEqual([top.occurrences, top.people, top.route, top.resolvedAt], [7, 6, '/fushati/agent', null]);
  assert.ok(snap.counts.openIssues >= 3 && snap.counts.signIns24h >= 6 && snap.counts.signIns7d >= snap.counts.signIns24h);
  const agentApp = snap.devices.find((d) => d.channel === 'android' && d.role === 'fushati_agent');
  assert.deepEqual(agentApp.problems, ['camera_not_allowed'], 'the agent in the app: location fine, camera refused');
  assert.ok(agentApp.name, "the agent's account is named");
  const agentWeb = snap.devices.find((d) => d.channel === 'web');
  assert.deepEqual(agentWeb.problems, ['location_not_allowed'], 'the agent in a browser: location refused, so arrivals are not recorded');
  const parentApp = snap.devices.find((d) => d.role === 'parent');
  assert.deepEqual(parentApp.problems, ['notifications_off'], 'a parent in the app who refused notifications is told so; location, camera and battery are not his concern');
  assert.match(parentApp.name, /•••\d{4}$/, 'a parent is shown by a masked number');
  assert.equal(snap.devices[0].problems.length >= snap.devices.at(-1).problems.length, true, 'phones with findings come first');
  assert.ok(snap.versions.some((v) => v.channel === 'android' && v.version === '1.4.2' && v.people === 2));
  assert.equal(snap.counts.phonesWithProblems, 3, 'agent in a browser, agent in the app, parent in the app');
  assert.ok(snap.signIns.length >= 6 && snap.signIns.every((row) => row.id && row.at));
  const all = JSON.stringify(snap);
  for (const full of Object.values(phones)) assert.ok(!all.includes(full), 'no parent phone number is in diagnostics');
  assert.ok(!/"(?:lat|lng|latitude|longitude|ip)"/.test(all), 'no position or address field');
  assert.equal(snap.stampRetentionDays, 180);

  // A newer minimum makes the installed app "required": the device row says so.
  await admin('set-release', {platform: 'android', latest: '1.6.0', minimum: '1.5.0'});
  const stale = (await snapshot()).devices.find((d) => d.role === 'parent');
  assert.equal(stale.update, 'required');
  assert.deepEqual(stale.problems, ['notifications_off', 'update_required']);
  await admin('set-release', {platform: 'android', latest: '1.4.0', minimum: '1.2.0', storeUrl: ''});

  // ---- 9. Solving, reopening, deleting ----------------------------------------------------------------------------------------
  const key = top.fingerprint;
  assert.equal((await admin('resolve-issue', {fingerprint: key})).json.changed, 1);
  assert.ok(!(await snapshot()).issues.some((i) => i.fingerprint === key), 'a solved problem leaves the list');
  const solved = (await snapshot('?solved=1')).issues.find((i) => i.fingerprint === key);
  assert.ok(solved.resolvedAt, 'and shows again when solved ones are asked for');
  assert.equal((await snapshot()).counts.solvedIssues, 1);
  await report(sessions.deputy.a, boom(8));
  const back = (await snapshot()).issues.find((i) => i.fingerprint === key);
  assert.deepEqual([back.resolvedAt, back.occurrences], [null, 8], 'a problem that comes back is open again');
  assert.equal((await admin('resolve-issue', {fingerprint: key})).json.changed, 1);
  assert.equal((await admin('reopen-issue', {fingerprint: key})).json.changed, 1);
  assert.equal((await admin('resolve-issue', {fingerprint: 'nonsense'})).json.changed, 0, 'a bad id changes nothing');
  assert.equal((await admin('delete-issue', {fingerprint: 'f'.repeat(20)})).json.changed, 0, 'an unknown id changes nothing');
  assert.equal((await admin('nonsense', {})).status, 400);
  assert.equal((await admin('delete-issue', {fingerprint: key})).json.changed, 1);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issue_accounts WHERE fingerprint=?', key))[0].n, 0, "deleting a problem deletes who met it");
  const other = (await rows("SELECT fingerprint FROM khotwa_app_issues WHERE kind='api'"))[0].fingerprint;
  await admin('resolve-issue', {fingerprint: other});
  assert.equal((await admin('clear-solved', {})).json.changed, 1);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE fingerprint=?', other))[0].n, 0);

  // ---- 10. A full list makes room; old problems age out ----------------------------------------------------------------------------
  const now = new Date().toISOString();
  await DB.prepare('DELETE FROM khotwa_app_issues').run();
  await DB.prepare('DELETE FROM khotwa_app_issue_accounts').run();
  await DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<500)
    INSERT INTO khotwa_app_issues(fingerprint,kind,message,detail,route,role,channel,app_version,platform,occurrences,first_seen,last_seen,resolved_at)
    SELECT printf('%020x',i),'script','filler '||i,'','','','web','','',CASE WHEN i=3 THEN 1 ELSE 5 END,?1,?1,CASE WHEN i=9 THEN ?1 ELSE NULL END FROM n`).bind(now).run();
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issues'))[0].n, 500);
  await report(sessions.deputy.a, {issue: {kind: 'script', message: 'a brand new problem', route: '/x'}});
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_app_issues'))[0].n, 500, 'the list never grows past 500');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE message='a brand new problem'"))[0].n, 1, 'the new problem got in');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE fingerprint=printf('%020x',9)"))[0].n, 0, 'a solved problem was dropped to make room');
  await report(sessions.deputy.a, {issue: {kind: 'script', message: 'another new problem', route: '/x'}});
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE fingerprint=printf('%020x',3)"))[0].n, 0, 'then the one seen least often');
  const longAgo = new Date(Date.now() - 100 * 86_400_000).toISOString();
  await DB.prepare("INSERT INTO khotwa_app_issues(fingerprint,kind,message,first_seen,last_seen) VALUES('0000000000000000aaaa','script','old',?1,?1)").bind(longAgo).run();
  await DB.prepare("INSERT INTO khotwa_app_issue_accounts(fingerprint,account_key) VALUES('0000000000000000aaaa','x')").run();
  await report(sessions.deputy.a, {issue: {kind: 'script', message: 'yet another problem', route: '/x'}});
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE message='old'"))[0].n, 0, 'problems not seen for 90 days are removed');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_app_issue_accounts WHERE fingerprint='0000000000000000aaaa'"))[0].n, 0, 'with who met them');

  // ---- 11. A missing or broken table is reported and never breaks the app ------------------------------------------------------------
  await DB.prepare('ALTER TABLE khotwa_app_issues RENAME TO khotwa_app_issues_off').run();
  const survived = await report(sessions.deputy.a, boom(1));
  assert.equal(survived.status, 200, 'with the table missing a report still gets an answer');
  assert.equal(survived.json.issue, false, 'and says nothing was stored');
  assert.ok((await snapshot()).health.schemaMissing.includes('khotwa_app_issues'), 'and the administrator is told which table is missing');
  await DB.prepare('ALTER TABLE khotwa_app_issues_off RENAME TO khotwa_app_issues').run();
  await DB.prepare('ALTER TABLE khotwa_app_releases RENAME TO khotwa_app_releases_off').run();
  assert.equal((await ask('?platform=android&version=1.0.0')).status, 'current', 'with the release table missing the app is simply not asked to update');
  assert.ok((await snapshot()).health.schemaMissing.includes('khotwa_app_releases'));
  await DB.prepare('ALTER TABLE khotwa_app_releases_off RENAME TO khotwa_app_releases').run();
  await DB.prepare('ALTER TABLE fushati_visits RENAME COLUMN arrival_logged_at TO arrival_logged_at_off').run();
  assert.ok((await snapshot()).health.schemaMissing.includes('fushati_visits.arrival_logged_at'), 'a missing column is named too');
  await DB.prepare('ALTER TABLE fushati_visits RENAME COLUMN arrival_logged_at_off TO arrival_logged_at').run();
  assert.deepEqual((await snapshot()).health.schemaMissing, [], 'and the check is clean again once restored');

  // ---- 12. What is wired into the pages --------------------------------------------------------------------------------------------------
  const read = (file) => fs.readFileSync(file, 'utf8');
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('<AppHealth/>') && layout.includes('<UpdateBar/>'), 'the reporter and the update bar are on every page');
  assert.ok(fs.existsSync('app/error.tsx') && read('app/error.tsx').includes('reportIssue'), 'a crashed screen shows a way out and is reported');
  const clientSide = ['app/native/health.tsx', 'app/native/report-client.ts', 'app/native/update-bar.tsx', 'app/error.tsx'].map(read).join('\n');
  assert.ok(!/getCurrentPosition|watchPosition|latitude|longitude|\.coords/.test(clientSide), 'the reporting code never reads a position');
  assert.ok(read('app/admin/admin-console.tsx').includes("id: 'diagnostics'") && read('app/admin/admin-console.tsx').includes('<DiagnosticsPanel'), 'the Diagnostics tab is in the administrator console');
  assert.ok(!/diagnostics/i.test(read('app/fushati/fushati-dashboard.tsx')) && !/diagnostics/i.test(read('app/dashboard.tsx')) && !/diagnostics/i.test(read('app/manager/school-manager-dashboard.tsx')) && !/diagnostics/i.test(read('app/parent/parent-portal.tsx')), 'no other role has the tab');
  const migration = read('drizzle/0034_app_diagnostics.sql').replace(/--.*$/gm, '');
  assert.ok(!/\b(lat|lng|latitude|longitude|ip|ip_address|user_agent|device_id|imei)\b/i.test(migration), 'the migration defines no position, address or device identifier');

  console.log('App diagnostics passed: public version check, role-gated reports, cleaned and counted problems, phone state for the app and the agent, administrator-only diagnostics, validated releases, bounded storage, and no broken table breaks a report.');
} finally {
  await harness.close();
}
