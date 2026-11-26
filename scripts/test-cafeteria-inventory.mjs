// Cafeteria inventory (phase 2), through the real gateway and route handlers on a real database.
//
//   - stock is visible only with "inventory_view" in that cafeteria and changed only with "inventory_manage" there
//   - receiving, returns, write-offs and stock counts each leave a history row and one guarded change of the count
//   - the count never goes negative, not even when two people write off the same stock at the same moment
//   - sending the same request twice changes the stock once
//   - another cafeteria's stock, history and items answer exactly like something that does not exist
import assert from 'node:assert/strict';
import {createHarness} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const a = schoolByKey.a, b = schoolByKey.b;
  const {cafe, menu, assign} = await seedCafeterias({DB, seeded, schoolByKey});

  const read = async (response) => { const text = await response.text(); return {status: response.status, text, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const get = (cookie, query) => serve(cookie, `/api/fushati/inventory?${query}`).then(read);
  const post = (cookie, op, data) => serve(cookie, '/api/fushati/inventory', {method: 'POST', body: {op, data}}).then(read);
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  const first = (sql, ...params) => DB.prepare(sql).bind(...params).first();
  let counter = 0;
  const requestId = () => `c0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
  const UNKNOWN = '99999999-0000-4000-8000-000000000001';
  const onHand = async (menuId) => (await first('SELECT on_hand FROM fushati_inventory WHERE menu_item_id=?', menuId)).on_hand;
  const moves = (menuId) => rows('SELECT * FROM fushati_stock_movements WHERE menu_item_id=? ORDER BY created_at, rowid', menuId);
  const move = (cookie, menuId, kind, quantity, extra = {}) => post(cookie, 'move', {menuId, kind, quantity, requestId: requestId(), ...extra});

  const admin1 = sessions.fushatiAdmin, admin2 = sessions.fushatiAdmin2, agent1 = sessions.fushatiAgent, agent2 = sessions.fushatiAgent2, system = sessions.admin.default;
  // admin1 runs cafeteria a, admin2 runs cafeteria b. agent1 only sells in a. agent2 may look at the stock of a and look after the stock of b.
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.admin2, cafe.b, ['*']);
  await assign(ids.agent1, cafe.a, ['pos']);
  await assign(ids.agent2, cafe.a, ['inventory_view']);
  await assign(ids.agent2, cafe.b, ['inventory_view', 'inventory_manage']);
  // A second item in cafeteria a whose stock is not tracked.
  const untracked = '10000000-0000-4000-8000-0000000000a1';
  await DB.prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at) VALUES(?,?,?,?,?,1,1,?,?)').bind(untracked, cafe.a, 'Water', 'Drinks', 100, ids.admin1, '2026-11-02T08:00:00.000Z').run();
  assert.equal((await first('SELECT tracked FROM fushati_inventory WHERE menu_item_id=?', untracked)).tracked, 0, 'a new item starts untracked');

  // ---- 1. Who may look ------------------------------------------------------------------------------------------
  assert.equal((await get(sessions.parent.a, `op=items&cafeteriaId=${cafe.a}`)).status, 403, 'a parent is refused');
  assert.equal((await get(sessions.manager.a, `op=items&cafeteriaId=${cafe.a}`)).status, 403, 'a school manager is refused');
  assert.equal((await get(agent1, `op=items&cafeteriaId=${cafe.a}`)).status, 403, 'an agent who only sells may not see stock');
  assert.equal((await get(admin1, 'op=items')).status, 400, 'a cafeteria is required');
  assert.equal((await get(admin1, 'op=items&cafeteriaId=not-a-uuid')).status, 400);
  assert.equal((await get(admin1, `op=nonsense&cafeteriaId=${cafe.a}`)).status, 400);

  const viewer = await get(agent2, `op=items&cafeteriaId=${cafe.a}`);
  assert.equal(viewer.status, 200, viewer.text);
  assert.equal(viewer.json.canManage, false, 'viewing stock does not allow changing it');
  const owner = await get(admin1, `op=items&cafeteriaId=${cafe.a}`);
  assert.equal(owner.status, 200, owner.text);
  assert.equal(owner.json.canManage, true);
  assert.equal(owner.json.items.length, 2);
  const seedItem = owner.json.items.find((item) => item.id === menu.a);
  assert.deepEqual([seedItem.tracked, seedItem.onHand, seedItem.threshold, seedItem.status], [true, 7, 5, 'ok']);
  assert.equal(owner.json.items.find((item) => item.id === untracked).status, 'untracked');
  assert.ok(owner.text.includes(a.marker) && !owner.text.includes(b.marker), 'the administrator of a sees only the stock of a');

  const notYours = await get(admin1, `op=items&cafeteriaId=${cafe.b}`), unknown = await get(admin1, `op=items&cafeteriaId=${UNKNOWN}`);
  assert.equal(notYours.status, 403);
  assert.deepEqual([notYours.status, notYours.json.code], [unknown.status, unknown.json.code], 'another cafeteria answers like one that does not exist');
  assert.ok(!notYours.text.includes(b.marker), 'the refusal says nothing about cafeteria b');
  const platform = await get(system, `op=items&cafeteriaId=${cafe.b}`);
  assert.equal(platform.status, 200);
  assert.ok(platform.text.includes(b.marker) && !platform.text.includes(a.marker), 'the system administrator can open any cafeteria');

  // ---- 2. Who may change the settings -------------------------------------------------------------------------
  const refusedSetups = [['an agent who only sells', agent1, menu.a], ['a supervisor who may only look', agent2, menu.a], ['the administrator of another cafeteria', admin1, menu.b], ['an administrator, for an unknown item', admin1, UNKNOWN]];
  const refusals = [];
  for (const [who, cookie, menuId] of refusedSetups) {
    const refused = await post(cookie, 'setup', {menuId, tracked: true, threshold: 99});
    assert.equal(refused.status, 403, `${who} must not change stock settings`);
    refusals.push(refused.json.code);
  }
  assert.equal(new Set(refusals).size, 1, 'not-yours and not-found give the same answer');
  assert.equal((await first('SELECT low_stock_threshold t FROM fushati_inventory WHERE menu_item_id=?', menu.a)).t, 5, 'refused requests changed nothing');
  assert.equal((await first('SELECT low_stock_threshold t FROM fushati_inventory WHERE menu_item_id=?', menu.b)).t, 5);
  assert.equal((await post(sessions.parent.a, 'setup', {menuId: menu.a, tracked: true, threshold: 1})).status, 403, 'a parent cannot');
  for (const [label, data] of [['a cost with three decimals', {cost: '1.234'}], ['a cost that is not a number', {cost: 'abc'}], ['a negative cost', {cost: '-1'}], ['a huge cost', {cost: '99999'}], ['a negative level', {threshold: -1}], ['a fractional level', {threshold: 1.5}], ['a level above the limit', {threshold: 100001}], ['tracked as text', {tracked: 'yes'}]]) {
    assert.equal((await post(admin1, 'setup', {menuId: menu.a, tracked: true, threshold: 5, ...data})).status, 400, label);
  }
  assert.equal((await post(admin1, 'setup', {tracked: true, threshold: 5})).status, 400, 'no item');
  assert.equal((await post(admin1, 'nonsense', {})).status, 400);
  assert.equal((await post(admin1, 'setup', {menuId: menu.a, tracked: true, threshold: 6, cost: '1.50'})).status, 200);
  const setting = await first('SELECT tracked,low_stock_threshold t,cost_minor c,on_hand FROM fushati_inventory WHERE menu_item_id=?', menu.a);
  assert.deepEqual([setting.tracked, setting.t, setting.c, setting.on_hand], [1, 6, 150, 7], 'level and cost saved, count untouched');
  assert.equal((await post(agent2, 'setup', {menuId: menu.b, tracked: true, threshold: 2})).status, 200, 'a supervisor with inventory_manage in b may set up b');
  assert.equal((await first('SELECT low_stock_threshold t FROM fushati_inventory WHERE menu_item_id=?', menu.b)).t, 2);
  assert.equal((await post(admin1, 'setup', {menuId: menu.a, tracked: true, threshold: 6})).status, 200, 'saving again without a cost keeps the cost');
  assert.equal((await first('SELECT cost_minor c FROM fushati_inventory WHERE menu_item_id=?', menu.a)).c, 150);

  // ---- 3. Who may move stock ----------------------------------------------------------------------------------
  const before = await onHand(menu.a);
  for (const [who, cookie, menuId] of [['an agent who only sells', agent1, menu.a], ['a supervisor who may only look', agent2, menu.a], ['the administrator of b, on a', admin2, menu.a], ['the administrator of a, on b', admin1, menu.b], ['a parent', sessions.parent.a, menu.a]]) {
    assert.equal((await move(cookie, menuId, 'receipt', 5)).status, 403, `${who} must not move stock`);
  }
  assert.equal((await move(admin1, UNKNOWN, 'receipt', 5)).status, 403, 'unknown item');
  assert.equal(await onHand(menu.a), before, 'refused requests changed nothing');
  assert.equal((await moves(menu.a)).length, 0, 'and left no history');

  // ---- 4. Receiving, returns, write-offs and counts ------------------------------------------------------------
  const received = await move(admin1, menu.a, 'receipt', 10, {cost: '1.75', note: 'Delivery 41'});
  assert.equal(received.status, 200, received.text);
  assert.deepEqual([received.json.onHand, received.json.delta, received.json.duplicate], [17, 10, false]);
  let row = (await moves(menu.a))[0];
  assert.deepEqual([row.delta, row.reason, row.kind, row.note, row.unit_cost_minor, row.actor_id], [10, 'receipt', '', 'Delivery 41', 175, ids.admin1], 'the receipt is in the history with its cost and who did it');
  assert.equal((await first('SELECT cost_minor c FROM fushati_inventory WHERE menu_item_id=?', menu.a)).c, 175, 'a receipt with a cost updates the cost price');

  const sameRequest = requestId();
  const first1 = await post(admin1, 'move', {menuId: menu.a, kind: 'receipt', quantity: 4, requestId: sameRequest});
  const again = await post(admin1, 'move', {menuId: menu.a, kind: 'receipt', quantity: 4, requestId: sameRequest});
  assert.equal(first1.status, 200);
  assert.equal(again.status, 200, again.text);
  assert.equal(again.json.duplicate, true, 'the second send is recognised');
  assert.equal(await onHand(menu.a), 21, 'a repeated request changes the stock once');
  assert.equal((await moves(menu.a)).filter((move) => move.reference_id === sameRequest).length, 1, 'and leaves one history row');

  const waste = await move(admin1, menu.a, 'waste', 3, {note: 'dropped'});
  assert.deepEqual([waste.status, waste.json.onHand, waste.json.delta], [200, 18, -3]);
  await post(admin1, 'setup', {menuId: menu.a, tracked: true, threshold: 6, cost: '3.00'});
  assert.equal((await move(admin1, menu.a, 'receipt', 1, {cost: '3.00'})).status, 200);
  const wasteRow = (await moves(menu.a)).find((m) => m.kind === 'waste');
  assert.deepEqual([wasteRow.delta, wasteRow.reason, wasteRow.unit_cost_minor, wasteRow.note], [-3, 'correction', 175, 'dropped'], 'a write-off keeps the cost of the day, not today\'s cost');
  assert.equal((await move(admin1, menu.a, 'damage', 1)).status, 200);
  assert.equal((await move(admin1, menu.a, 'expired', 2)).status, 200);
  assert.equal((await move(admin1, menu.a, 'return', 2)).status, 200);
  assert.deepEqual((await moves(menu.a)).map((m) => m.kind).filter(Boolean), ['waste', 'damage', 'expired', 'return']);
  assert.equal(await onHand(menu.a), 18 + 1 - 1 - 2 + 2, 'the count follows every movement');

  const tooMany = await move(admin1, menu.a, 'waste', 1000);
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.json.code, 'insufficient');
  assert.equal(await onHand(menu.a), 18, 'a write-off larger than the stock changes nothing');
  assert.equal((await moves(menu.a)).length, 7, 'and writes no history (3 receipts, a write-off, damage, expired and a return so far)');

  const count = await move(admin1, menu.a, 'stocktake', 25, {note: 'Friday count'});
  assert.deepEqual([count.status, count.json.onHand, count.json.delta], [200, 25, 7], 'a count sets the stock and records the difference');
  const countRow = (await moves(menu.a)).find((m) => m.kind === 'stocktake');
  assert.deepEqual([countRow.delta, countRow.reason, countRow.note], [7, 'correction', 'Friday count']);
  const sameCount = await move(admin1, menu.a, 'stocktake', 25);
  assert.deepEqual([sameCount.status, sameCount.json.onHand, sameCount.json.delta], [200, 25, 0], 'counting what is already there records nothing');
  assert.equal((await moves(menu.a)).filter((m) => m.kind === 'stocktake').length, 1);
  const lower = await move(admin1, menu.a, 'stocktake', 20);
  assert.deepEqual([lower.json.onHand, lower.json.delta], [20, -5], 'a count below the stock is a loss');
  assert.equal((await move(admin1, menu.a, 'stocktake', 0)).json.onHand, 0, 'counting zero is allowed');
  assert.equal((await move(admin1, menu.a, 'waste', 1)).status, 409, 'nothing left to write off');

  for (const [label, data] of [['quantity zero', {kind: 'receipt', quantity: 0}], ['negative quantity', {kind: 'receipt', quantity: -1}], ['fractional quantity', {kind: 'receipt', quantity: 1.5}], ['quantity too large', {kind: 'receipt', quantity: 100001}], ['negative count', {kind: 'stocktake', quantity: -1}], ['unknown kind', {kind: 'sale', quantity: 1}], ['cost on a write-off', {kind: 'waste', quantity: 1, cost: '1.00'}], ['bad cost', {kind: 'receipt', quantity: 1, cost: '1.001'}], ['note too long', {kind: 'receipt', quantity: 1, note: 'x'.repeat(201)}], ['no request id', {kind: 'receipt', quantity: 1, requestId: undefined}], ['request id not a uuid', {kind: 'receipt', quantity: 1, requestId: 'abc'}]]) {
    const attempt = await post(admin1, 'move', {menuId: menu.a, requestId: requestId(), ...data});
    assert.equal(attempt.status, 400, label);
  }
  assert.equal(await onHand(menu.a), 0, 'invalid requests changed nothing');

  // ---- 5. Items whose stock is not tracked ---------------------------------------------------------------------
  const noTracking = await move(admin1, untracked, 'receipt', 5);
  assert.equal(noTracking.status, 409);
  assert.equal(noTracking.json.code, 'untracked');
  assert.equal((await moves(untracked)).length, 0);
  assert.equal(await onHand(untracked), 0, 'untracked stock does not move');
  assert.equal((await post(admin1, 'setup', {menuId: untracked, tracked: true, threshold: 3})).status, 200);
  assert.equal((await move(admin1, untracked, 'opening', 12)).status, 200);
  assert.equal(await onHand(untracked), 12);
  assert.equal((await post(admin1, 'setup', {menuId: untracked, tracked: false, threshold: 3})).status, 200);
  assert.equal((await move(admin1, untracked, 'waste', 1)).status, 409, 'switching tracking off stops movements');

  // ---- 6. A supervisor with inventory_manage in b works in b, and only there ---------------------------------------
  assert.equal((await move(agent2, menu.b, 'receipt', 3)).status, 200);
  assert.equal(await onHand(menu.b), 7 + 3);
  assert.equal((await move(agent2, menu.a, 'receipt', 3)).status, 403, 'and not in a, where he may only look');

  // ---- 7. Two people writing off the same stock at the same moment ------------------------------------------------
  await move(admin1, menu.a, 'stocktake', 14);
  const results = await Promise.all([move(admin1, menu.a, 'waste', 10), move(admin1, menu.a, 'waste', 10)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409], 'only one of two simultaneous write-offs of 10 from 14 succeeds');
  assert.equal(await onHand(menu.a), 4, 'the count is exact and never negative');
  assert.ok((await rows('SELECT on_hand FROM fushati_inventory')).every((r) => r.on_hand >= 0));

  // ---- 8. Sales take stock off through the database trigger and appear in the history ---------------------------------
  await move(admin1, menu.a, 'stocktake', 30);
  await DB.prepare('INSERT INTO fushati_purchases(id,account_id,cafeteria_id,agent_id,items_json,total_minor,day_key,month_key,posted,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)')
    .bind('purchase-trigger-a', 'acct-a', cafe.a, ids.agent1, JSON.stringify([{id: menu.a, name: 'x', quantity: 2, unitPriceMinor: 100, lineTotalMinor: 200}]), 200, '2026-11-02', '2026-11', new Date().toISOString()).run();
  await DB.prepare("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,day_key,month_key,created_at) VALUES(?,?,?,'purchase',?,?,?,?,?)")
    .bind('ledger-trigger-a', 'acct-a', -200, 'purchase-trigger-a', 'sale', '2026-11-02', '2026-11', new Date().toISOString()).run();
  assert.equal(await onHand(menu.a), 28, 'a sale of 2 took 2 off');
  const afterSale = await get(admin1, `op=items&cafeteriaId=${cafe.a}`);
  assert.equal(afterSale.json.items.find((i) => i.id === menu.a).sold30d, 2, 'the item shows what it sold in 30 days');

  // ---- 9. History: only your own cafeteria, newest first ---------------------------------------------------------------
  const history = await get(admin1, `op=history&cafeteriaId=${cafe.a}&days=30`);
  assert.equal(history.status, 200, history.text);
  assert.ok(history.json.movements.length >= 10);
  const times = history.json.movements.map((m) => m.at);
  assert.deepEqual(times, [...times].sort().reverse(), 'newest first');
  assert.ok(history.json.movements.some((m) => m.type === 'purchase' && m.delta === -2), 'the sale is in the history');
  for (const type of ['receipt', 'waste', 'damage', 'expired', 'return', 'stocktake', 'opening', 'purchase']) assert.ok(history.json.movements.some((m) => m.type === type), `${type} is named in the history`);
  assert.ok(history.json.movements.every((m) => m.menuId === menu.a || m.menuId === untracked), 'only items of cafeteria a');
  assert.ok(history.text.includes(a.marker) && !history.text.includes(b.marker), 'no other cafeteria in the history');
  assert.equal(history.json.movements.find((m) => m.type === 'receipt').actor.length > 0, true, 'the history says who did it');
  const oneItem = await get(admin1, `op=history&cafeteriaId=${cafe.a}&menuId=${untracked}`);
  assert.ok(oneItem.json.movements.every((m) => m.menuId === untracked) && oneItem.json.movements.length === 1, 'filtered to one item');
  const foreignItem = await get(admin1, `op=history&cafeteriaId=${cafe.a}&menuId=${menu.b}`);
  assert.equal(foreignItem.status, 200);
  assert.deepEqual(foreignItem.json.movements, [], 'asking for another cafeteria\'s item through your own cafeteria returns nothing');
  assert.equal((await get(admin1, `op=history&cafeteriaId=${cafe.b}`)).status, 403);
  assert.equal((await get(agent1, `op=history&cafeteriaId=${cafe.a}`)).status, 403, 'an agent who only sells has no history');
  assert.equal((await get(admin1, `op=history&cafeteriaId=${cafe.a}&menuId=nope`)).status, 400);
  assert.equal((await get(admin1, `op=history&cafeteriaId=${cafe.a}&days=1`)).status, 200);
  const bHistory = await get(admin2, `op=history&cafeteriaId=${cafe.b}`);
  assert.ok(bHistory.text.includes(b.marker) && !bHistory.text.includes(a.marker), 'the administrator of b sees only b');
  assert.ok(bHistory.json.movements.length >= 1, 'b has its own receipt in the history');

  // ---- 10. Every change is in the audit trail ----------------------------------------------------------------------
  const audited = (await rows("SELECT DISTINCT operation FROM fushati_audit WHERE operation LIKE 'stock-%'")).map((r) => r.operation).sort();
  for (const operation of ['stock-setup', 'stock-receipt', 'stock-waste', 'stock-damage', 'stock-expired', 'stock-return', 'stock-stocktake', 'stock-opening']) assert.ok(audited.includes(operation), `${operation} is audited`);
  const dup = await rows("SELECT COUNT(*) n FROM fushati_audit WHERE operation='stock-receipt' AND target_id=?", menu.a);
  assert.ok(dup[0].n >= 3, 'receipts audited');

  console.log('Cafeteria inventory passed: stock visible and changeable only with the permission in that cafeteria; receipts, returns, write-offs and counts keep a history and an exact count; repeated requests apply once; simultaneous write-offs cannot make the count negative; untracked items do not move; no leaks between cafeterias.');
} finally {
  await harness.close();
}
