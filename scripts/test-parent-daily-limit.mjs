// The parent's quick daily-limit change (op "set-daily-limit"), through the real gateway and route on a real database.
//   - only a parent linked to that child may change it, and only the daily limit changes
//   - the same limits as the full settings form (0 to SAR 100), every refusal leaves the old value
//   - the change is audited, and the till (the ledger trigger) enforces the new limit at once
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const {cafe, student} = await seedCafeterias({DB, seeded, schoolByKey});
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  const post = async (cookie, op, data) => {
    const response = await serve(cookie, '/api/fushati', {method: 'POST', body: {op, data}});
    const text = await response.text();
    return {status: response.status, json: text.startsWith('{') ? JSON.parse(text) : null, text};
  };
  const limit = (key = 'a') => rows('SELECT daily_limit_minor d, monthly_limit_minor m, allowed_item_ids ids, active FROM fushati_accounts WHERE cafeteria_id=? AND student_id=?', cafe[key], student[key]).then((r) => r[0]);
  const parentA = sessions.parent.a;
  const change = (value, key = 'a', cookie = parentA) => post(cookie, 'set-daily-limit', {cafeteriaId: cafe[key], studentId: student[key], dailyLimit: value});

  // A parent who already set the full form: monthly limit, a product list, purchases allowed.
  await DB.prepare("UPDATE fushati_accounts SET monthly_limit_minor=20000, allowed_item_ids=?, active=1 WHERE cafeteria_id=? AND student_id=?").bind(JSON.stringify([`menu-${cafe.a}`]), cafe.a, student.a).run();
  const before = await limit();
  assert.equal(before.d, 300, 'the default daily limit is SAR 3');

  // ---- 1. The change, and only the change ---------------------------------------------------------------------------------------
  const ok = await change('10');
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual([ok.json.ok, ok.json.dailyLimitMinor], [true, 1000]);
  const after = await limit();
  assert.deepEqual([after.d, after.m, after.ids, after.active], [1000, 20000, before.ids, 1], 'only the daily limit changed: monthly limit, allowed products and the purchase switch are as they were');
  assert.equal((await change('7.5')).json.dailyLimitMinor, 750, 'half riyals');
  assert.equal((await change(5)).json.dailyLimitMinor, 500, 'a number works as well as text');
  assert.equal((await change('0')).status, 200, 'zero is allowed: it blocks purchases');
  assert.equal((await limit()).d, 0);
  assert.equal((await change('100')).status, 200, 'SAR 100 is the most');
  assert.equal((await limit()).d, 10000);

  // ---- 2. Every refusal leaves the old value -------------------------------------------------------------------------------------
  await change('12');
  for (const bad of ['101', '100.01', '-1', 'abc', '', '1e3', '12 SAR', '007', '7.555', null, {x: 1}]) {
    const r = await change(bad);
    assert.ok(r.status === 400, `refused: ${JSON.stringify(bad)} -> ${r.status} ${r.text.slice(0, 80)}`);
    assert.equal((await limit()).d, 1200, `unchanged after ${JSON.stringify(bad)}`);
  }
  assert.equal((await post(parentA, 'set-daily-limit', {cafeteriaId: 'not-a-uuid', studentId: student.a, dailyLimit: '5'})).status, 400);
  assert.equal((await post(parentA, 'set-daily-limit', {cafeteriaId: cafe.a, studentId: student.a})).status, 400, 'no limit given');

  // ---- 3. Who may -----------------------------------------------------------------------------------------------------------------
  const otherParents = Object.entries(sessions.parent).filter(([key]) => key !== 'a');
  assert.ok(otherParents.length >= 1, 'the harness has other parents');
  for (const [key, cookie] of otherParents) {
    assert.equal((await change('1', 'a', cookie)).status, 403, `parent ${key} cannot change another family's child (or one at another school)`);
  }
  assert.equal((await change('1', 'b')).status, 403, "a parent cannot reach another school's cafeteria");
  assert.equal((await change('1', 'default')).status, 403, 'nor the default school');
  for (const [who, cookie] of [['a school agent', sessions.deputy.a], ['a manager', sessions.manager.a], ['the system administrator', sessions.admin.default], ['a cafeteria administrator', sessions.fushatiAdmin], ['a cafeteria agent', sessions.fushatiAgent]]) {
    const r = await change('1', 'a', cookie);
    assert.ok([401, 403].includes(r.status), `${who} cannot: ${r.status}`);
  }
  assert.equal((await post('', 'set-daily-limit', {cafeteriaId: cafe.a, studentId: student.a, dailyLimit: '1'})).status, 401, 'signed out');
  assert.equal((await limit()).d, 1200, 'nothing changed by the refused attempts');
  await DB.prepare('UPDATE fushati_cafeterias SET active=0 WHERE id=?').bind(cafe.a).run();
  assert.equal((await change('3')).status, 403, 'a suspended cafeteria accepts no changes');
  await DB.prepare('UPDATE fushati_cafeterias SET active=1 WHERE id=?').bind(cafe.a).run();

  // ---- 4. Audited ------------------------------------------------------------------------------------------------------------------
  const audit = (await rows("SELECT operation, target_type, detail FROM fushati_audit WHERE operation='parent-daily-limit' ORDER BY rowid"));
  assert.ok(audit.length >= 5, 'each change is recorded');
  assert.deepEqual([audit[0].target_type, audit[0].detail], ['account', '300->1000'], 'what it was and what it became');

  // ---- 5. The till enforces it at once ----------------------------------------------------------------------------------------------
  await DB.prepare("UPDATE fushati_accounts SET allowed_item_ids='[]' WHERE cafeteria_id=? AND student_id=?").bind(cafe.a, student.a).run();
  await change('10');
  const account = (await rows('SELECT id FROM fushati_accounts WHERE cafeteria_id=? AND student_id=?', cafe.a, student.a))[0].id;
  const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
  const sell = (amountMinor, ref) => DB.prepare("INSERT INTO fushati_ledger(id,account_id,amount_minor,entry_type,reference_id,description,day_key,month_key,created_at) VALUES(?,?,?,'purchase',?,'sale',?,?,?)").bind(`l-${ref}`, account, -amountMinor, ref, day, month, new Date().toISOString()).run();
  await sell(600, 'p1');
  await assert.rejects(sell(500, 'p2'), /FUSHATI_DAILY_LIMIT/, 'SAR 6 + SAR 5 is over a limit of SAR 10');
  await change('11');
  await sell(500, 'p3');
  await assert.rejects(sell(100, 'p4'), /FUSHATI_DAILY_LIMIT/, 'SAR 11 spent is SAR 11 of 11: nothing more');
  await change('12');
  await sell(100, 'p5');
  assert.equal((await rows('SELECT spent_day_minor s FROM fushati_accounts WHERE id=?', account))[0].s, 1200, 'raising the limit lets the child spend more today');

  // ---- 6. The screen uses it ---------------------------------------------------------------------------------------------------------
  const read = (file) => fs.readFileSync(file, 'utf8');
  const parent = read('app/parent/fushati-parent.tsx');
  assert.ok(parent.includes('<QuickLimit') && parent.indexOf('<QuickLimit') < parent.indexOf('<Tabs idPrefix="fsp"'), 'the quick limit is above the tabs: no tab to open at the school gate');
  assert.ok(parent.includes("op: 'set-daily-limit'") && !/set-daily-limit[^}]*monthlyLimit/.test(parent), 'the quick change sends the daily limit and nothing else');
  assert.ok(parent.includes('<TransferForm') && !parent.includes('onSubmit={transfer}'), 'the receipt form is the new one');
  const form = read('app/parent/transfer-form.tsx');
  assert.ok(form.includes('type="file"') && form.includes('accept={RECEIPT_TYPES.join'), 'one file picker with the accepted formats');
  assert.ok(!/type="file"[^>]*required/.test(form), 'the hidden picker is not "required" (the browser could not show its message on a hidden field)');
  assert.ok(form.includes('prepareReceipt'), 'a big picture is prepared before it is sent');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(form + read('app/parent/quick-limit.tsx')), 'no browser popups');

  console.log('Parent daily limit passed: only a linked parent changes only the daily limit; 0 to SAR 100; every refusal keeps the old value; audited; the till enforces it at once; the screen has it above the tabs.');
} finally {
  await harness.close();
}
