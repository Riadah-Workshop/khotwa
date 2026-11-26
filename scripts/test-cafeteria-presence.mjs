// Cafeteria map, arrival and departure (Fushati phase 3), through the real gateway and route handlers on a real database.
//
//   - only the system administrator sets where a cafeteria is
//   - an agent is recorded as arrived only when his reported position is at his own cafeteria
//   - an agent's position is stored only while he is checked in, and shown only to people with "presence_view"
//     in that cafeteria: never to another cafeteria's administrator, never to an agent without the permission
//   - when a phone goes quiet the stay ends at its last report; an administrator can end a forgotten stay
import realAssert from 'node:assert/strict';
import {assertOnlySchool as realOnly, createHarness, PASSWORD} from './support/school-harness.mjs';
const caught = [];
const soft = (fn) => (...args) => { try { return fn(...args); } catch (error) { caught.push(String(error.message).split('\n')[0].slice(0, 220)); } };
const assert = Object.assign(soft(realAssert), {ok: soft(realAssert.ok), equal: soft(realAssert.equal), deepEqual: soft(realAssert.deepEqual)});
const assertOnlySchool = soft(realOnly);
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const a = schoolByKey.a, b = schoolByKey.b;
  const {cafe, assign} = await seedCafeterias({DB, seeded, schoolByKey});

  const get = async (cookie, query) => { const response = await serve(cookie, `/api/fushati/presence?${query}`); const text = await response.text(); return {status: response.status, text, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const post = async (cookie, op, data) => { const response = await serve(cookie, '/api/fushati/presence', {method: 'POST', body: {op, data}}); const text = await response.text(); return {status: response.status, text, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const main = async (cookie, op, data) => { const response = await serve(cookie, '/api/fushati', {method: 'POST', body: {op, data}}); const text = await response.text(); return {status: response.status, text, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  const first = (sql, ...params) => DB.prepare(sql).bind(...params).first();
  const openRows = (userId) => rows('SELECT * FROM fushati_visits WHERE user_id=? AND left_at IS NULL', userId);
  const allRows = (userId) => rows('SELECT * FROM fushati_visits WHERE user_id=? ORDER BY arrived_at, rowid', userId);
  const sorted = (list) => [...list].sort();

  // Where things are. 111,195 m per degree of latitude.
  const POINT = {a: {lat: 24.7136, lng: 46.6753}, b: {lat: 21.4858, lng: 39.1925}};
  const north = (point, metres) => ({lat: point.lat + metres / 111195, lng: point.lng});
  const fix = (point, accuracyM = 15) => ({...point, accuracyM});

  const admin1 = sessions.fushatiAdmin, admin2 = sessions.fushatiAdmin2, agent2 = sessions.fushatiAgent2, system = sessions.admin.default;
  // Editing an agent signs him out (his session version changes), so agent1's cookie is replaced after each such edit.
  let agent1 = sessions.fushatiAgent;
  const signInAgent1 = async () => { agent1 = await harness.login('/fushati-agent-login', {identifier: '0512345678', password: PASSWORD}); };
  // Who works where. agent2 is a supervisor who may see attendance in cafeteria a only.
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.admin2, cafe.b, ['*']);
  await assign(ids.agent1, cafe.a, ['pos', 'menu_propose']);
  await assign(ids.agent2, cafe.a, ['pos', 'presence_view']);
  await assign(ids.agent2, cafe.b, ['pos']);
  await assign(ids.agent2, cafe.default, ['pos']);

  // ---- 1. Roles -------------------------------------------------------------------------------------------------
  assert.equal((await first('SELECT arrival_radius_m r,latitude lat FROM fushati_cafeterias WHERE id=?', cafe.a)).r, 150, 'the default arrival radius is 150 m');
  assert.equal((await first('SELECT latitude lat FROM fushati_cafeterias WHERE id=?', cafe.a)).lat, null, 'a cafeteria starts without a location');
  assert.equal((await get(sessions.parent.a, 'op=map')).status, 403, 'a parent is refused');
  assert.equal((await post(sessions.parent.a, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'a parent cannot check in');
  assert.equal((await get(sessions.manager.a, 'op=map')).status, 403, 'a school manager is refused');
  assert.equal((await get(admin1, 'op=status')).status, 403, 'only an agent has an arrival status');
  assert.equal((await get(agent1, 'op=nonsense')).status, 400);
  assert.equal((await post(admin1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'a cafeteria administrator does not check in');
  assert.equal((await post(system, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'the system administrator does not check in');
  assert.equal((await post(agent1, 'nonsense', {})).status, 400);

  // ---- 2. Only the system administrator says where a cafeteria is ---------------------------------------------
  for (const [who, cookie] of [['a cafeteria administrator', admin1], ['an agent', agent1], ['a supervisor', agent2]]) {
    const refused = await post(cookie, 'set-location', {id: cafe.a, latitude: 10, longitude: 10});
    assert.equal(refused.status, 403, `${who} must not set a location`);
  }
  assert.equal((await first('SELECT latitude lat FROM fushati_cafeterias WHERE id=?', cafe.a)).lat, null, 'a refused request changed nothing');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: 91, longitude: 10})).status, 400, 'latitude out of range');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: 10, longitude: 181})).status, 400, 'longitude out of range');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: 10, longitude: null})).status, 400, 'half a point');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: 10, longitude: 10, radiusM: 5})).status, 400, 'radius too small');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: 10, longitude: 10, radiusM: 5000})).status, 400, 'radius too large');
  assert.equal((await post(system, 'set-location', {id: '99999999-0000-4000-8000-000000000001', latitude: 10, longitude: 10})).status, 404, 'unknown cafeteria');
  assert.equal((await post(system, 'set-location', {id: cafe.a, latitude: POINT.a.lat, longitude: POINT.a.lng, radiusM: 150})).status, 200);
  assert.equal((await post(system, 'set-location', {id: cafe.b, latitude: POINT.b.lat, longitude: POINT.b.lng, radiusM: 100})).status, 200);
  const stored = await first('SELECT latitude lat,longitude lng,arrival_radius_m r FROM fushati_cafeterias WHERE id=?', cafe.b);
  assert.deepEqual([stored.lat, stored.lng, stored.r], [POINT.b.lat, POINT.b.lng, 100], 'the system administrator set the point and radius');
  assert.equal((await first('SELECT latitude lat FROM fushati_cafeterias WHERE id=?', cafe.default)).lat, null, 'the third cafeteria still has no location');

  // ---- 3. Arrival is recorded only at your own cafeteria -------------------------------------------------------
  const tooFar = await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix({lat: 24.8, lng: 46.8})});
  assert.equal(tooFar.status, 422, 'far from the cafeteria');
  assert.equal(tooFar.json.code, 'too_far');
  assert.ok(tooFar.json.distanceM > 10000 && tooFar.json.radiusM === 150, 'the refusal says how far he is and what is required');
  assert.equal((await allRows(ids.agent1)).length, 0, 'a refused check-in leaves no record');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.b, ...fix(POINT.b)})).status, 403, 'standing at cafeteria b does not check an agent of cafeteria a in there');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.default, ...fix(POINT.a)})).status, 403, 'a cafeteria he is not assigned to');
  assert.equal((await allRows(ids.agent1)).length, 0, 'still no record');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: 'not-a-uuid', ...fix(POINT.a)})).status, 400);
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, lat: 200, lng: 10, accuracyM: 5})).status, 400, 'impossible latitude');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, lat: POINT.a.lat, lng: POINT.a.lng})).status, 400, 'a position without accuracy');
  const noLocation = await post(agent2, 'check-in', {cafeteriaId: cafe.default, ...fix(POINT.a)});
  assert.equal(noLocation.status, 409, 'a cafeteria whose location was never set cannot record arrivals');
  assert.equal(noLocation.json.code, 'no_location');

  const arrive = await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(north(POINT.a, 80), 20)});
  assert.equal(arrive.status, 200, arrive.text);
  assert.equal(arrive.json.already, false);
  let open = await openRows(ids.agent1);
  assert.equal(open.length, 1, 'one open stay');
  assert.equal(open[0].cafeteria_id, cafe.a);
  assert.ok(open[0].arrive_distance_m >= 78 && open[0].arrive_distance_m <= 82, `arrival distance recorded (${open[0].arrive_distance_m})`);
  assert.equal(open[0].left_at, null);
  const again = await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(north(POINT.a, 70), 20)});
  assert.equal(again.status, 200);
  assert.equal(again.json.already, true, 'checking in twice is the same stay');
  assert.equal((await allRows(ids.agent1)).length, 1, 'no duplicate stay');

  // The phone's own uncertainty counts for up to 100 m, no more.
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.a, ...fix(north(POINT.a, 300), 50)})).status, 422, '300 m away, 50 m unsure: not there');
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.a, ...fix(north(POINT.a, 220), 100)})).status, 200, '220 m away, 100 m unsure: could be inside');
  // Arriving at another cafeteria ends the stay at the previous one in the same step.
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.b, ...fix(north(POINT.b, 30))})).status, 200);
  const agent2Rows = await allRows(ids.agent2);
  assert.equal(agent2Rows.length, 2);
  assert.equal(agent2Rows.filter((r) => r.left_at === null).length, 1, 'never two open stays for one agent');
  assert.deepEqual(agent2Rows.map((r) => [r.cafeteria_id === cafe.a ? 'a' : 'b', r.leave_reason]), [['a', 'moved'], ['b', null]], 'the stay at a ended as "moved"');

  // A disabled cafeteria cannot record arrivals, and an agent's status leaves it out.
  await DB.prepare('UPDATE fushati_cafeterias SET latitude=?,longitude=?,active=0 WHERE id=?').bind(POINT.a.lat, POINT.a.lng, cafe.default).run();
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.default, ...fix(POINT.a)})).status, 403, 'a disabled cafeteria');
  assert.deepEqual(sorted((await get(agent2, 'op=status')).json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b]), 'a disabled cafeteria is not offered');
  await DB.prepare('UPDATE fushati_cafeterias SET latitude=NULL,longitude=NULL,active=1 WHERE id=?').bind(cafe.default).run();

  // ---- 4. Reporting position while checked in -----------------------------------------------------------------
  const quick = await post(agent1, 'ping', fix(north(POINT.a, 10)));
  assert.equal(quick.status, 200);
  assert.ok(quick.json.checkedIn);
  await DB.prepare("UPDATE fushati_visits SET last_seen_at=? WHERE user_id=? AND left_at IS NULL").bind(new Date(Date.now() - 60_000).toISOString(), ids.agent1).run();
  assert.equal((await post(agent1, 'ping', fix(north(POINT.a, 40), 8))).status, 200);
  open = await openRows(ids.agent1);
  assert.ok(Math.abs(open[0].last_lat - north(POINT.a, 40).lat) < 1e-9, 'the latest position is stored');
  assert.ok(Date.now() - Date.parse(open[0].last_seen_at) < 15_000, 'and when it was seen');
  assert.equal((await post(agent1, 'ping', {lat: 1, lng: 1})).status, 400, 'a report without accuracy');
  assert.equal((await post(agent2, 'ping', fix(POINT.b))).status, 200, 'agent2 is checked in at b, so his report is accepted');

  // ---- 5. Who sees whom ----------------------------------------------------------------------------------------
  const mapOne = await get(admin1, 'op=map');
  assert.equal(mapOne.status, 200, mapOne.text);
  assertOnlySchool(mapOne.text, a, 'cafeteria administrator (a) map');
  assert.deepEqual(mapOne.json.cafeterias.map((c) => c.id), [cafe.a], 'an administrator sees only his own cafeteria');
  assert.equal(mapOne.json.canSetLocation, false);
  assert.equal(mapOne.json.cafeterias[0].canManage, true);
  assert.deepEqual(Object.keys(mapOne.json.cafeterias[0]).sort(), ['active', 'alias', 'canManage', 'id', 'latitude', 'longitude', 'name', 'radiusM', 'schoolName'], 'a cafeteria carries no bank or school data');
  const live = mapOne.json.visits.find((v) => v.userId === ids.agent1 && !v.leftAt);
  assert.ok(live, 'agent1 is shown as present');
  assert.equal(live.state, 'live');
  assert.equal(live.phone, '+966512345678', 'the phone number falls back to his login number');
  assert.ok(live.position && Math.abs(live.position.lat - north(POINT.a, 40).lat) < 1e-6, 'a live agent has a position');
  assert.deepEqual(Object.keys(live).sort(), ['arriveDistanceM', 'arrivedAt', 'cafeteriaId', 'durationMin', 'id', 'lastSeenAt', 'leaveReason', 'leftAt', 'name', 'phone', 'position', 'state', 'userId'], 'a stay carries no more than this');
  const movedAway = mapOne.json.visits.find((v) => v.userId === ids.agent2);
  assert.ok(movedAway && movedAway.leftAt && movedAway.leaveReason === 'moved', 'the earlier stay of agent2 at cafeteria a is in the log');
  assert.equal(movedAway.position, null, 'a finished stay carries no position');
  assert.ok(mapOne.json.visits.every((v) => v.cafeteriaId === cafe.a), 'nothing from cafeteria b');
  assert.ok(!mapOne.json.visits.some((v) => v.userId === ids.agent2 && !v.leftAt), 'where agent2 is now (cafeteria b) is not shown to the administrator of a');

  const mapTwo = await get(admin2, 'op=map');
  assertOnlySchool(mapTwo.text, b, 'cafeteria administrator (b) map');
  assert.deepEqual(mapTwo.json.cafeterias.map((c) => c.id), [cafe.b]);
  assert.deepEqual(mapTwo.json.visits.map((v) => [v.userId, v.leftAt]), [[ids.agent2, null]], 'administrator b sees only agent2, at b');
  assert.ok(!mapTwo.text.includes(ids.agent1) && !mapTwo.text.includes('+966512345678'), 'administrator b learns nothing about agent1');

  const mapAgent = await get(agent1, 'op=map');
  assert.equal(mapAgent.status, 200);
  assert.deepEqual([mapAgent.json.cafeterias, mapAgent.json.visits], [[], []], 'an agent without presence_view sees nothing, not even himself');
  const mapSupervisor = await get(agent2, 'op=map');
  assertOnlySchool(mapSupervisor.text, a, 'supervisor map');
  assert.deepEqual(mapSupervisor.json.cafeterias.map((c) => c.id), [cafe.a], 'presence_view in a does not extend to b, where he also works');
  assert.equal(mapSupervisor.json.cafeterias[0].canManage, false);
  assert.ok(mapSupervisor.json.visits.some((v) => v.userId === ids.agent1 && !v.leftAt), 'the supervisor sees who is at a');
  const mapSystem = await get(system, 'op=map');
  assert.deepEqual(sorted(mapSystem.json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b, cafe.default]), 'the system administrator sees every cafeteria');
  assert.equal(mapSystem.json.canSetLocation, true);

  // Granting the permission is the cafeteria administrator's call, per cafeteria.
  const grant = await main(admin1, 'edit-user', {id: ids.agent1, permissions: ['pos', 'menu_propose', 'presence_view']});
  assert.equal(grant.status, 200, grant.text);
  await signInAgent1();
  const granted = await get(agent1, 'op=map');
  assert.deepEqual(granted.json.cafeterias.map((c) => c.id), [cafe.a], 'after the grant agent1 sees cafeteria a');
  assert.equal((await main(admin2, 'edit-user', {id: ids.agent1, permissions: ['pos', 'presence_view']})).status, 404, 'another cafeteria administrator cannot change it');
  const revoke = await main(admin1, 'edit-user', {id: ids.agent1, permissions: ['pos', 'menu_propose']});
  assert.equal(revoke.status, 200, revoke.text);
  await signInAgent1();
  assert.deepEqual((await get(agent1, 'op=map')).json.cafeterias, [], 'and the revoke takes it away again');

  // ---- 6. The phone number shown next to the name ------------------------------------------------------------------
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent1, phone: 'abc'})).status, 400, 'not a phone number');
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent2, phone: '0555123456'})).status, 409, 'agent2 also works elsewhere: his details are not this administrator\'s to change');
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent1, phone: '0555123456'})).status, 200);
  await signInAgent1();
  assert.equal((await first('SELECT phone FROM fushati_users WHERE id=?', ids.agent1)).phone, '+966555123456', 'stored in international form');
  assert.equal((await get(admin1, 'op=map')).json.visits.find((v) => v.userId === ids.agent1 && !v.leftAt).phone, '+966555123456', 'the contact phone wins over the login number');
  const created = await main(admin1, 'create-user', {fullName: 'Agent With Phone', identifier: '0512345690', phone: '0555000111', role: 'fushati_agent', cafeteriaIds: [cafe.a], permissions: ['pos']});
  assert.equal(created.status, 200, created.text);
  assert.equal((await first('SELECT phone FROM fushati_users WHERE id=?', created.json.id)).phone, '+966555000111', 'a new agent keeps the phone he was created with');
  assert.equal((await main(admin1, 'create-user', {fullName: 'Bad Phone', identifier: '0512345691', phone: '12', role: 'fushati_agent', cafeteriaIds: [cafe.a], permissions: ['pos']})).status, 400, 'a malformed phone is refused');

  // ---- 7. Departure ------------------------------------------------------------------------------------------------
  const left = await post(agent1, 'check-out', fix(north(POINT.a, 400), 10));
  assert.equal(left.status, 200, left.text);
  assert.equal(left.json.checkedOut, true);
  assert.equal(left.json.reason, 'left_area', 'a position far outside is recorded as leaving the area');
  assert.equal((await openRows(ids.agent1)).length, 0);
  const second = await post(agent1, 'check-out', {});
  assert.equal(second.status, 200);
  assert.equal(second.json.checkedOut, false, 'checking out when not checked in changes nothing');
  assert.equal((await post(agent1, 'ping', fix(POINT.a))).status, 409, 'cannot report a position without a stay');
  assert.equal((await openRows(ids.agent1)).length, 0, 'and a refused report creates no stay');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  const manual = await post(agent1, 'check-out', undefined);
  assert.equal(manual.json.reason, 'manual', 'no position: a manual check-out');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  assert.equal((await post(agent1, 'check-out', fix(north(POINT.a, 20)))).json.reason, 'manual', 'a position still inside: manual, not "left the area"');
  const history = await allRows(ids.agent1);
  assert.deepEqual(history.map((r) => r.leave_reason), ['left_area', 'manual', 'manual']);
  assert.ok(history.every((r) => r.left_at && r.left_at >= r.arrived_at), 'every stay ends after it starts');

  // ---- 8. A phone that goes quiet --------------------------------------------------------------------------------
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  const silentSince = new Date(Date.now() - 45 * 60_000).toISOString();
  await DB.prepare('UPDATE fushati_visits SET last_seen_at=? WHERE user_id=? AND left_at IS NULL').bind(silentSince, ids.agent1).run();
  const lostMap = await get(admin1, 'op=map');
  const lost = lostMap.json.visits.find((v) => v.userId === ids.agent1 && v.lastSeenAt === silentSince);
  assert.ok(lost, 'the quiet stay is still listed');
  assert.equal(lost.state, 'lost');
  assert.equal(lost.leftAt, silentSince, 'it ended when the phone last reported, not now');
  assert.equal(lost.leaveReason, 'signal_lost');
  assert.equal(lost.position, null, 'no position is shown for it');
  assert.equal(lost.durationMin <= 1, true, 'and it did not keep counting');
  const status = await get(agent1, 'op=status');
  assert.equal(status.json.visit, null, 'the agent is told he is no longer checked in');
  const closedRow = await first("SELECT left_at,leave_reason FROM fushati_visits WHERE user_id=? AND last_seen_at=?", ids.agent1, silentSince);
  assert.deepEqual([closedRow.left_at, closedRow.leave_reason], [silentSince, 'signal_lost'], 'and the record was closed at the last report');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200, 'he can check in again');

  // ---- 9. An administrator ends a stay that was forgotten -----------------------------------------------------------
  const stay = (await openRows(ids.agent1))[0];
  assert.equal((await post(admin2, 'force-checkout', {visitId: stay.id})).status, 404, 'another cafeteria\'s administrator cannot see it exists');
  assert.equal((await post(agent2, 'force-checkout', {visitId: stay.id})).status, 403, 'a supervisor who can only view cannot end it');
  assert.equal((await post(agent1, 'force-checkout', {visitId: stay.id})).status, 403, 'the agent himself uses check-out');
  assert.equal((await post(admin1, 'force-checkout', {visitId: '99999999-0000-4000-8000-000000000002'})).status, 404, 'unknown stay');
  assert.equal((await openRows(ids.agent1)).length, 1, 'every refusal left the stay open');
  const ended = await post(admin1, 'force-checkout', {visitId: stay.id});
  assert.equal(ended.status, 200);
  assert.equal(ended.json.closed, true);
  assert.equal((await first('SELECT leave_reason r FROM fushati_visits WHERE id=?', stay.id)).r, 'closed_by_admin');
  assert.equal((await post(admin1, 'force-checkout', {visitId: stay.id})).json.closed, false, 'ending it twice changes nothing');
  assert.ok((await first("SELECT 1 AS found FROM fushati_audit WHERE operation='force-checkout' AND target_id=?", stay.id)), 'and it is in the audit trail');

  // ---- 10. What an agent is told about his own cafeterias -------------------------------------------------------
  const own = await get(agent1, 'op=status');
  assert.deepEqual(own.json.cafeterias.map((c) => c.id), [cafe.a], 'agent1 is offered only his cafeteria');
  assert.deepEqual(Object.keys(own.json.cafeterias[0]).sort(), ['alias', 'id', 'latitude', 'longitude', 'name', 'radiusM'], 'with its point and radius only');
  assert.ok(own.json.recent.length >= 4 && own.json.recent.length <= 10, 'his own recent stays');
  const mine = await allRows(ids.agent1);
  assert.ok(own.json.recent.every((r) => mine.some((h) => h.id === r.id)), 'and no one else\'s');
  assertOnlySchool(own.text, a, 'agent status');
  assert.deepEqual(sorted((await get(agent2, 'op=status')).json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b, cafe.default]), 'agent2 works in three cafeterias');
  assert.equal((await openRows(ids.agent2)).length, 1);

  // ---- 11. The permission exists where administrators hand permissions out -----------------------------------------
  const boots = await serve(admin1, '/api/fushati?op=bootstrap');
  const bootJson = await boots.json();
  assert.ok(bootJson.permissions[cafe.a].includes('presence_view'), 'an administrator has presence_view in his cafeteria');
  assert.ok(bootJson.cafeterias.every((c) => 'latitude' in c && 'arrival_radius_m' in c));
  const supervisorBoot = await (await serve(agent2, '/api/fushati?op=bootstrap')).json();
  assert.ok(supervisorBoot.permissions[cafe.a].includes('presence_view') && !supervisorBoot.permissions[cafe.b].includes('presence_view'), 'per cafeteria');

  console.log('Cafeteria presence passed: location set by the system administrator only; arrival recorded only at an assigned cafeteria within its radius; one open stay per agent; positions stored only while checked in; shown only with presence_view in that cafeteria; quiet phones end at their last report; administrators can end forgotten stays; phone numbers; no leaks between cafeterias or schools.');
} finally {
  console.log('CAUGHT ' + caught.length + '\n' + caught.map((m, i) => (i + 1) + '. ' + m).join('\n'));
  if (caught.length) process.exitCode = 1;
  await harness.close();
}
