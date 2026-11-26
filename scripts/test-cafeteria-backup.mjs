// Cafeteria backup and the 30-day clean-up of agent positions (phase 2).
//
//   - every table and column of the cafeteria data is either in the backup or deliberately left out, so a column added by a
//     later migration forces a decision (the test fails until it is classified)
//   - only the system administrator can download it
//   - passwords, card secrets, sign-in link hashes and agent coordinates are never in the file
//   - positions of finished stays are blanked after 30 days (the times stay) and a stay whose phone fell silent is closed first
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHarness, PASSWORD} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// ---- 1. Nothing is unclassified: the tables of the migrations against the lists in lib/fushati/backup.ts -----------------------------------
const reference = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) reference.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
const source = ts.transpileModule(fs.readFileSync('lib/fushati/backup.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const backupModule = {};
new Function('require', 'exports', source)((name) => (name === './core' ? {db: () => null, now: () => ''} : require(name)), backupModule);
const {BACKUP_TABLES} = backupModule;
const tables = reference.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fushati_%' ORDER BY name").all().map((row) => row.name);
for (const table of tables) {
  const classified = BACKUP_TABLES[table];
  assert.ok(classified, `${table} is new: add it to BACKUP_TABLES in lib/fushati/backup.ts (included, or left out with a reason)`);
  const columns = reference.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  for (const column of columns) {
    const inBackup = classified.include.includes(column), leftOut = classified.leftOut.includes(column);
    assert.ok(inBackup || leftOut, `${table}.${column} is new: add it to include (data) or leftOut (secret or position) in lib/fushati/backup.ts`);
    assert.ok(!(inBackup && leftOut), `${table}.${column} is both included and left out`);
  }
  for (const column of [...classified.include, ...classified.leftOut]) assert.ok(columns.includes(column), `${table}.${column} is listed but no longer exists`);
}
for (const table of Object.keys(BACKUP_TABLES)) assert.ok(tables.includes(table), `BACKUP_TABLES lists ${table}, which no longer exists`);
const SECRET_COLUMNS = {fushati_users: ['password_hash'], fushati_accounts: ['card_nonce'], fushati_invites: ['token_hash'], fushati_visits: ['arrive_lat', 'arrive_lng', 'last_lat', 'last_lng']};
for (const [table, columns] of Object.entries(SECRET_COLUMNS)) for (const column of columns) assert.ok(!BACKUP_TABLES[table].include.includes(column), `${table}.${column} is a secret or a position and must never be included`);

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const a = schoolByKey.a;
  const {cafe, assign} = await seedCafeterias({DB, seeded, schoolByKey});
  const read = async (response) => { const text = await response.text(); return {status: response.status, text, headers: response.headers, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  const first = (sql, ...params) => DB.prepare(sql).bind(...params).first();
  const admin1 = sessions.fushatiAdmin, agent1 = sessions.fushatiAgent, system = sessions.admin.default;
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.agent1, cafe.a, ['pos']);

  // ---- 2. Secrets that exist in the database, so the file can be searched for them -----------------------------------
  await DB.prepare("UPDATE fushati_accounts SET card_nonce='CARD-NONCE-SECRET-1' WHERE id='acct-a'").run();
  await DB.prepare("UPDATE fushati_cafeterias SET iban='SA0380000000608010167519',bank_name='Test Bank',latitude=24.7136,longitude=46.6753 WHERE id=?").bind(cafe.a).run();
  await DB.prepare('INSERT INTO fushati_invites(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind('invite-1', ids.agent1, 'TOKEN-HASH-SECRET-1', '2999-01-01T00:00:00.000Z', '2026-11-02T08:00:00.000Z').run();
  await DB.prepare('INSERT INTO fushati_visits(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,left_at,leave_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('visit-1', ids.agent1, cafe.a, '2026-11-10', '2026-11-10T04:00:00.000Z', 24.71234567, 46.67345678, 10, 20, 24.71234568, 46.67345679, 10, '2026-11-10T06:00:00.000Z', '2026-11-10T06:00:00.000Z', 'manual').run();
  const hashes = (await rows('SELECT password_hash h FROM fushati_users')).map((row) => row.h);
  assert.ok(hashes.length >= 5 && hashes.every((hash) => hash.length > 20), 'the test database has real password hashes to look for');

  // ---- 3. Who may download ------------------------------------------------------------------------------------------------
  for (const [who, cookie] of [['a cafeteria administrator', admin1], ['an agent', agent1], ['a parent', sessions.parent.a], ['a school manager', sessions.manager.a], ['a Student Affairs Agent', sessions.deputy.a], ['nobody signed in', '']]) {
    const refused = await serve(cookie, '/api/fushati/backup');
    assert.ok([401, 403].includes(refused.status), `${who} must not download the cafeteria backup (got ${refused.status})`);
    assert.ok(!(await refused.text()).includes('SA0380000000608010167519'), `${who} got no data`);
  }
  assert.equal((await rows("SELECT * FROM fushati_audit WHERE operation='backup-export'")).length, 0, 'refused requests are not exports');

  // ---- 4. What the system administrator gets ---------------------------------------------------------------------------------
  const backup = await read(await serve(system, '/api/fushati/backup'));
  assert.equal(backup.status, 200, backup.text.slice(0, 200));
  assert.match(backup.headers.get('content-disposition'), /khotwa-cafeteria-backup\.json/);
  assert.equal(backup.headers.get('cache-control'), 'private, no-store');
  assert.equal(backup.json.format, 'khotwa-cafeteria-v1');
  assert.ok(backup.json.notIncluded.agentPositions && backup.json.notIncluded.transferReceiptFiles, 'the file says what it does not contain');
  const keyOf = (table) => table.replace(/^fushati_/, '').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  for (const [table, def] of Object.entries(BACKUP_TABLES).filter(([, def]) => def.include.length)) {
    // The audit row that records this very export is written after the data is read.
    const expected = (await first(`SELECT COUNT(*) n FROM ${table}`)).n - (table === 'fushati_audit' ? 1 : 0);
    assert.equal(backup.json[keyOf(table)].length, expected, `${table}: every row is in the file`);
    assert.equal(backup.json.counts[table], expected, `${table}: the count in the file is right`);
  }
  assert.equal(backup.json.invites, undefined, 'sign-in links are not exported');
  const cafeteriaRow = backup.json.cafeterias.find((row) => row.id === cafe.a);
  assert.equal(cafeteriaRow.iban, 'SA0380000000608010167519', 'bank details are what a restore needs');
  assert.equal(cafeteriaRow.latitude, 24.7136, 'a cafeteria\'s own map point is not personal data');
  assert.ok(backup.json.users.length >= 5 && backup.json.assignments.some((row) => row.cafeteriaId === cafe.a), 'staff and assignments');
  assert.ok(backup.json.purchases.length >= 3 && backup.json.accounts.length >= 3 && backup.json.stockMovements !== undefined, 'money records and stock');

  // ---- 5. What it must not contain ---------------------------------------------------------------------------------------------
  for (const hash of hashes) assert.ok(!backup.text.includes(hash), 'a password hash is in the backup');
  assert.ok(!backup.text.includes('CARD-NONCE-SECRET-1'), 'a student card secret is in the backup');
  assert.ok(!backup.text.includes('TOKEN-HASH-SECRET-1'), 'a sign-in link hash is in the backup');
  assert.ok(!/24\.71234567|46\.67345678|24\.71234568|46\.67345679/.test(backup.text), 'an agent\'s position is in the backup');
  assert.ok(!/passwordHash|password_hash|cardNonce|tokenHash|"lat"|"lng"|arriveLat|lastLat/i.test(backup.text), 'a secret or position column name is in the backup');
  const visit = backup.json.visits.find((row) => row.id === 'visit-1');
  assert.deepEqual([visit.arriveDistanceM, visit.leaveReason, visit.leftAt], [20, 'manual', '2026-11-10T06:00:00.000Z'], 'the times and distance of a stay are kept');
  assert.equal((await rows("SELECT * FROM fushati_audit WHERE operation='backup-export'")).length, 1, 'the export is in the audit trail');

  // ---- 6. Agent positions are blanked after 30 days ------------------------------------------------------------------------
  // The agent checks in at the cafeteria; that is when the clean-up runs.
  const POINT = {lat: 24.7136, lng: 46.6753};
  await DB.prepare('UPDATE fushati_cafeterias SET latitude=?,longitude=?,arrival_radius_m=150 WHERE id=?').bind(POINT.lat, POINT.lng, cafe.a).run();
  const day = 86_400_000, nowMs = Date.now();
  const iso = (offsetDays, extraMinutes = 0) => new Date(nowMs - offsetDays * day + extraMinutes * 60_000).toISOString();
  const plant = (id, user, arrivedDays, leftDays, seenDays) => DB.prepare('INSERT INTO fushati_visits(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,left_at,leave_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, user, cafe.a, '2026-10-01', iso(arrivedDays), 24.7, 46.6, 10, 30, 24.7, 46.6, 10, iso(seenDays), leftDays === null ? null : iso(leftDays), leftDays === null ? null : 'manual').run();
  await plant('old-finished', ids.agent2, 45, 44.9, 44.9); // finished 44.9 days ago: positions go
  await plant('recent-finished', ids.agent2, 10, 9.9, 9.9); // finished 10 days ago: positions stay for now
  await plant('edge-finished', ids.agent2, 31, 30.1, 30.1); // just over 30 days
  await plant('forgotten-old', ids.admin2, 50, null, 49.9); // never closed, silent for 49.9 days
  await plant('forgotten-recent', ids.admin3, 2, null, 1.9); // never closed, silent for 1.9 days
  await DB.prepare('UPDATE fushati_visits SET day_key=? WHERE id=?').bind('2026-10-01', 'old-finished').run();
  const state = async (id) => first('SELECT arrive_lat,arrive_lng,last_lat,last_lng,left_at,leave_reason,arrived_at,arrive_distance_m,last_seen_at FROM fushati_visits WHERE id=?', id);
  assert.notEqual((await state('old-finished')).arrive_lat, null, 'before the clean-up the positions are there');

  const checkIn = await read(await serve(agent1, '/api/fushati/presence', {method: 'POST', body: {op: 'check-in', data: {cafeteriaId: cafe.a, ...POINT, accuracyM: 10}}}));
  assert.equal(checkIn.status, 200, checkIn.text);
  const oldFinished = await state('old-finished');
  assert.deepEqual([oldFinished.arrive_lat, oldFinished.arrive_lng, oldFinished.last_lat, oldFinished.last_lng], [null, null, null, null], 'a stay finished more than 30 days ago keeps no position');
  assert.deepEqual([oldFinished.leave_reason, oldFinished.arrive_distance_m], ['manual', 30], 'but keeps when it ended, why and how far he was on arrival');
  assert.ok(oldFinished.left_at && oldFinished.arrived_at, 'and its times');
  assert.notEqual((await state('recent-finished')).arrive_lat, null, 'a stay finished 10 days ago keeps its position');
  assert.equal((await state('edge-finished')).arrive_lat, null, '30.1 days is past the limit');
  const forgottenOld = await state('forgotten-old');
  assert.equal(forgottenOld.leave_reason, 'signal_lost', 'a stay whose phone went silent is closed at its last report');
  assert.equal(forgottenOld.left_at, forgottenOld.last_seen_at, 'at the last report, not now');
  assert.equal(forgottenOld.last_lat, null, 'and, being older than 30 days, loses its position at once');
  const forgottenRecent = await state('forgotten-recent');
  assert.deepEqual([forgottenRecent.leave_reason, forgottenRecent.left_at === forgottenRecent.last_seen_at, forgottenRecent.last_lat], ['signal_lost', true, 24.7], 'a recently forgotten stay is closed but keeps its position for the 30 days');
  const mine = await rows('SELECT * FROM fushati_visits WHERE user_id=? AND left_at IS NULL', ids.agent1);
  assert.equal(mine.length, 1, 'the agent who checked in has his open stay, with his position');
  assert.notEqual(mine[0].last_lat, null);
  assert.equal(mine[0].cafeteria_id, cafe.a);
  assert.equal((await rows('SELECT * FROM fushati_visits WHERE left_at IS NULL')).length, 1, 'no other stay is left open');

  // The map shows no position for a finished stay, whatever is stored.
  await assign(ids.agent2, cafe.a, ['pos', 'presence_view']);
  const map = await read(await serve(sessions.fushatiAgent2, `/api/fushati/presence?op=map&days=31`));
  assert.equal(map.status, 200, map.text.slice(0, 200));
  const finished = map.json.visits.filter((v) => v.leftAt);
  assert.ok(finished.length >= 3 && finished.every((v) => v.position === null), 'finished stays carry no position on the map');

  // A second clean-up changes nothing: it is safe to run again and again.
  const before = JSON.stringify(await rows('SELECT * FROM fushati_visits ORDER BY id'));
  await DB.prepare("UPDATE fushati_visits SET left_at=?,leave_reason='manual' WHERE user_id=? AND left_at IS NULL").bind(iso(0, -1), ids.agent1).run();
  await serve(agent1, '/api/fushati/presence', {method: 'POST', body: {op: 'check-in', data: {cafeteriaId: cafe.a, ...POINT, accuracyM: 10}}});
  const after = await rows('SELECT * FROM fushati_visits WHERE id IN (?,?,?,?,?)', 'old-finished', 'recent-finished', 'edge-finished', 'forgotten-old', 'forgotten-recent');
  assert.equal(JSON.stringify(after.map((row) => row.id)), JSON.stringify(JSON.parse(before).filter((row) => ['old-finished', 'recent-finished', 'edge-finished', 'forgotten-old', 'forgotten-recent'].includes(row.id)).map((row) => row.id)));
  assert.equal(JSON.stringify(JSON.parse(before).filter((row) => row.id === 'old-finished')), JSON.stringify(after.filter((row) => row.id === 'old-finished')), 'running the clean-up again changes nothing already cleaned');

  console.log('Cafeteria backup and retention passed: every cafeteria table and column is classified; only the system administrator downloads; no password, card secret, sign-in link or agent position is in the file; positions of stays older than 30 days are blanked and forgotten stays closed.');
} finally {
  await harness.close();
}
