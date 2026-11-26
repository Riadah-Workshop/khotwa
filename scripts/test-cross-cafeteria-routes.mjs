// Cross-school isolation, layer 5: the cafeteria (Fushati) module.
//
// Unlike the school data, cafeteria data is NOT in per-school tables. It lives in
// shared fushati_* tables, and "who sees what" is decided in application code
// (cafesFor, permittedCafeteria, permittedStudent), so the table rewriting that the
// other isolation tests rely on does not protect it. This test pins the rules:
//
//   cafeteria agent   only the cafeterias they are assigned to; no admin operations
//   cafeteria admin   see test-cafeteria-access-model.mjs
//   parent            only the children linked to them, and only those children's cafeterias
//   school manager    a read-only summary of their own school's cafeterias
//
// Three schools each have one cafeteria with a marked menu item, account, purchase
// and bank transfer. The agent is assigned to school a's cafeteria only.
import assert from 'node:assert/strict';
import {assertOnlySchool, createHarness} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB} = harness;
  const a = schoolByKey.a, b = schoolByKey.b;

  const {cafe, menu, transfer, student, assign} = await seedCafeterias({DB, seeded, schoolByKey});
  await assign(harness.fushatiIds.agent1, cafe.a, ['pos', 'menu_propose']);

  for (const school of [a, b]) assert.equal(seeded[school.id].students.phone, `05${school.digits}`, 'the seeded child belongs to the parent of its school');

  const get = async (cookie, query) => { const response = await serve(cookie, `/api/fushati?${query}`); return {status: response.status, text: await response.text()}; };
  const post = async (cookie, op, data) => { const response = await serve(cookie, '/api/fushati', {method: 'POST', body: {op, data}}); return {status: response.status, text: await response.text()}; };
  const ids = (list) => list.map((entry) => entry.id).sort();
  const count = async (sql, ...params) => (await DB.prepare(sql).bind(...params).first()).n;

  // ---- cafeteria agent (assigned to school a's cafeteria only) ------------------------------------------------
  const agent = sessions.fushatiAgent;
  const boot = await get(agent, 'op=bootstrap');
  assert.equal(boot.status, 200, `agent bootstrap: HTTP ${boot.status} ${boot.text.slice(0, 200)}`);
  assertOnlySchool(boot.text, a, 'cafeteria agent bootstrap');
  const data = JSON.parse(boot.text);
  assert.deepEqual(ids(data.cafeterias), [cafe.a], 'the agent sees only the cafeteria they are assigned to');
  assert.deepEqual(ids(data.menu), [menu.a], 'the agent sees only that cafeteria\'s menu');
  assert.deepEqual([data.purchases, data.transfers, data.users, data.assignments, data.schools], [[], [], [], [], []], 'an ordinary agent receives no sales, transfers, user list, assignments or school list');
  assert.deepEqual(data.permissions, {[cafe.a]: ['pos', 'menu_propose']}, 'the agent is told what he may do, in his cafeteria only');

  // Administration is closed to agents, for their own cafeteria as much as for another one.
  for (const target of [cafe.a, cafe.b, cafe.default]) {
    assert.equal((await get(agent, `op=balances&cafeteriaId=${target}`)).status, 403, `agent balances ${target}`);
    assert.equal((await get(agent, `op=export&cafeteriaId=${target}`)).status, 403, `agent export ${target}`);
  }
  const beforeName = await DB.prepare('SELECT name FROM fushati_menu_items WHERE id=?').bind(menu.b).first();
  assert.equal((await post(agent, 'edit-menu', {id: menu.b, name: 'hijacked', category: 'x', price: '1', active: true, available: true})).status, 403, 'agent cannot edit another cafeteria\'s menu');
  assert.equal((await post(agent, 'delete-menu', {id: menu.b})).status, 403, 'agent cannot delete another cafeteria\'s menu');
  assert.equal((await post(agent, 'review-transfer', {id: transfer.b, status: 'approved'})).status, 403, 'agent cannot approve another cafeteria\'s transfer');
  assert.deepEqual(await DB.prepare('SELECT name FROM fushati_menu_items WHERE id=?').bind(menu.b).first(), beforeName, 'the other cafeteria\'s menu item is unchanged');
  assert.equal(await count("SELECT COUNT(*) AS n FROM fushati_transfers WHERE id=? AND status='pending'", transfer.b), 1, 'the other cafeteria\'s transfer is still pending');
  // The one write an agent has (propose a menu item) works for their cafeteria and only theirs.
  assert.equal((await post(agent, 'create-menu', {cafeteriaId: cafe.b, name: 'intruder', category: 'x'})).status, 403, 'agent cannot add to another cafeteria');
  assert.equal(await count('SELECT COUNT(*) AS n FROM fushati_menu_items WHERE cafeteria_id=?', cafe.b), 1, 'nothing was added to the other cafeteria');
  const own = await post(agent, 'create-menu', {cafeteriaId: cafe.a, name: 'proposal', category: 'x'});
  assert.equal(own.status, 200, `agent adds to their own cafeteria: HTTP ${own.status} ${own.text.slice(0, 160)}`);
  assert.equal(await count('SELECT COUNT(*) AS n FROM fushati_menu_items WHERE cafeteria_id=?', cafe.a), 2, 'the proposal was added to their own cafeteria');

  // ---- parents: only their own children's cafeterias ------------------------------------------------------------
  for (const [who, mine, other] of [['a', a, b], ['b', b, a]]) {
    const cookie = sessions.parent[who];
    const home = await get(cookie, 'op=bootstrap');
    assert.equal(home.status, 200, `parent ${who} bootstrap: HTTP ${home.status} ${home.text.slice(0, 160)}`);
    assertOnlySchool(home.text, mine, `parent ${who} bootstrap`);
    const own = await get(cookie, `op=menu&cafeteriaId=${cafe[mine.key]}&studentId=${student[mine.key]}`);
    assert.equal(own.status, 200, `parent ${who} reads their own child's menu: HTTP ${own.status}`);
    assert.ok(own.text.includes(`${mine.marker}:menu`), `parent ${who} sees the menu of their child's cafeteria`);
    for (const op of ['menu', 'qr', 'history']) {
      // the other school's cafeteria with the other school's child, and a mix of both
      for (const [cafeteria, child] of [[cafe[other.key], student[other.key]], [cafe[mine.key], student[other.key]], [cafe[other.key], student[mine.key]], [cafe.default, student.default]]) {
        const response = await get(cookie, `op=${op}&cafeteriaId=${cafeteria}&studentId=${child}`);
        assert.equal(response.status, 403, `parent ${who} ${op} cafeteria ${cafeteria} child ${child}: expected 403, got ${response.status}`);
        assert.ok(!response.text.includes(other.marker), `parent ${who} ${op}: the refusal leaks the other school`);
      }
    }
    const rotate = await post(cookie, 'rotate-card', {cafeteriaId: cafe[other.key], studentId: student[other.key]});
    assert.equal(rotate.status, 403, `parent ${who} cannot rotate the card of another school's child`);
    const nonceBefore = await count("SELECT COUNT(*) AS n FROM fushati_accounts WHERE card_nonce<>'' AND id=?", `acct-${other.key}`);
    assert.equal(nonceBefore, 0, 'the other school\'s card was not touched');
  }
  const cardOwn = await post(sessions.parent.a, 'rotate-card', {cafeteriaId: cafe.a, studentId: student.a});
  assert.equal(cardOwn.status, 200, `a parent can rotate their own child's card: HTTP ${cardOwn.status} ${cardOwn.text.slice(0, 160)}`);

  // ---- school managers: a read-only summary of their own school ------------------------------------------------
  for (const school of [a, b]) {
    const summary = await get(sessions.manager[school.key], 'op=manager-summary');
    assert.equal(summary.status, 200, `manager ${school.key} cafeteria summary: HTTP ${summary.status}`);
    assertOnlySchool(summary.text, school, `manager ${school.key} cafeteria summary`);
  }

  console.log('Cafeteria isolation passed: agent limited to the assigned cafeteria and to proposing menu items, administration closed to agents, parents limited to their own children, managers limited to their own school.');
} finally {
  await harness.close();
}
