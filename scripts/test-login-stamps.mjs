// Sign-in time stamps: every successful sign-in, for every role, leaves one row with the time and nothing about
// where the person is. A failed sign-in leaves nothing. A broken stamp table never stops a sign-in. Only the
// system administrator can read the log, and a parent's number is masked in it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness, PASSWORD} from './support/school-harness.mjs';
import {channelOf, maskPhone, recentStamps, recordLoginStamp, stampDay, STAMP_RETENTION_DAYS} from '../lib/login-stamps.ts';

// ---- the app announces itself in its user-agent -----------------------------------------------------------------------
assert.deepEqual(channelOf('Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile KhotwaApp/1.2.0 (android)'), {channel: 'android', version: '1.2.0'});
assert.deepEqual(channelOf('Mozilla/5.0 (iPhone) AppleWebKit KhotwaApp/2.10.3.1 (ios)'), {channel: 'ios', version: '2.10.3.1'});
assert.deepEqual(channelOf('Mozilla/5.0 (Windows NT 10.0) Chrome/126'), {channel: 'web', version: ''}, 'a browser is the website');
assert.deepEqual(channelOf('KhotwaApp/1.0.0 (windows)'), {channel: 'web', version: ''}, 'an unknown platform is not trusted');
assert.deepEqual(channelOf('KhotwaApp/<script> (ios)'), {channel: 'web', version: ''}, 'a version that is not a version is not stored');
assert.deepEqual(channelOf(null), {channel: 'web', version: ''});
assert.equal(maskPhone('parent:+966512345678'), '+96651•••5678');
assert.equal(maskPhone('+966512'), '+966512', 'a short value is not cut');
assert.equal(stampDay(new Date('2026-11-27T22:30:00.000Z')), '2026-11-28', 'the day is the Saudi day (UTC+3), not the UTC day');

