// Cafeteria map and AUTOMATIC arrival and departure (Fushati), through the real gateway and route handlers on a real database.
//
//   - only the system administrator sets where a cafeteria is
//   - the agent's phone reports "arrived" and "left" by itself; an arrival is accepted only at his own cafeteria
//   - no position is ever stored for a new stay (the columns stay empty)
//   - arrivals and departures are for administrators only: an agent sees nothing of the feature, whatever he was granted
//   - an administrator sees only his own cafeterias, gets a feed of arrivals and departures, may ask for e-mail
//   - a stay nobody ended is "not confirmed" and is closed without inventing a time
import assert from 'node:assert/strict';
import {assertOnlySchool, createHarness, PASSWORD} from './support/school-harness.mjs';
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
  // Who works where. agent2 once had presence_view stored (before arrivals became administrator-only): it must do nothing.
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
  assert.equal((await post(sessions.parent.a, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'a parent cannot report an arrival');
  assert.equal((await get(sessions.manager.a, 'op=map')).status, 403, 'a school manager is refused');
  assert.equal((await get(admin1, 'op=status')).status, 403, 'only an agent has an arrival status');
  assert.equal((await get(agent1, 'op=nonsense')).status, 403, 'an agent gets nothing but his own status');
  assert.equal((await get(admin1, 'op=nonsense')).status, 400);
  assert.equal((await post(admin1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'a cafeteria administrator is not tracked');
  assert.equal((await post(system, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 403, 'the system administrator is not tracked');
  assert.equal((await post(agent1, 'nonsense', {})).status, 400);
  assert.equal((await post(agent1, 'ping', fix(POINT.a))).status, 400, 'there is no position reporting any more');

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
  assert.equal((await allRows(ids.agent1)).length, 0, 'a refused arrival leaves no record');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.b, ...fix(POINT.b)})).status, 403, 'standing at cafeteria b does not record an agent of cafeteria a there');
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
  assert.deepEqual(Object.keys(arrive.json).sort(), ['already', 'ok'], 'the phone is told nothing about the record');
  let open = await openRows(ids.agent1);
  assert.equal(open.length, 1, 'one open stay');
  assert.equal(open[0].cafeteria_id, cafe.a);
  assert.ok(open[0].arrive_distance_m >= 78 && open[0].arrive_distance_m <= 82, `arrival distance recorded (${open[0].arrive_distance_m})`);
  assert.deepEqual([open[0].arrive_lat, open[0].arrive_lng, open[0].last_lat, open[0].last_lng], [null, null, null, null], 'the agent\'s position is NOT stored');
  assert.equal(open[0].left_at, null);
  const again = await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(north(POINT.a, 70), 20)});
  assert.equal(again.status, 200);
  assert.equal(again.json.already, true, 'reporting the arrival twice is the same stay');
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

  // A phone that was offline reports late, with the time it saw the event.
  const late = new Date(Date.now() - 40 * 60_000).toISOString();
  await DB.prepare('UPDATE fushati_visits SET arrived_at=? WHERE user_id=? AND left_at IS NULL').bind(new Date(Date.now() - 2 * 3_600_000).toISOString(), ids.agent2).run();
  assert.equal((await post(agent2, 'check-out', {at: late})).status, 200);
  const lateRow = (await allRows(ids.agent2)).find((r) => r.cafeteria_id === cafe.b);
  assert.equal(lateRow.left_at, late, 'a departure reported 40 minutes late is recorded at the time the phone saw it');
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.b, at: new Date(Date.now() + 3_600_000).toISOString(), ...fix(POINT.b)})).status, 200);
  const future = (await openRows(ids.agent2))[0];
  assert.ok(Date.parse(future.arrived_at) <= Date.now() + 1000, 'a time from the future is not believed: the arrival is stamped now');
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.b, at: 'yesterday', ...fix(POINT.b)})).status, 200, 'an unreadable time is ignored, not an error');
  assert.equal((await post(agent2, 'check-out', {})).status, 200);

  // A disabled cafeteria cannot record arrivals, and an agent's status leaves it out.
  await DB.prepare('UPDATE fushati_cafeterias SET latitude=?,longitude=?,active=0 WHERE id=?').bind(POINT.a.lat, POINT.a.lng, cafe.default).run();
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.default, ...fix(POINT.a)})).status, 403, 'a disabled cafeteria');
  assert.deepEqual(sorted((await get(agent2, 'op=status')).json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b]), 'a disabled cafeteria is not offered');
  await DB.prepare('UPDATE fushati_cafeterias SET latitude=NULL,longitude=NULL,active=1 WHERE id=?').bind(cafe.default).run();

  // ---- 4. Who sees whom: administrators only -------------------------------------------------------------------
  const mapOne = await get(admin1, 'op=map');
  assert.equal(mapOne.status, 200, mapOne.text);
  assertOnlySchool(mapOne.text, a, 'cafeteria administrator (a) map');
  assert.deepEqual(mapOne.json.cafeterias.map((c) => c.id), [cafe.a], 'an administrator sees only his own cafeteria');
  assert.equal(mapOne.json.canSetLocation, false);
  assert.equal(mapOne.json.canEmail, true);
  assert.equal(mapOne.json.emailAlerts, false, 'e-mail alerts are off until he asks');
  assert.equal(mapOne.json.cafeterias[0].canManage, true);
  assert.deepEqual(Object.keys(mapOne.json.cafeterias[0]).sort(), ['active', 'alias', 'canManage', 'id', 'latitude', 'longitude', 'name', 'radiusM', 'schoolName'], 'a cafeteria carries no bank or school data');
  const inside = mapOne.json.visits.find((v) => v.userId === ids.agent1 && !v.leftAt);
  assert.ok(inside, 'agent1 is shown as inside');
  assert.equal(inside.state, 'inside');
  assert.equal(inside.phone, '+966512345678', 'the phone number falls back to his login number');
  assert.deepEqual(Object.keys(inside).sort(), ['arriveDistanceM', 'arrivedAt', 'cafeteriaId', 'durationMin', 'id', 'leaveReason', 'leftAt', 'name', 'phone', 'state', 'userId'], 'a stay carries no position, not even the last one');
  const movedAway = mapOne.json.visits.find((v) => v.userId === ids.agent2);
  assert.ok(movedAway && movedAway.leftAt && movedAway.leaveReason === 'moved', 'the earlier stay of agent2 at cafeteria a is in the log');
  assert.ok(mapOne.json.visits.every((v) => v.cafeteriaId === cafe.a), 'nothing from cafeteria b');

  const mapTwo = await get(admin2, 'op=map');
  assertOnlySchool(mapTwo.text, b, 'cafeteria administrator (b) map');
  assert.deepEqual(mapTwo.json.cafeterias.map((c) => c.id), [cafe.b]);
  assert.ok(mapTwo.json.visits.length >= 1 && mapTwo.json.visits.every((v) => v.userId === ids.agent2 && v.cafeteriaId === cafe.b), 'administrator b sees only agent2, at b');
  assert.ok(!mapTwo.text.includes(ids.agent1) && !mapTwo.text.includes('+966512345678'), 'administrator b learns nothing about agent1');

  // An agent sees none of it: not the map, not the feed, not himself. This holds even for an agent whose stored grant
  // still lists presence_view (agent2 above), and it cannot be granted again.
  for (const [who, cookie] of [['agent1', agent1], ['agent2 (old grant)', agent2]]) {
    assert.equal((await get(cookie, 'op=map')).status, 403, `${who} gets no map`);
    assert.equal((await get(cookie, 'op=feed&since=2020-01-01T00:00:00.000Z')).status, 403, `${who} gets no feed`);
    assert.equal((await post(cookie, 'force-checkout', {visitId: inside.id})).status, 403, `${who} cannot end a stay`);
    assert.equal((await post(cookie, 'set-email-alerts', {enabled: true})).status, 403, `${who} has no e-mail alerts`);
  }
  assert.equal((await post(system, 'set-email-alerts', {enabled: true})).status, 403, 'the system administrator has no mailbox here to alert');
  const grant = await main(admin1, 'edit-user', {id: ids.agent1, permissions: ['pos', 'menu_propose', 'presence_view']});
  assert.equal(grant.status, 200, grant.text);
  await signInAgent1();
  assert.ok(!(await first('SELECT permissions FROM fushati_assignments WHERE user_id=? AND cafeteria_id=?', ids.agent1, cafe.a)).permissions.includes('presence_view'), 'presence_view cannot be given to an agent: it is dropped');
  assert.equal((await get(agent1, 'op=map')).status, 403, 'so the agent still sees nothing');
  const mapSystem = await get(system, 'op=map');
  assert.deepEqual(sorted(mapSystem.json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b, cafe.default]), 'the system administrator sees every cafeteria');
  assert.equal(mapSystem.json.canSetLocation, true);
  assert.equal(mapSystem.json.canEmail, false);

  // ---- 5. The phone number shown next to the name ------------------------------------------------------------------
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent1, phone: 'abc'})).status, 400, 'not a phone number');
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent2, phone: '0555123456'})).status, 409, 'agent2 also works elsewhere: his details are not this administrator\'s to change');
  assert.equal((await main(admin1, 'edit-user', {id: ids.agent1, phone: '0555123456'})).status, 200);
  await signInAgent1();
  assert.equal((await first('SELECT phone FROM fushati_users WHERE id=?', ids.agent1)).phone, '+966555123456', 'stored in international form');
  assert.equal((await get(admin1, 'op=map')).json.visits.find((v) => v.userId === ids.agent1 && !v.leftAt).phone, '+966555123456', 'the contact phone wins over the login number');

  // ---- 6. Departure ------------------------------------------------------------------------------------------------
  const left = await post(agent1, 'check-out', fix(north(POINT.a, 400), 10));
  assert.equal(left.status, 200, left.text);
  assert.deepEqual(left.json, {ok: true, checkedOut: true});
  assert.equal((await allRows(ids.agent1))[0].leave_reason, 'left_area', 'a position far outside is recorded as leaving the area');
  assert.equal((await openRows(ids.agent1)).length, 0);
  const second = await post(agent1, 'check-out', {});
  assert.equal(second.status, 200);
  assert.equal(second.json.checkedOut, false, 'reporting a departure when not inside changes nothing');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  assert.equal((await post(agent1, 'check-out', undefined)).status, 200);
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  assert.equal((await post(agent1, 'check-out', fix(north(POINT.a, 20)))).status, 200);
  const history = await allRows(ids.agent1);
  assert.deepEqual(history.map((r) => r.leave_reason), ['left_area', 'manual', 'manual'], 'no position: plain departure; a position still inside: plain departure, not "left the area"');
  assert.ok(history.every((r) => r.left_at && r.left_at >= r.arrived_at), 'every stay ends after it starts');
  assert.ok(history.every((r) => r.arrive_lat === null && r.last_lat === null), 'and none of them kept a position');
  // A departure cannot be earlier than the arrival, however the phone's clock is set.
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  assert.equal((await post(agent1, 'check-out', {at: new Date(Date.now() - 11 * 3_600_000).toISOString()})).status, 200);
  const clamped = (await allRows(ids.agent1)).at(-1);
  assert.ok(clamped.left_at >= clamped.arrived_at, 'the departure is never before the arrival');

  // ---- 7. A stay nobody ended -------------------------------------------------------------------------------------
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  const silentSince = new Date(Date.now() - 20 * 3_600_000).toISOString();
  await DB.prepare('UPDATE fushati_visits SET arrived_at=?,last_seen_at=? WHERE user_id=? AND left_at IS NULL').bind(silentSince, silentSince, ids.agent1).run();
  const lostMap = await get(admin1, 'op=map');
  const lost = lostMap.json.visits.find((v) => v.userId === ids.agent1 && v.arrivedAt === silentSince);
  assert.ok(lost, 'the stay is still listed');
  assert.equal(lost.state, 'unconfirmed');
  assert.equal(lost.leftAt, null, 'no departure time is invented');
  assert.equal(lost.durationMin, null, 'and no length of stay is claimed');
  assert.equal(lost.leaveReason, 'signal_lost');
  const status = await get(agent1, 'op=status');
  assert.equal(status.json.insideCafeteriaId, null, 'the phone is told he is no longer inside');
  const closedRow = await first('SELECT left_at,leave_reason FROM fushati_visits WHERE user_id=? AND arrived_at=?', ids.agent1, silentSince);
  assert.deepEqual([closedRow.left_at, closedRow.leave_reason], [silentSince, 'signal_lost'], 'and the record was closed at the last confirmation');
  const closedView = (await get(admin1, 'op=map')).json.visits.find((v) => v.arrivedAt === silentSince);
  assert.deepEqual([closedView.leftAt, closedView.durationMin], [null, null], 'a closed unconfirmed stay still shows no departure and no length');
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200, 'he is recorded again at his next arrival');

  // ---- 8. An administrator ends a stay that was forgotten -----------------------------------------------------------
  const stay = (await openRows(ids.agent1))[0];
  assert.equal((await post(admin2, 'force-checkout', {visitId: stay.id})).status, 404, 'another cafeteria\'s administrator cannot see it exists');
  assert.equal((await post(admin1, 'force-checkout', {visitId: '99999999-0000-4000-8000-000000000002'})).status, 404, 'unknown stay');
  assert.equal((await openRows(ids.agent1)).length, 1, 'every refusal left the stay open');
  const ended = await post(admin1, 'force-checkout', {visitId: stay.id});
  assert.equal(ended.status, 200);
  assert.equal(ended.json.closed, true);
  assert.equal((await first('SELECT leave_reason r FROM fushati_visits WHERE id=?', stay.id)).r, 'closed_by_admin');
  assert.equal((await post(admin1, 'force-checkout', {visitId: stay.id})).json.closed, false, 'ending it twice changes nothing');
  assert.ok((await first("SELECT 1 AS found FROM fushati_audit WHERE operation='force-checkout' AND target_id=?", stay.id)), 'and it is in the audit trail');

  // ---- 9. What an agent's phone is told ---------------------------------------------------------------------------
  const own = await get(agent1, 'op=status');
  assert.deepEqual(Object.keys(own.json).sort(), ['cafeterias', 'insideCafeteriaId', 'now'], 'the phone gets the places and whether he is inside: no history');
  assert.deepEqual(own.json.cafeterias.map((c) => c.id), [cafe.a], 'agent1 is offered only his cafeteria');
  assert.deepEqual(Object.keys(own.json.cafeterias[0]).sort(), ['id', 'latitude', 'longitude', 'radiusM'], 'with its point and radius only (no name to show anywhere)');
  assert.ok(!own.text.includes(b.marker) && !own.text.includes(cafe.b), 'and nothing of another school');
  assert.deepEqual(sorted((await get(agent2, 'op=status')).json.cafeterias.map((c) => c.id)), sorted([cafe.a, cafe.b, cafe.default]), 'agent2 works in three cafeterias');

  // ---- 10. The feed the administrator is alerted from -------------------------------------------------------------
  const nothing = await get(admin1, 'op=feed');
  assert.equal(nothing.status, 200);
  assert.deepEqual([nothing.json.events, typeof nothing.json.now], [[], 'string'], 'no cursor yet: no history, just the time to start from');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const t0 = new Date().toISOString();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await post(agent2, 'check-in', {cafeteriaId: cafe.b, ...fix(POINT.b)})).status, 200);
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200);
  assert.equal((await post(agent1, 'check-out', {})).status, 200);
  const feed = await get(admin1, `op=feed&since=${encodeURIComponent(t0)}`);
  assert.deepEqual(feed.json.events.map((e) => [e.kind, e.userId]), [['arrived', ids.agent1], ['left', ids.agent1]], 'administrator a hears of his own agent, arrival first, then departure');
  assert.ok(feed.json.events.every((e) => e.cafeteriaId === cafe.a && e.name && e.cafeteria && e.at), 'each event says who, where and when');
  assert.ok(!feed.text.includes(ids.agent2), 'and nothing about the agent at cafeteria b');
  assertOnlySchool(feed.text, a, 'feed');
  const feedTwo = await get(admin2, `op=feed&since=${encodeURIComponent(t0)}`);
  assert.deepEqual(feedTwo.json.events.map((e) => [e.kind, e.userId]), [['arrived', ids.agent2]], 'administrator b hears of agent2 only');
  assert.equal((await get(admin1, `op=feed&since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).json.events.length, 0, 'nothing after the latest');
  assert.equal((await get(admin1, 'op=feed&since=garbage')).json.events.length, 0, 'an unreadable cursor starts from now');
  // A phone that was offline reports late: the administrator still hears of it when the server does, not at the old time.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const t1 = new Date().toISOString();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const seenAt = new Date(Date.now() - 30 * 60_000).toISOString();
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, at: seenAt, ...fix(POINT.a)})).status, 200);
  const lateFeed = await get(admin1, `op=feed&since=${encodeURIComponent(t1)}`);
  assert.deepEqual(lateFeed.json.events.map((e) => [e.kind, e.at]), [['arrived', seenAt]], 'an arrival the phone saw 30 minutes ago is announced now, with the time it was seen');
  assert.equal((await post(agent1, 'check-out', {})).status, 200);
  // A stay nobody ended is not announced as a departure.
  assert.equal((await first("SELECT COUNT(*) AS n FROM fushati_visits WHERE leave_reason='signal_lost'")).n >= 1, true);
  const wide = await get(admin1, `op=feed&since=${encodeURIComponent(new Date(Date.now() - 23 * 3_600_000).toISOString())}`);
  assert.ok(wide.json.events.some((e) => e.kind === 'arrived' && e.at === silentSince), 'the arrival of that stay was announced at the time');
  assert.ok(!wide.json.events.some((e) => e.kind === 'left' && e.at === silentSince), 'a closed unconfirmed stay is not a departure');

  // ---- 11. E-mail alerts are the administrator's own choice -------------------------------------------------------
  assert.equal((await post(admin1, 'set-email-alerts', {enabled: 'yes'})).status, 400, 'a yes/no only');
  assert.equal((await post(admin1, 'set-email-alerts', {enabled: true})).status, 200);
  assert.equal((await first('SELECT presence_email p FROM fushati_users WHERE id=?', ids.admin1)).p, 1);
  assert.equal((await first('SELECT presence_email p FROM fushati_users WHERE id=?', ids.admin2)).p, 0, 'it changed his setting only');
  assert.equal((await get(admin1, 'op=map')).json.emailAlerts, true);
  assert.equal((await post(agent1, 'check-in', {cafeteriaId: cafe.a, ...fix(POINT.a)})).status, 200, 'with no mail server configured an arrival is still recorded');
  assert.equal((await post(agent1, 'check-out', {})).status, 200);
  assert.equal((await post(admin1, 'set-email-alerts', {enabled: false})).status, 200);
  assert.equal((await get(admin1, 'op=map')).json.emailAlerts, false);

  // ---- 12. Permissions in the cafeteria screens -------------------------------------------------------------------
  const boots = await serve(admin1, '/api/fushati?op=bootstrap');
  const bootJson = await boots.json();
  assert.ok(bootJson.permissions[cafe.a].includes('presence_view'), 'an administrator has presence_view in his cafeteria');
  assert.ok(bootJson.cafeterias.every((c) => 'latitude' in c && 'arrival_radius_m' in c));
  const agentBoot = await (await serve(agent2, '/api/fushati?op=bootstrap')).json();
  assert.ok(Object.values(agentBoot.permissions).every((list) => !list.includes('presence_view')), 'an agent never has presence_view, in any cafeteria');

  console.log('Cafeteria presence passed: location set by the system administrator only; arrival and departure reported by the phone itself and accepted only at an assigned cafeteria within its radius; no position stored; administrators only (never an agent); feed and optional e-mail; a stay nobody ended is "not confirmed", not a long shift.');
} finally {
  await harness.close();
}
