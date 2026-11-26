// Cafeteria reports (phase 2), through the real gateway and route handlers on a real database.
//
// The data below is small and chosen so every expected number can be worked out by hand (see the table in each section).
//   - every report gives the right totals, by day, hour, item, category and agent; stock, waste, margin, top-ups, balances, attendance
//   - a report opens only with "reports" AND the permission for its kind of data, in that cafeteria
//   - "all cafeterias" means the cafeterias where the user has both, never one more
//   - reports are totals only: no student, no parent, no coordinates
//   - the CSV is a spreadsheet file that cannot run a formula
import assert from 'node:assert/strict';
import {createHarness} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const a = schoolByKey.a, b = schoolByKey.b;
  const {cafe, menu, assign} = await seedCafeterias({DB, seeded, schoolByKey});

  const read = async (response) => { const text = await response.text(); return {status: response.status, text, headers: response.headers, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const get = (cookie, query) => serve(cookie, `/api/fushati/reports?${query}`).then(read);
  const run = (cookie, report, cafeteria, extra = '') => get(cookie, `op=run&report=${report}&cafeteriaId=${cafeteria}&from=2026-11-01&to=2026-11-30${extra}`);
  const rowsBy = (result, key) => Object.fromEntries(result.json.rows.map((row) => [row[key], row]));
  const UNKNOWN = '99999999-0000-4000-8000-000000000001';

  const admin1 = sessions.fushatiAdmin, admin2 = sessions.fushatiAdmin2, agent1 = sessions.fushatiAgent, agent2 = sessions.fushatiAgent2, system = sessions.admin.default;
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.admin2, cafe.b, ['*']);
  await assign(ids.agent1, cafe.a, ['pos']);
  await assign(ids.agent2, cafe.a, ['reports', 'inventory_view']); // stock reports of a
  await assign(ids.agent2, cafe.b, ['reports', 'sales_view']); // sales reports of b
  await assign(ids.agent2, cafe.default, ['sales_view']); // data permission without "reports"

  // ---- the data -----------------------------------------------------------------------------------------------
  await DB.prepare('DELETE FROM fushati_purchases').run();
  await DB.prepare('DELETE FROM fushati_transfers').run();
  const [S1, S2, S3] = ['10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b3'];
  const item = (id, name, category, price) => DB.prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at) VALUES(?,?,?,?,?,1,1,?,?)').bind(id, cafe.a, name, category, price, ids.admin1, '2026-11-02T08:00:00.000Z').run();
  await item(S1, 'Sandwich', 'Food', 700);
  await item(S2, 'Juice', 'Drinks', 300);
  await item(S3, 'Water', 'Drinks', 100);
  await DB.prepare('UPDATE fushati_inventory SET tracked=1,on_hand=3,low_stock_threshold=5,cost_minor=400 WHERE menu_item_id=?').bind(S1).run(); // low, worth 12.00
  await DB.prepare('UPDATE fushati_inventory SET tracked=1,on_hand=0,low_stock_threshold=5,cost_minor=0 WHERE menu_item_id=?').bind(S2).run(); // out
  // S3 stays untracked.
  const purchase = (id, cafeteria, agent, day, at, lines, posted = 1) => DB.prepare('INSERT INTO fushati_purchases(id,account_id,cafeteria_id,agent_id,items_json,total_minor,day_key,month_key,posted,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id, cafeteria === cafe.a ? 'acct-a' : 'acct-b', cafeteria, agent, JSON.stringify(lines.map(([lineId, name, quantity, unit]) => ({id: lineId, name, quantity, unitPriceMinor: unit, lineTotalMinor: quantity * unit}))), lines.reduce((sum, [, , quantity, unit]) => sum + quantity * unit, 0), day, day.slice(0, 7), posted, at).run();
  await purchase('p1', cafe.a, ids.agent1, '2026-11-10', '2026-11-10T05:10:00.000Z', [[S1, 'Sandwich', 2, 700], [S2, 'Juice', 1, 300]]); // 08:10, 1700
  await purchase('p2', cafe.a, ids.agent2, '2026-11-10', '2026-11-10T09:30:00.000Z', [[S2, 'Juice', 3, 300]]); // 12:30, 900
  await purchase('p3', cafe.a, ids.agent1, '2026-11-11', '2026-11-11T05:20:00.000Z', [[S1, 'Sandwich', 1, 700]]); // 08:20, 700
  await purchase('p4', cafe.a, ids.agent1, '2026-10-01', '2026-10-01T05:00:00.000Z', [[S1, 'Sandwich', 1, 700]]); // before the period
  await purchase('p5', cafe.a, ids.agent1, '2026-11-10', '2026-11-10T06:00:00.000Z', [[S1, 'Sandwich', 5, 700]], 0); // never posted
  await purchase('p6', cafe.a, ids.agent1, '2026-11-12', '2026-11-12T05:00:00.000Z', [[S3, '=HYPERLINK("http://x")', 1, 500]]); // 08:00, a name a spreadsheet would run
  await purchase('pb', cafe.b, ids.agent2, '2026-11-10', '2026-11-10T05:00:00.000Z', [[menu.b, 'B-ONLY', 1, 99999]]); // cafeteria b: 99999
  const transfer = (id, cafeteria, account, amount, status, at) => DB.prepare('INSERT INTO fushati_transfers(id,account_id,cafeteria_id,parent_phone,amount_minor,bank_reference,destination_iban,receipt_key,receipt_mime,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, account, cafeteria, '0500000000', amount, `ref-${id}`, `SA-${id}`, `key-${id}`, 'image/png', status, at).run();
  await transfer('t1', cafe.a, 'acct-a', 5000, 'approved', '2026-11-10T21:30:00.000Z'); // 00:30 on the 11th in Riyadh
  await transfer('t2', cafe.a, 'acct-a', 2000, 'rejected', '2026-11-10T10:00:00.000Z');
  await transfer('t3', cafe.a, 'acct-a', 3000, 'pending', '2026-11-11T10:00:00.000Z');
  await transfer('tb', cafe.b, 'acct-b', 7777, 'pending', '2026-11-10T10:00:00.000Z');
  await DB.prepare('INSERT INTO fushati_accounts(id,school_id,cafeteria_id,student_id,balance_minor,active,created_at) VALUES(?,?,?,?,0,0,?)').bind('acct-a2', a.id, cafe.a, 'student-x', '2026-11-02T08:00:00.000Z').run();
  const movement = (id, delta, reason, kind, at, cost = null) => DB.prepare('INSERT INTO fushati_stock_movements(id,menu_item_id,delta,reason,kind,unit_cost_minor,reference_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, S1, delta, reason, kind, cost, `ref-${id}`, ids.admin1, at).run();
  await movement('m1', 20, 'receipt', '', '2026-11-05T08:00:00.000Z');
  await movement('m2', -3, 'purchase', '', '2026-11-10T08:00:00.000Z');
  await movement('m3', -2, 'correction', 'waste', '2026-11-12T08:00:00.000Z', 400);
  await movement('m4', -1, 'correction', 'expired', '2026-11-13T08:00:00.000Z', 400);
  await movement('m5', -1, 'correction', 'stocktake', '2026-11-14T08:00:00.000Z');
  await movement('m6', 2, 'correction', '', '2026-11-14T09:00:00.000Z'); // an old-style manual correction
  await movement('m7', 50, 'receipt', '', '2026-10-01T08:00:00.000Z'); // before the period
  const visit = (id, user, cafeteria, day, arrived, left, seen) => DB.prepare('INSERT INTO fushati_visits(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,left_at,leave_reason) VALUES(?,?,?,?,?,24.7136,46.6753,10,20,24.7136,46.6753,10,?,?,?)').bind(id, user, cafeteria, day, arrived, seen, left, left ? 'manual' : null).run();
  await visit('v1', ids.agent1, cafe.a, '2026-11-10', '2026-11-10T04:00:00.000Z', '2026-11-10T06:00:00.000Z', '2026-11-10T06:00:00.000Z'); // 120 min
  await visit('v2', ids.agent1, cafe.a, '2026-11-11', '2026-11-11T04:00:00.000Z', '2026-11-11T05:30:00.000Z', '2026-11-11T05:30:00.000Z'); // 90 min
  await visit('v3', ids.agent1, cafe.a, '2026-11-12', '2026-11-12T04:00:00.000Z', null, '2026-11-12T04:20:00.000Z'); // never closed: until the last report, 20 min
  await visit('v4', ids.agent2, cafe.a, '2026-11-10', '2026-11-10T07:00:00.000Z', '2026-11-10T08:00:00.000Z', '2026-11-10T08:00:00.000Z'); // 60 min

  // ---- 1. Who may open the catalog and run anything ----------------------------------------------------------
  assert.equal((await get(sessions.parent.a, 'op=catalog')).status, 403, 'a parent is refused');
  assert.equal((await get(sessions.manager.a, 'op=catalog')).status, 403, 'a school manager is refused');
  assert.equal((await get(admin1, 'op=nonsense')).status, 400);
  assert.equal((await run(sessions.parent.a, 'sales-daily', cafe.a)).status, 403);

  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const catalog = await get(admin1, 'op=catalog');
  assert.equal(catalog.status, 200, catalog.text);
  assert.equal(catalog.json.reports.length, 13, 'an administrator sees all 13 reports');
  assert.deepEqual(catalog.json.cafeterias.map((c) => c.id), [cafe.a], 'only his own cafeteria');
  assert.equal(catalog.json.cafeterias[0].reports.length, 13);
  assert.equal(catalog.json.to, today, 'the default period ends today (Riyadh)');
  assert.equal(catalog.json.from, new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10), 'and starts 29 days earlier: 30 days');
  assert.ok(catalog.json.reports.every((report) => report.title.ar && report.title.en && report.columns.length), 'every report has both titles and its columns');
  assert.ok(!catalog.text.includes(b.marker), 'the catalog names no other cafeteria');

  // ---- 2. The right numbers (period 1 to 30 November) -----------------------------------------------------------------
  const daily = await run(admin1, 'sales-daily', cafe.a);
  assert.equal(daily.status, 200, daily.text);
  assert.deepEqual(daily.json.rows.map((r) => [r.day, r.orders, r.items, r.total, r.average]), [['2026-11-10', 2, 6, 2600, 1300], ['2026-11-11', 1, 1, 700, 700], ['2026-11-12', 1, 1, 500, 500]], 'daily sales: the unposted and out-of-period purchases are not counted');
  assert.deepEqual([daily.json.totals.orders, daily.json.totals.items, daily.json.totals.total, daily.json.totals.average], [4, 8, 3800, 950]);
  assert.equal(daily.json.multi, false, 'one cafeteria: no cafeteria column');
  assert.ok(!daily.json.columns.some((c) => c.key === 'cafeteria'));
  assert.ok(!daily.text.includes('99999') && !daily.text.includes('B-ONLY'), 'cafeteria b is not in cafeteria a\'s sales');

  const hourly = await run(admin1, 'sales-hourly', cafe.a);
  assert.deepEqual(hourly.json.rows.map((r) => [r.hour, r.orders, r.total, r.share]), [['08:00', 3, 2900, 76.3], ['12:00', 1, 900, 23.7]], 'peak hours in Riyadh time (05:10 UTC is 08:10)');

  const byItem = await run(admin1, 'sales-by-item', cafe.a);
  assert.deepEqual(byItem.json.rows.map((r) => [r.item, r.category, r.quantity, r.revenue, r.share]), [['Sandwich', 'Food', 3, 2100, 55.3], ['Juice', 'Drinks', 4, 1200, 31.6], ['=HYPERLINK("http://x")', 'Drinks', 1, 500, 13.2]]);
  const byCategory = await run(admin1, 'sales-by-category', cafe.a);
  assert.deepEqual(byCategory.json.rows.map((r) => [r.category, r.quantity, r.revenue, r.share]), [['Food', 3, 2100, 55.3], ['Drinks', 5, 1700, 44.7]]);
  const byAgent = await run(admin1, 'sales-by-agent', cafe.a);
  const agents = byAgent.json.rows.map((r) => [r.orders, r.total, r.share]);
  assert.deepEqual(agents, [[3, 2900, 76.3], [1, 900, 23.7]], 'the busiest agent first');
  assert.ok(byAgent.json.rows.every((r) => r.agent.length > 0), 'agents are named');
  assert.ok(!/agent_?id|user_?id/i.test(byAgent.text), 'the agent is named, his id is not given');

  const margin = await run(admin1, 'margin', cafe.a);
  const sandwich = margin.json.rows.find((r) => r.item === 'Sandwich'), juice = margin.json.rows.find((r) => r.item === 'Juice');
  assert.deepEqual([sandwich.cost, sandwich.margin, sandwich.marginPct], [1200, 900, 42.9], 'Sandwich: 2100 sold, 3 x 400 cost');
  assert.deepEqual([juice.cost, juice.margin, juice.marginPct], [null, null, null], 'an item without a cost price has no margin, it is not counted as free');
  assert.deepEqual([margin.json.totals.revenue, margin.json.totals.cost, margin.json.totals.margin, margin.json.totals.marginPct], [3800, 1200, 900, 42.9], 'the total margin is worked out on the revenue whose cost is known');

  const topups = await run(admin1, 'topups', cafe.a);
  assert.deepEqual(topups.json.rows.map((r) => [r.day, r.submitted, r.approved, r.rejected, r.pending, r.approvedTotal]), [['2026-11-10', 1, 0, 1, 0, 0], ['2026-11-11', 2, 1, 0, 1, 5000]], 'a transfer sent at 00:30 Riyadh time counts on the 11th');
  assert.ok(!topups.text.includes('0500000000') && !topups.text.includes('ref-t'), 'no parent phone or bank reference');
  const balances = await run(admin1, 'balances', cafe.a);
  assert.deepEqual(balances.json.rows.map((r) => [r.accounts, r.active, r.funded, r.empty, r.total, r.average]), [[2, 1, 1, 1, 5000, 2500]]);
  assert.ok(!balances.text.includes('student-x') && !balances.text.includes(a.marker + ':students'), 'balances are totals: no student');

  const levels = await run(admin1, 'stock-levels', cafe.a);
  const level = rowsBy(levels, 'item');
  assert.deepEqual([level.Sandwich.onHand, level.Sandwich.threshold, level.Sandwich.status, level.Sandwich.value], [3, 5, 'low', 1200]);
  assert.deepEqual([level.Juice.onHand, level.Juice.status, level.Juice.value], [0, 'out', 0]);
  assert.deepEqual([level.Water.onHand, level.Water.threshold, level.Water.status], [null, null, 'untracked']);
  assert.equal(levels.json.totals.value, 1200);
  const low = await run(admin1, 'low-stock', cafe.a);
  assert.deepEqual(low.json.rows.map((r) => [r.item, r.onHand, r.status]), [['Juice', 0, 'out'], ['Sandwich', 3, 'low']], 'only tracked items at or below their warning level, emptiest first');

  const flow = await run(admin1, 'stock-movements', cafe.a);
  assert.deepEqual(flow.json.rows.map((r) => [r.item, r.received, r.sold, r.wasted, r.adjusted, r.net]), [['Sandwich', 20, 3, 3, 1, 15]], 'received 20, sold 3, written off 3, counts and corrections +1; the 50 received in October is outside');
  const waste = await run(admin1, 'waste', cafe.a);
  assert.deepEqual(waste.json.rows.map((r) => [r.item, r.reason, r.quantity, r.value]), [['Sandwich', 'waste', 2, 800], ['Sandwich', 'expired', 1, 400]], 'valued at the cost recorded on the day');
  assert.deepEqual([waste.json.totals.quantity, waste.json.totals.value], [3, 1200]);

  const attendance = await run(admin1, 'agent-attendance', cafe.a);
  assert.deepEqual(attendance.json.rows.map((r) => [r.days, r.stays, r.minutes]), [[3, 3, 230], [1, 1, 60]], 'agent1: 120 + 90 + 20 (a stay never closed counts to its last report)');
  assert.deepEqual(attendance.json.rows[0].first, '2026-11-10T04:00:00.000Z');
  assert.equal(attendance.json.rows[0].last, '2026-11-12T04:20:00.000Z');
  assert.equal(attendance.json.totals.minutes, 290);
  assert.ok(!/"lat"|"lng"|latitude|longitude|24\.7136|46\.6753/i.test(attendance.text), 'attendance has no positions');

  // dates outside the period change the numbers
  const narrow = await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-11-11&to=2026-11-11`);
  assert.deepEqual(narrow.json.rows.map((r) => [r.day, r.total]), [['2026-11-11', 700]], 'one day');
  const october = await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-10-01&to=2026-10-31`);
  assert.deepEqual(october.json.rows.map((r) => r.total), [700], 'the October purchase is found in October');
  const empty = await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-01-01&to=2026-01-31`);
  assert.deepEqual([empty.status, empty.json.rows.length, empty.json.totals.total], [200, 0, 0], 'an empty period is an empty report');

  // ---- 3. Bad requests ----------------------------------------------------------------------------------------------
  assert.equal((await run(admin1, 'nonsense', cafe.a)).status, 404, 'unknown report');
  assert.equal((await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-02-30&to=2026-03-01`)).status, 400, 'a day that does not exist');
  assert.equal((await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-11-05&to=2026-11-01`)).status, 400, 'from after to');
  assert.equal((await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2025-01-01&to=2026-12-31`)).status, 400, 'longer than a year');
  assert.equal((await get(admin1, `op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2025-12-01&to=2026-11-30`)).status, 200, 'a year is allowed');
  assert.equal((await run(admin1, 'sales-daily', 'not-a-uuid')).status, 400);
  assert.equal((await get(admin1, `op=run&cafeteriaId=${cafe.a}`)).status, 404, 'no report named');

  // ---- 4. Permissions: "reports" and the permission for the kind of data ---------------------------------------------
  const unknownCafe = await run(admin1, 'sales-daily', UNKNOWN), notYours = await run(admin1, 'sales-daily', cafe.b);
  assert.equal(notYours.status, 403);
  assert.deepEqual([notYours.status, notYours.json.code], [unknownCafe.status, unknownCafe.json.code], 'another cafeteria answers like one that does not exist');
  assert.ok(!notYours.text.includes(b.marker) && !notYours.text.includes('99999'));
  const allAsAdmin = await run(admin1, 'sales-daily', 'all');
  assert.equal(allAsAdmin.json.totals.total, 3800, '"all" is only his cafeterias');
  assert.equal(allAsAdmin.json.multi, false);

  // an agent who only sells
  assert.equal((await get(agent1, 'op=catalog')).status, 200);
  assert.deepEqual((await get(agent1, 'op=catalog')).json.reports, [], 'no reports without the permission');
  assert.equal((await run(agent1, 'sales-daily', cafe.a)).status, 403);
  const grantAgent1 = (permissions) => DB.prepare('UPDATE fushati_assignments SET permissions=? WHERE user_id=? AND cafeteria_id=?').bind(JSON.stringify(permissions), ids.agent1, cafe.a).run();
  await grantAgent1(['pos', 'reports']);
  assert.equal((await run(agent1, 'sales-daily', cafe.a)).status, 403, '"reports" alone opens nothing');
  assert.deepEqual((await get(agent1, 'op=catalog')).json.reports, []);
  await grantAgent1(['pos', 'sales_view']);
  assert.equal((await run(agent1, 'sales-daily', cafe.a)).status, 403, 'a data permission alone opens nothing');
  await grantAgent1(['pos', 'reports', 'sales_view']);
  assert.equal((await run(agent1, 'sales-daily', cafe.a)).status, 200, 'both together open the sales reports');
  assert.equal((await run(agent1, 'waste', cafe.a)).status, 403, 'but not the stock reports');
  assert.equal((await run(agent1, 'topups', cafe.a)).status, 403, 'nor the money reports');
  assert.equal((await run(agent1, 'agent-attendance', cafe.a)).status, 403, 'nor attendance');
  assert.deepEqual((await get(agent1, 'op=catalog')).json.reports.map((r) => r.id).sort(), ['margin', 'sales-by-agent', 'sales-by-category', 'sales-by-item', 'sales-daily', 'sales-hourly']);
  await grantAgent1(['pos', 'reports', 'balances_view', 'presence_view']);
  assert.deepEqual((await get(agent1, 'op=catalog')).json.reports.map((r) => r.id).sort(), ['agent-attendance', 'balances', 'topups']);
  await grantAgent1(['pos']);

  // agent2: stock reports in a, sales reports in b, a data permission in the default cafeteria without "reports"
  const catalog2 = await get(agent2, 'op=catalog');
  const byCafe = Object.fromEntries(catalog2.json.cafeterias.map((c) => [c.id, c.reports.sort()]));
  assert.deepEqual(Object.keys(byCafe).sort(), [cafe.a, cafe.b].sort(), 'the cafeteria where he has no "reports" is not listed');
  assert.deepEqual(byCafe[cafe.a], ['low-stock', 'stock-levels', 'stock-movements', 'waste']);
  assert.deepEqual(byCafe[cafe.b], ['margin', 'sales-by-agent', 'sales-by-category', 'sales-by-item', 'sales-daily', 'sales-hourly']);
  assert.equal((await run(agent2, 'sales-daily', cafe.a)).status, 403, 'stock-only in a: no sales');
  assert.equal((await run(agent2, 'sales-daily', cafe.default)).status, 403, 'sales_view without "reports"');
  const salesAll = await run(agent2, 'sales-daily', 'all');
  assert.equal(salesAll.status, 200);
  assert.deepEqual(salesAll.json.cafeterias.map((c) => c.id), [cafe.b], '"all" sales means b only');
  assert.equal(salesAll.json.totals.total, 99999);
  assert.ok(!salesAll.text.includes('2600') && !salesAll.text.includes(a.marker), 'none of cafeteria a\'s sales');
  const stockAll = await run(agent2, 'stock-levels', 'all');
  assert.deepEqual(stockAll.json.cafeterias.map((c) => c.id), [cafe.a], '"all" stock means a only');
  assert.ok(!stockAll.text.includes(b.marker), 'none of cafeteria b\'s stock');
  assert.equal((await run(agent2, 'stock-levels', cafe.b)).status, 403);

  // a disabled cafeteria disappears for agents and stays for administrators
  await DB.prepare('UPDATE fushati_cafeterias SET active=0 WHERE id=?').bind(cafe.a).run();
  assert.equal((await run(agent2, 'stock-levels', cafe.a)).status, 403, 'an agent no longer reaches a disabled cafeteria');
  assert.equal((await run(admin1, 'sales-daily', cafe.a)).status, 200, 'its administrator still reads its history');
  await DB.prepare('UPDATE fushati_cafeterias SET active=1 WHERE id=?').bind(cafe.a).run();

  // the other administrator
  const b2 = await run(admin2, 'sales-daily', 'all');
  assert.equal(b2.json.totals.total, 99999);
  assert.ok(!b2.text.includes('2600') && !b2.text.includes(a.marker));
  assert.equal((await run(admin2, 'sales-daily', cafe.a)).status, 403);

  // the system administrator: every cafeteria, with the cafeteria named in each row
  const platform = await run(system, 'sales-daily', 'all');
  assert.equal(platform.json.multi, true);
  assert.equal(platform.json.columns[0].key, 'cafeteria');
  assert.equal(platform.json.totals.total, 3800 + 99999);
  assert.ok(platform.json.rows.every((row) => row.cafeteria.length > 0), 'each row names its cafeteria');
  assert.ok(platform.text.includes(a.marker) && platform.text.includes(b.marker));

  // ---- 5. The spreadsheet file --------------------------------------------------------------------------------------
  const csv = await run(admin1, 'sales-daily', cafe.a, '&format=csv&lang=en');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /fushati-sales-daily-2026-11-01-2026-11-30\.csv/);
  const raw = new Uint8Array(await (await serve(admin1, `/api/fushati/reports?op=run&report=sales-daily&cafeteriaId=${cafe.a}&from=2026-11-01&to=2026-11-30&format=csv&lang=en`)).arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf], 'the file starts with a byte-order mark so Excel reads Arabic (text decoding hides it, so the bytes are checked)');
  assert.deepEqual(csv.text.split('\r\n'), ['Day,Orders,Items,Total,Average order', '2026-11-10,2,6,26.00,13.00', '2026-11-11,1,1,7.00,7.00', '2026-11-12,1,1,5.00,5.00', 'Total,4,8,38.00,9.50'], 'money in riyals with two decimals, a total row');
  const csvAr = await run(admin1, 'sales-daily', cafe.a, '&format=csv');
  assert.ok(csvAr.text.startsWith('اليوم,العمليات'), 'Arabic headers by default');
  const items = await run(admin1, 'sales-by-item', cafe.a, '&format=csv&lang=en');
  assert.ok(items.text.includes(`"'=HYPERLINK(""http://x"")"`), 'a name that starts with = is made harmless, and quoted');
  assert.ok(!items.text.includes(',=HYPERLINK') && !items.text.includes('\r\n=HYPERLINK'), 'no cell starts with a formula');
  const stockCsv = await run(admin1, 'stock-levels', cafe.a, '&format=csv&lang=en');
  assert.ok(stockCsv.text.includes('Sandwich,Food,3,5,Low,12.00') && stockCsv.text.includes('Water,Drinks,,,Not tracked,0.00'), 'status words and blanks for untracked items');
  assert.match((await run(admin1, 'stock-levels', cafe.a, '&format=csv')).headers.get('content-disposition'), /fushati-stock-levels\.csv/, 'a snapshot has no dates in its file name');
  assert.equal((await run(agent2, 'sales-daily', cafe.a, '&format=csv')).status, 403, 'the file follows the same permissions');

  console.log('Cafeteria reports passed: 13 reports give the hand-checked numbers; each needs "reports" plus the permission for its kind of data in that cafeteria; "all" is only the cafeterias where both are held; totals only, no students, parents or positions; the CSV cannot run a formula.');
} finally {
  await harness.close();
}