const harness = await createHarness();
try {
  const {DB, env, gateway, form, sessions, fushatiIds: ids} = harness;
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;

  // ---- 1. The sign-ins the harness already made left stamps -----------------------------------------------------------
  const byRole = Object.fromEntries((await rows('SELECT role,COUNT(*) AS n FROM khotwa_login_stamps GROUP BY role')).map((r) => [r.role, r.n]));
  for (const role of ['deputy', 'manager', 'main_admin', 'parent', 'fushati_admin', 'fushati_agent']) assert.ok(byRole[role] >= 1, `a ${role} sign-in left a stamp (${JSON.stringify(byRole)})`);
  const columns = (await rows('PRAGMA table_info(khotwa_login_stamps)')).map((c) => c.name).sort();
  assert.deepEqual(columns, ['account_key', 'app_version', 'channel', 'day_key', 'id', 'role', 'school_id', 'signed_in_at'], 'a stamp holds nothing but who, when and from where: no position, no address, no device');
  const all = await rows('SELECT * FROM khotwa_login_stamps');
  assert.ok(all.every((r) => r.channel === 'web' && r.app_version === ''), 'the harness signs in like a browser');
  assert.ok(all.every((r) => /^\d{4}-\d\d-\d\d$/.test(r.day_key) && !Number.isNaN(Date.parse(r.signed_in_at))));
  const agentStamp = all.find((r) => r.account_key === ids.agent1);
  assert.equal(agentStamp.role, 'fushati_agent', 'the cafeteria agent is stamped like everybody else');
  assert.equal(agentStamp.school_id, '', 'cafeteria accounts belong to no school');
  assert.ok(all.some((r) => r.role === 'deputy' && r.school_id), 'a school account carries its school');
  const migration = fs.readFileSync('drizzle/0033_login_stamps_and_arrival_alerts.sql', 'utf8');
  assert.ok(!/\b(lat|lng|latitude|longitude|ip|ip_address|user_agent|device)\b/i.test(migration.split('presence_email')[0].replace(/--.*$/gm, '')), 'the migration defines no location, address or device column');

  // ---- 2. The app's tag is recorded ----------------------------------------------------------------------------------
  const ORIGIN = env.KHOTWA_PUBLIC_ORIGINS;
  const appRequest = new Request(ORIGIN + '/fushati-agent-login', {method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) KhotwaApp/1.4.2 (android)'}, body: new URLSearchParams({identifier: '0512345678', password: PASSWORD}).toString()});
  const viaApp = await gateway.handleKhotwaAuthentication(appRequest, env);
  assert.equal(viaApp.response?.status, 303, 'sign-in from the app works');
  const appRow = (await rows("SELECT * FROM khotwa_login_stamps WHERE channel='android'"))[0];
  assert.deepEqual([appRow.role, appRow.account_key, appRow.app_version], ['fushati_agent', ids.agent1, '1.4.2']);

  // ---- 3. A failed sign-in leaves nothing -----------------------------------------------------------------------------
  const before = (await rows('SELECT COUNT(*) AS n FROM khotwa_login_stamps'))[0].n;
  const wrong = await gateway.handleKhotwaAuthentication(form('/fushati-agent-login', {identifier: '0512345678', password: 'not the password'}), env);
  assert.notEqual(wrong.response?.status, 303, 'a wrong password is not signed in');
  const unknown = await gateway.handleKhotwaAuthentication(form('/parent-login', {phone: '0500000000', password: PASSWORD}), env);
  assert.notEqual(unknown.response?.status, 303);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM khotwa_login_stamps'))[0].n, before, 'failed attempts are not stamped');

  // ---- 4. A broken stamp table never stops a sign-in -----------------------------------------------------------------
  await DB.prepare('ALTER TABLE khotwa_login_stamps RENAME TO khotwa_login_stamps_off').run();
  const stillIn = await gateway.handleKhotwaAuthentication(form('/fushati-agent-login', {identifier: '0512345678', password: PASSWORD}), env);
  assert.equal(stillIn.response?.status, 303, 'with the stamp table missing the person still signs in');
  assert.equal(await recordLoginStamp(DB, {uid: 'x', role: 'deputy', sid: 's'}, ''), false, 'and the writer reports the failure instead of throwing');
  await DB.prepare('ALTER TABLE khotwa_login_stamps_off RENAME TO khotwa_login_stamps').run();

  // ---- 5. Unknown roles and empty ids are refused by the writer ------------------------------------------------------
  assert.equal(await recordLoginStamp(DB, {uid: 'x', role: 'visitor', sid: 's'}, ''), false);
  assert.equal(await recordLoginStamp(DB, {uid: '', role: 'deputy', sid: 's'}, ''), false);

  // ---- 6. Old stamps are removed a few at a time as new ones arrive ----------------------------------------------------
  const old = new Date(Date.now() - (STAMP_RETENTION_DAYS + 5) * 86_400_000).toISOString();
  for (let i = 0; i < 3; i++) await DB.prepare("INSERT INTO khotwa_login_stamps(id,role,account_key,school_id,signed_in_at,day_key,channel,app_version) VALUES(?,?,?,?,?,?,?,?)").bind(`old-${i}`, 'deputy', 'old', '', old, '2026-01-01', 'web', '').run();
  assert.equal(await recordLoginStamp(DB, {uid: 'fresh', role: 'deputy', sid: 'default'}, ''), true);
  assert.equal((await rows("SELECT COUNT(*) AS n FROM khotwa_login_stamps WHERE id LIKE 'old-%'"))[0].n, 0, `stamps older than ${STAMP_RETENTION_DAYS} days are gone`);
  assert.ok((await rows("SELECT COUNT(*) AS n FROM khotwa_login_stamps WHERE account_key='fresh'"))[0].n === 1, 'and the new one stayed');

  // ---- 7. The log shows names, masks parents, and says which channel -----------------------------------------------------
  const view = await recentStamps(DB, {days: 30, limit: 500});
  assert.ok(view.length >= 8);
  const agentView = view.find((v) => v.role === 'fushati_agent');
  assert.ok(agentView.name, 'a cafeteria agent is listed by name');
  const parentView = view.find((v) => v.role === 'parent');
  assert.match(parentView.name, /•••\d{4}$/, 'a parent is listed by a masked number');
  assert.ok(!JSON.stringify(view).includes('parent:') && Object.values(harness.phones).every((phone) => !JSON.stringify(view).includes(phone)), 'and the full number is not in the log');
  assert.ok(view.find((v) => v.role === 'deputy' && v.school), 'a school account shows its school');
  assert.ok(view.some((v) => v.channel === 'android' && v.appVersion === '1.4.2'));
  assert.ok(view.every((v, i) => i === 0 || view[i - 1].at >= v.at), 'newest first');
  assert.ok((await recentStamps(DB, {role: 'parent'})).every((v) => v.role === 'parent'), 'filtered by role');
  assert.equal((await recentStamps(DB, {role: 'nonsense'})).length, view.length > 200 ? 200 : (await recentStamps(DB, {})).length, 'an unknown role filter is ignored');

  console.log('Login stamps passed: every role is stamped with the time and nothing else; the app is recognised; failed sign-ins and a broken table change nothing; old stamps age out; parents are masked.');
} finally {
  await harness.close();
}
