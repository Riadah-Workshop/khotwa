// Cafeteria access model: who may see and change which cafeteria, and what each person may do there.
//
//   system administrator   every cafeteria; the only one who creates, renames, re-banks or deletes a cafeteria
//   cafeteria administrator only the cafeterias assigned to him; may set an alias; manages the agents of those
//                          cafeterias and decides what each may do; never sees another cafeteria or any school data
//   supervisor             an agent with more permissions, per cafeteria
//   agent                  sells at the counter and proposes menu items
//
// Everything goes through the real gateway and route handlers on a real database (see school-harness.mjs).
// Each rule is checked in both directions: the allowed action works, the same action on somebody else's cafeteria
// is refused, and the other cafeteria's data is unchanged afterwards.
import assert from 'node:assert/strict';
const SOFT_FAILURES = [];
for (const key of Object.keys(assert)) {
  if (typeof assert[key] !== 'function' || key === 'AssertionError') continue;
  const original = assert[key];
  assert[key] = (...args) => { try { return original(...args); } catch (error) { SOFT_FAILURES.push(String(error.message).split('\n')[0]); } };
}
process.on('exit', () => { if (SOFT_FAILURES.length) { console.error('SOFT FAILURES (' + SOFT_FAILURES.length + '):\n' + SOFT_FAILURES.map((line) => ' * ' + line).join('\n')); process.exitCode = 1; } });
import {assertOnlySchool, createHarness, PASSWORD} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids, addFushati} = harness;
  const a = schoolByKey.a, b = schoolByKey.b, legacy = schoolByKey.default;
  const {cafe, menu, transfer, assign} = await seedCafeterias({DB, seeded, schoolByKey});

  const get = async (cookie, query) => { const response = await serve(cookie, `/api/fushati?${query}`); return {status: response.status, text: await response.text()}; };
  const post = async (cookie, op, data) => { const response = await serve(cookie, '/api/fushati', {method: 'POST', body: {op, data}}); return {status: response.status, text: await response.text()}; };
  const bootstrap = async (cookie, label) => {
    const response = await get(cookie, 'op=bootstrap');
    assert.equal(response.status, 200, `${label} bootstrap: HTTP ${response.status} ${response.text.slice(0, 200)}`);
    return {text: response.text, data: JSON.parse(response.text)};
  };
  const idsOf = (list) => list.map((entry) => entry.id).sort();
  const first = (sql, ...params) => DB.prepare(sql).bind(...params).first();
  const expectStatus = async (result, status, label) => assert.equal((await result).status, status, label);

  const SUPERVISOR_A = ['pos', 'menu_propose', 'inventory_view', 'sales_view', 'reports'];
  // Who works where.
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.admin2, cafe.a, ['*']);
  await assign(ids.admin2, cafe.b, ['*']);
  await assign(ids.agent1, cafe.a, ['pos', 'menu_propose']);
  await assign(ids.agent2, cafe.a, SUPERVISOR_A); // a supervisor in cafeteria a ...
  await assign(ids.agent2, cafe.b, ['pos']); // ... and only a counter agent in cafeteria b
  const agentBOnly = 'f0000000-0000-4000-8000-0000000000b1';
  await addFushati(agentBOnly, 'agent-b-only@example.com', 'fushati_agent', 'phone:+966512345690');
  await assign(agentBOnly, cafe.b, ['pos', 'menu_propose']);
  const admin1 = sessions.fushatiAdmin, admin2 = sessions.fushatiAdmin2, admin3 = sessions.fushatiAdmin3, supervisor = sessions.fushatiAgent2, systemAdmin = sessions.admin.default;

  // ---- 1. What each administrator is shown ---------------------------------------------------------------------
  const one = await bootstrap(admin1, 'cafeteria administrator (a)');
  assertOnlySchool(one.text, a, 'cafeteria administrator (a) bootstrap');
  assert.deepEqual(idsOf(one.data.cafeterias), [cafe.a], 'an administrator sees only the cafeteria assigned to him');
  assert.deepEqual(idsOf(one.data.menu), [menu.a]);
  assert.deepEqual(one.data.transfers.map((entry) => entry.id), [transfer.a]);
  assert.ok(one.data.purchases.length === 1 && one.data.purchases.every((purchase) => purchase.cafeteria_id === cafe.a), 'sales of his cafeteria only');
  assert.deepEqual(one.data.schools, [], 'no list of other schools');
  assert.deepEqual(idsOf(one.data.users), [ids.agent1, ids.agent2].sort(), 'only the agents who work in his cafeteria (no administrators, nobody else\'s staff)');
  assert.ok(one.data.assignments.length >= 2 && one.data.assignments.every((entry) => entry.cafeteria_id === cafe.a), 'only the assignments in his cafeteria (the supervisor\'s assignment in cafeteria b is not shown)');

  const two = await bootstrap(admin2, 'cafeteria administrator (a and b)');
  assert.deepEqual(idsOf(two.data.cafeterias), [cafe.a, cafe.b].sort(), 'an administrator assigned to two cafeterias sees both, and not a third');
  assert.ok(!two.text.includes(legacy.marker), 'nothing of the third school');

  const three = await bootstrap(admin3, 'cafeteria administrator (nothing assigned)');
  for (const key of ['cafeterias', 'menu', 'users', 'assignments', 'transfers', 'purchases', 'schools']) assert.deepEqual(three.data[key], [], `an unassigned administrator sees no ${key}`);
  for (const school of [legacy, a, b]) assert.ok(!three.text.includes(school.marker), `an unassigned administrator sees nothing of ${school.key}`);

  const system = await bootstrap(systemAdmin, 'system administrator');
  assert.deepEqual(idsOf(system.data.cafeterias), [cafe.a, cafe.b, cafe.default].sort(), 'the system administrator reaches every cafeteria');
  assert.ok(system.data.schools.length >= 2, 'and sees the list of schools');

  // ---- 2. A supervisor has exactly the permissions granted, per cafeteria -----------------------------------------
  const sup = await bootstrap(supervisor, 'supervisor');
  assert.deepEqual(idsOf(sup.data.cafeterias), [cafe.a, cafe.b].sort());
  assert.deepEqual(sup.data.permissions, {[cafe.a]: SUPERVISOR_A, [cafe.b]: ['pos']}, 'the supervisor is told what he may do in each cafeteria');
  assert.deepEqual(sup.data.menu.map((item) => [item.cafeteria_id, item.stock_qty]).sort(), [[cafe.a, 7], [cafe.b, 0]].sort(), 'stock quantities only where inventory_view is granted');
  assert.ok(sup.data.purchases.length === 1 && sup.data.purchases[0].cafeteria_id === cafe.a, 'sales only where sales_view is granted');
  assert.deepEqual([sup.data.transfers, sup.data.users, sup.data.assignments, sup.data.schools], [[], [], [], []], 'no transfers, accounts, assignments or school list');
  const exportA = await get(supervisor, `op=export&cafeteriaId=${cafe.a}`);
  assert.equal(exportA.status, 200, `supervisor export of cafeteria a: HTTP ${exportA.status}`);
  assert.ok(exportA.text.includes('purchase-a') && !exportA.text.includes('purchase-b'), 'the export holds that cafeteria only');
  await expectStatus(get(supervisor, `op=export&cafeteriaId=${cafe.b}`), 403, 'reports is not granted in cafeteria b');
  await expectStatus(get(supervisor, `op=balances&cafeteriaId=${cafe.a}`), 403, 'balances_view is not granted anywhere');
  await expectStatus(post(supervisor, 'stock-adjust', {menuId: menu.a, delta: 1, tracked: true, threshold: 5, reason: 'correction'}), 403, 'inventory_view is not inventory_manage');
  await expectStatus(post(supervisor, 'edit-menu', {id: menu.a, name: 'xx', category: 'x', price: '1', active: true, available: true}), 403, 'menu_manage is not granted');
  await expectStatus(post(supervisor, 'review-transfer', {id: transfer.a, status: 'approved'}), 403, 'transfers_review is not granted');
  for (const [op, data] of [['set-alias', {id: cafe.a, alias: 'mine'}], ['create-user', {fullName: 'Intruder', identifier: '0512345699', role: 'fushati_agent', cafeteriaIds: [cafe.a]}], ['edit-user', {id: ids.agent1, active: false}], ['reset-user', {id: ids.agent1}], ['delete-user', {id: ids.agent1}]]) {
    await expectStatus(post(supervisor, op, data), 403, `a supervisor cannot ${op}: granting is for administrators`);
  }
  assert.equal((await first('SELECT alias FROM fushati_cafeterias WHERE id=?', cafe.a)).alias, '', 'the refused alias change was not applied');

  // ---- 3. Cafeteria management: the alias is the administrator's, everything else is the system administrator's ---
  const original = await first('SELECT name,alias,iban,bank_name,active FROM fushati_cafeterias WHERE id=?', cafe.b);
  await expectStatus(post(admin1, 'set-alias', {id: cafe.a, alias: 'Main canteen'}), 200, 'an administrator sets an alias on his cafeteria');
  assert.equal((await first('SELECT alias FROM fushati_cafeterias WHERE id=?', cafe.a)).alias, 'Main canteen');
  for (const target of [cafe.b, cafe.default]) await expectStatus(post(admin1, 'set-alias', {id: target, alias: 'Hijack'}), 403, `alias on ${target} refused`);
  assert.deepEqual(await first('SELECT name,alias,iban,bank_name,active FROM fushati_cafeterias WHERE id=?', cafe.b), original, 'the other cafeteria is unchanged');
  for (const [op, data] of [
    ['edit-cafeteria', {id: cafe.a, name: 'Renamed'}],
    ['edit-cafeteria', {id: cafe.b, iban: 'SA0000000000000000000000'}], // the account parents pay into
    ['deactivate-cafeteria', {id: cafe.a}],
    ['delete-cafeteria', {id: cafe.a}],
    ['create-cafeteria', {schoolId: a.id, name: 'Another', bankName: '', iban: '', beneficiary: ''}],
  ]) await expectStatus(post(admin1, op, data), 403, `an administrator cannot ${op}`);
  assert.equal((await first('SELECT COUNT(*) AS n FROM fushati_cafeterias')).n, 3, 'no cafeteria was created or deleted');
  assert.equal((await first('SELECT name FROM fushati_cafeterias WHERE id=?', cafe.a)).name, `${a.marker}:cafeteria`, 'the official name is unchanged');
  assert.equal((await first('SELECT iban FROM fushati_cafeterias WHERE id=?', cafe.b)).iban, '', 'the bank account is unchanged');

  // ---- 4. Data and inventory: his own cafeteria works, anybody else's is refused and untouched ---------------------
  const balances = await get(admin1, `op=balances&cafeteriaId=${cafe.a}`);
  assert.equal(balances.status, 200, `balances of his cafeteria: HTTP ${balances.status}`);
  assertOnlySchool(balances.text, a, 'balances of cafeteria a');
  const exportOwn = await get(admin1, `op=export&cafeteriaId=${cafe.a}`);
  assert.ok(exportOwn.status === 200 && exportOwn.text.includes('purchase-a') && !exportOwn.text.includes('purchase-b'), 'export of his cafeteria');
  for (const target of [cafe.b, cafe.default]) {
    await expectStatus(get(admin1, `op=balances&cafeteriaId=${target}`), 403, `balances of ${target}`);
    await expectStatus(get(admin1, `op=export&cafeteriaId=${target}`), 403, `export of ${target}`);
  }
  await expectStatus(post(admin1, 'edit-menu', {id: menu.a, name: 'Renamed item', category: 'x', price: '5', active: true, available: true}), 200, 'edit his own menu item');
  assert.equal((await first('SELECT name FROM fushati_menu_items WHERE id=?', menu.a)).name, 'Renamed item');
  await expectStatus(post(admin1, 'edit-menu', {id: menu.b, name: 'Hijacked', category: 'x', price: '5', active: true, available: true}), 403, 'edit another cafeteria\'s menu item');
  await expectStatus(post(admin1, 'delete-menu', {id: menu.b}), 403, 'delete another cafeteria\'s menu item');
  assert.equal((await first('SELECT name FROM fushati_menu_items WHERE id=?', menu.b)).name, `${b.marker}:menu`, 'the other cafeteria\'s menu item is unchanged');
  await expectStatus(post(admin1, 'stock-adjust', {menuId: menu.a, delta: 3, tracked: true, threshold: 5, reason: 'correction'}), 200, 'adjust his own stock');
  assert.equal((await first('SELECT on_hand FROM fushati_inventory WHERE menu_item_id=?', menu.a)).on_hand, 10);
  await expectStatus(post(admin1, 'stock-adjust', {menuId: menu.b, delta: 3, tracked: true, threshold: 5, reason: 'correction'}), 403, 'adjust another cafeteria\'s stock');
  assert.equal((await first('SELECT on_hand FROM fushati_inventory WHERE menu_item_id=?', menu.b)).on_hand, 7, 'the other cafeteria\'s stock is unchanged');
  await expectStatus(post(admin1, 'create-menu', {cafeteriaId: cafe.b, name: 'Intruder', category: 'x', price: '3'}), 403, 'add a product to another cafeteria');
  assert.equal((await first('SELECT COUNT(*) AS n FROM fushati_menu_items WHERE cafeteria_id=?', cafe.b)).n, 1);
  await expectStatus(post(admin1, 'review-transfer', {id: transfer.b, status: 'approved'}), 403, 'approve another cafeteria\'s transfer');
  assert.equal((await first('SELECT status FROM fushati_transfers WHERE id=?', transfer.b)).status, 'pending', 'the other cafeteria\'s transfer is still pending');
  await expectStatus(post(admin1, 'review-transfer', {id: transfer.a, status: 'approved'}), 200, 'approve his own transfer');
  // Receipts (bank transfer proofs) follow the same rule. No file store exists in the test, so his own receipt is "not found", never "forbidden".
  assert.equal((await serve(admin1, `/api/fushati/receipts?id=${transfer.b}`)).status, 403, 'another cafeteria\'s receipt is forbidden');
  assert.notEqual((await serve(admin1, `/api/fushati/receipts?id=${transfer.a}`)).status, 403, 'his own cafeteria\'s receipt is not forbidden');
  assert.equal((await serve(supervisor, `/api/fushati/receipts?id=${transfer.a}`)).status, 403, 'a supervisor without transfers_review cannot open receipts');

  // ---- 5. Staff: only the agents of his cafeterias, and a grant can never exceed them ----------------------------
  const created = await post(admin1, 'create-user', {fullName: 'New Agent', identifier: '0512345680', role: 'fushati_agent', cafeteriaIds: [cafe.a], permissions: ['pos', 'reports', 'root']});
  assert.equal(created.status, 200, `create an agent: HTTP ${created.status} ${created.text.slice(0, 160)}`);
  const newAgent = JSON.parse(created.text).id;
  assert.equal((await first('SELECT permissions FROM fushati_assignments WHERE user_id=?', newAgent)).permissions, JSON.stringify(['pos', 'reports']), 'unknown permission names are dropped');
  await expectStatus(post(admin1, 'create-user', {fullName: 'Elsewhere', identifier: '0512345681', role: 'fushati_agent', cafeteriaIds: [cafe.b]}), 403, 'create an agent for another cafeteria');
  await expectStatus(post(admin1, 'create-user', {fullName: 'Nowhere', identifier: '0512345682', role: 'fushati_agent', cafeteriaIds: []}), 400, 'an agent needs a cafeteria');
  await expectStatus(post(admin1, 'create-user', {fullName: 'Powerless', identifier: '0512345683', role: 'fushati_agent', cafeteriaIds: [cafe.a], permissions: ['root']}), 400, 'an agent needs at least one real permission');
  await expectStatus(post(admin1, 'create-user', {fullName: 'Rival', email: 'rival@example.com', role: 'fushati_admin', cafeteriaIds: [cafe.a]}), 403, 'only the system administrator creates administrators');
  assert.equal((await first("SELECT COUNT(*) AS n FROM fushati_users WHERE full_name IN ('Elsewhere','Nowhere','Powerless','Rival')")).n, 0, 'none of the refused accounts exist');

  // An agent who works in cafeteria b only is invisible and untouchable for the administrator of a.
  assert.ok(!one.data.users.some((user) => user.id === agentBOnly));
  const hashBefore = (await first('SELECT password_hash,full_name,active FROM fushati_users WHERE id=?', agentBOnly));
  for (const [op, data] of [['edit-user', {id: agentBOnly, fullName: 'Taken'}], ['reset-user', {id: agentBOnly}], ['delete-user', {id: agentBOnly}], ['edit-user', {id: agentBOnly, cafeteriaIds: [cafe.a]}]]) {
    const result = await post(admin1, op, data);
    assert.ok([403, 404].includes(result.status), `${op} on another cafeteria's agent: expected a refusal, got ${result.status}`);
  }
  assert.deepEqual(await first('SELECT password_hash,full_name,active FROM fushati_users WHERE id=?', agentBOnly), hashBefore, 'the other cafeteria\'s agent is unchanged (no password reset, no rename)');
  assert.equal((await first('SELECT COUNT(*) AS n FROM fushati_assignments WHERE user_id=? AND cafeteria_id=?', agentBOnly, cafe.a)).n, 0, 'he was not pulled into cafeteria a');
  // ... while the administrator of b may manage him.
  await expectStatus(post(admin2, 'edit-user', {id: agentBOnly, fullName: 'Renamed by his administrator'}), 200, 'the administrator of cafeteria b manages his own agent');

  // A supervisor who works in a and b: the administrator of a may change only the assignment in a, nothing else about him.
  const credentials = await first('SELECT password_hash,full_name,active FROM fushati_users WHERE id=?', ids.agent2);
  for (const [op, data] of [['reset-user', {id: ids.agent2}], ['edit-user', {id: ids.agent2, fullName: 'Taken'}], ['edit-user', {id: ids.agent2, active: false}], ['delete-user', {id: ids.agent2}]]) {
    await expectStatus(post(admin1, op, data), 409, `${op} on a shared agent`);
  }
  assert.deepEqual(await first('SELECT password_hash,full_name,active FROM fushati_users WHERE id=?', ids.agent2), credentials, 'the shared agent\'s password, name and status are untouched');
  await expectStatus(post(admin1, 'edit-user', {id: ids.agent2, cafeteriaIds: [cafe.b]}), 403, 'assign him to a cafeteria the administrator does not manage');
  await expectStatus(post(admin1, 'edit-user', {id: ids.agent2, permissions: [...SUPERVISOR_A, 'balances_view']}), 200, 'change what the supervisor may do in cafeteria a');
  assert.deepEqual(JSON.parse((await first('SELECT permissions FROM fushati_assignments WHERE user_id=? AND cafeteria_id=?', ids.agent2, cafe.a)).permissions), [...SUPERVISOR_A, 'balances_view'].sort((x, y) => ['pos', 'menu_propose', 'menu_manage', 'inventory_view', 'inventory_manage', 'sales_view', 'balances_view', 'transfers_review', 'reports'].indexOf(x) - ['pos', 'menu_propose', 'menu_manage', 'inventory_view', 'inventory_manage', 'sales_view', 'balances_view', 'transfers_review', 'reports'].indexOf(y)), 'the grant in cafeteria a changed');
  assert.deepEqual(JSON.parse((await first('SELECT permissions FROM fushati_assignments WHERE user_id=? AND cafeteria_id=?', ids.agent2, cafe.b)).permissions), ['pos'], 'the grant in cafeteria b did not change');
  await expectStatus(post(admin1, 'edit-user', {id: ids.agent2, cafeteriaIds: []}), 200, 'remove him from cafeteria a');
  assert.deepEqual((await DB.prepare('SELECT cafeteria_id FROM fushati_assignments WHERE user_id=?').bind(ids.agent2).all()).results.map((row) => row.cafeteria_id), [cafe.b], 'only the assignment in cafeteria b is left');

  // An agent who works only in a is fully his to manage; an administrator is never his to manage.
  await expectStatus(post(admin1, 'edit-user', {id: newAgent, fullName: 'Renamed Agent'}), 200, 'rename an agent of his own cafeteria');
  const reset = await post(admin1, 'reset-user', {id: newAgent});
  assert.ok(reset.status === 200 && JSON.parse(reset.text).temporaryPassword, 'reset the password of an agent of his own cafeteria');
  await expectStatus(post(admin1, 'edit-user', {id: ids.admin2, fullName: 'Taken'}), 403, 'edit another administrator');
  await expectStatus(post(admin1, 'delete-user', {id: ids.admin2}), 403, 'delete another administrator');
  await expectStatus(post(admin1, 'delete-user', {id: newAgent}), 200, 'delete an agent of his own cafeteria');

  // ---- 6. The system administrator decides who administers what ----------------------------------------------------
  await expectStatus(post(systemAdmin, 'create-user', {fullName: 'No Cafeteria', email: 'nobody@example.com', role: 'fushati_admin', cafeteriaIds: []}), 400, 'an administrator needs at least one cafeteria');
  await expectStatus(post(systemAdmin, 'edit-user', {id: ids.admin3, cafeteriaIds: [cafe.a]}), 200, 'assign an administrator to a cafeteria');
  assert.equal((await first('SELECT permissions FROM fushati_assignments WHERE user_id=? AND cafeteria_id=?', ids.admin3, cafe.a)).permissions, '["*"]');
  const admin3Session = await harness.login('/fushati-admin-login', {email: 'fushati-admin-3@example.com', password: PASSWORD}); // the change ended his old session
  const assigned = await bootstrap(admin3Session, 'administrator after assignment');
  assert.deepEqual(idsOf(assigned.data.cafeterias), [cafe.a], 'now he reaches that cafeteria, and only that one');
  await expectStatus(post(systemAdmin, 'edit-user', {id: ids.admin3, cafeteriaIds: []}), 200, 'take the assignment away again');
  const removed = await bootstrap(await harness.login('/fushati-admin-login', {email: 'fushati-admin-3@example.com', password: PASSWORD}), 'administrator after removal');
  assert.deepEqual(removed.data.cafeterias, [], 'and he reaches nothing again');
  await expectStatus(post(systemAdmin, 'edit-cafeteria', {id: cafe.b, name: 'Renamed by the system administrator'}), 200, 'the system administrator renames a cafeteria');
  assert.equal((await first('SELECT name FROM fushati_cafeterias WHERE id=?', cafe.b)).name, 'Renamed by the system administrator');

  console.log('Cafeteria access model passed: administrators limited to assigned cafeterias, alias only, grants per cafeteria, staff and receipts scoped, system administrator in charge.');
} finally {
  await harness.close();
}
