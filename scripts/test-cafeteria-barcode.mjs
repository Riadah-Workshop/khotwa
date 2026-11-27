// Cafeteria barcodes, through the real gateway and route handlers on a real database.
//
//   - the barcode rules: digits from Arabic keyboards, scanner noise, the check digit of EAN-8 / UPC-A / EAN-13
//   - a known barcode needs only a quantity; an unknown one is added once, with its name, and then it is known
//   - the same barcode cannot be given to two items of one cafeteria, but two cafeterias may use the same one
//   - who may look a barcode up, add a product by scanning, and add stock: the same grants as by hand
//   - a repeated request (double tap, a phone that retries) adds the stock once
//   - another cafeteria's products answer exactly like products that do not exist
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHarness} from './support/school-harness.mjs';
import {seedCafeterias} from './support/cafeteria-seed.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const rules = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/fushati/barcode.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5}}).outputText)(rules);

// ---- 1. The rules (known real codes: Stabilo EAN-13, a GS1 EAN-8, the UPC-A of the GS1 specification) ----------------
assert.equal(rules.normalizeBarcode(' 4006381333931\n'), '4006381333931', 'scanner line ends and spaces are dropped');
assert.equal(rules.normalizeBarcode('٤٠٠٦٣٨١٣٣٣٩٣١'), '4006381333931', 'Arabic-Indic digits are accepted');
assert.equal(rules.normalizeBarcode('۴۰۰۶۳۸۱۳۳۳۹۳۱'), '4006381333931', 'Persian digits are accepted');
assert.equal(rules.normalizeBarcode('4006-3813 33931'), '4006381333931', 'dashes and spaces inside are dropped');
assert.equal(rules.normalizeBarcode('cafe-12ab'), 'CAFE12AB', 'letters are upper-cased');
assert.equal(rules.normalizeBarcode(undefined), '');
assert.equal(rules.normalizeBarcode(12345), '', 'only text is accepted');
for (const good of ['4006381333931', '96385074', '036000291452']) assert.equal(rules.barcodeProblem(good), null, `${good} is valid`);
for (const bad of ['4006381333932', '96385075', '036000291453']) assert.equal(rules.barcodeProblem(bad), 'checksum', `${bad} has a wrong check digit`);
assert.equal(rules.barcodeProblem(''), 'empty');
assert.equal(rules.barcodeProblem('123'), 'format', 'too short');
assert.equal(rules.barcodeProblem('A'.repeat(33)), 'format', 'too long');
assert.equal(rules.barcodeProblem('KITCHEN1'), null, 'a cafeteria label has no check digit');
assert.equal(rules.barcodeProblem('12345'), null, 'a code of another length is not checked');
assert.ok(rules.barcodeMessage('checksum', 'ar') !== rules.barcodeMessage('checksum', 'en'), 'both languages have a message');

const harness = await createHarness();
try {
  const {sessions, schoolByKey, seeded, serve, DB, fushatiIds: ids} = harness;
  const {cafe, menu, assign} = await seedCafeterias({DB, seeded, schoolByKey});

  const read = async (response) => { const text = await response.text(); return {status: response.status, text, json: text.startsWith('{') ? JSON.parse(text) : null}; };
  const lookup = (cookie, cafeteriaId, code) => serve(cookie, `/api/fushati/inventory?op=barcode&cafeteriaId=${cafeteriaId}&code=${encodeURIComponent(code)}`).then(read);
  const scan = (cookie, data) => serve(cookie, '/api/fushati/inventory', {method: 'POST', body: {op: 'scan', data: {requestId: nextRequest(), quantity: 0, ...data}}}).then(read);
  const menuPost = (cookie, op, data) => serve(cookie, '/api/fushati', {method: 'POST', body: {op, data}}).then(read);
  const first = (sql, ...params) => DB.prepare(sql).bind(...params).first();
  const rows = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;
  let counter = 0;
  const nextRequest = () => `d0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

  const admin1 = sessions.fushatiAdmin, admin2 = sessions.fushatiAdmin2, agent1 = sessions.fushatiAgent, agent2 = sessions.fushatiAgent2, system = sessions.admin.default;
  // admin1 runs cafeteria a, admin2 runs cafeteria b.
  // agent1 may only sell (no menu or stock grant). agent2 may propose products in a (and nothing else there).
  await assign(ids.admin1, cafe.a, ['*']);
  await assign(ids.admin2, cafe.b, ['*']);
  await assign(ids.agent1, cafe.a, ['pos']);
  await assign(ids.agent2, cafe.a, ['pos', 'menu_propose']);
  const EAN = '4006381333931', EAN2 = '96385074', UPC = '036000291452';
  const itemByCode = (cafeteriaId, code) => first('SELECT m.*,i.tracked,i.on_hand,i.cost_minor FROM fushati_menu_items m JOIN fushati_inventory i ON i.menu_item_id=m.id WHERE m.cafeteria_id=? AND m.barcode=?', cafeteriaId, code);

  // ---- 2. Who may look a barcode up ------------------------------------------------------------------------------
  assert.equal((await lookup(sessions.parent.a, cafe.a, EAN)).status, 403, 'a parent is refused');
  assert.equal((await lookup(sessions.manager.a, cafe.a, EAN)).status, 403, 'a school manager is refused');
  assert.equal((await lookup(agent1, cafe.a, EAN)).status, 403, 'an agent who only sells has nothing to do with barcodes');
  assert.equal((await lookup(admin1, cafe.b, EAN)).status, 403, 'the administrator of another cafeteria is refused');
  assert.equal((await lookup(admin1, '99999999-0000-4000-8000-000000000001', EAN)).status, 403, 'an unknown cafeteria is refused the same way');
  assert.equal((await lookup(admin1, 'not-a-uuid', EAN)).status, 400);
  assert.equal((await lookup(admin1, cafe.a, '4006381333932')).status, 400, 'a wrong check digit is refused');
  assert.equal((await lookup(admin1, cafe.a, '12')).status, 400, 'a code that is too short is refused');
  const nothing = await lookup(admin1, cafe.a, EAN);
  assert.equal(nothing.status, 200, nothing.text);
  assert.deepEqual([nothing.json.found, nothing.json.item, nothing.json.barcode], [false, null, EAN]);
  assert.deepEqual(nothing.json.can, {create: true, price: true, stock: true, viewStock: true});
  const proposer = await lookup(agent2, cafe.a, EAN);
  assert.equal(proposer.status, 200, proposer.text);
  assert.deepEqual(proposer.json.can, {create: true, price: false, stock: false, viewStock: false}, 'a proposer may add a product, not price it or change stock');
  assert.equal((await lookup(system, cafe.b, EAN)).status, 200, 'the system administrator can open any cafeteria');

  // ---- 3. An unknown barcode is added once, with its name; then it is known ------------------------------------------
  const noName = await scan(admin1, {cafeteriaId: cafe.a, barcode: EAN, quantity: 12});
  assert.equal(noName.status, 404, 'an unknown barcode needs the product details');
  assert.equal(noName.json.code, 'unknown_barcode');
  assert.equal(await itemByCode(cafe.a, EAN), null, 'nothing was created');
  const added = await scan(admin1, {cafeteriaId: cafe.a, barcode: ` ${EAN}\n`, quantity: 12, cost: '1.25', product: {name: 'Juice 200ml', category: 'عصائر', price: '2.50'}});
  assert.equal(added.status, 200, added.text);
  assert.deepEqual([added.json.created, added.json.pending, added.json.received, added.json.onHand], [true, false, 12, 12]);
  const juice = await itemByCode(cafe.a, EAN);
  assert.deepEqual([juice.name, juice.price_minor, juice.active, juice.available, juice.tracked, juice.on_hand, juice.cost_minor], ['Juice 200ml', 250, 1, 1, 1, 12, 125], 'on sale, tracked, with the received quantity and cost');
  assert.equal((await rows('SELECT * FROM fushati_stock_movements WHERE menu_item_id=?', juice.id)).length, 1, 'one receipt in the history');

  // Next time: only the quantity.
  const known = await lookup(admin1, cafe.a, EAN);
  assert.equal(known.json.found, true);
  assert.deepEqual([known.json.item.name, known.json.item.priceMinor, known.json.item.onHand, known.json.item.tracked], ['Juice 200ml', 250, 12, true]);
  const more = await scan(admin1, {cafeteriaId: cafe.a, barcode: EAN, quantity: 24});
  assert.equal(more.status, 200, more.text);
  assert.deepEqual([more.json.created, more.json.received, more.json.onHand], [false, 24, 36]);
  assert.equal((await itemByCode(cafe.a, EAN)).cost_minor, 125, 'no cost given: the cost price is left as it was');

  // A double tap or a retry adds the stock once.
  const same = nextRequest();
  const first1 = await scan(admin1, {cafeteriaId: cafe.a, barcode: EAN, quantity: 5, requestId: same});
  const second = await scan(admin1, {cafeteriaId: cafe.a, barcode: EAN, quantity: 5, requestId: same});
  assert.deepEqual([first1.json.duplicate, second.json.duplicate, second.json.onHand], [false, true, 41], 'the repeat is recognised and adds nothing');
  assert.equal((await itemByCode(cafe.a, EAN)).on_hand, 41);

  // A product that is known but whose stock was never tracked starts tracking on the first scan.
  const untrackedId = '10000000-0000-4000-8000-0000000000b1';
  await DB.prepare('INSERT INTO fushati_menu_items(id,cafeteria_id,name,category,price_minor,active,available,created_by,created_at,barcode) VALUES(?,?,?,?,?,1,1,?,?,?)').bind(untrackedId, cafe.a, 'Water', 'Drinks', 100, ids.admin1, '2026-11-02T08:00:00.000Z', UPC).run();
  assert.equal((await first('SELECT tracked FROM fushati_inventory WHERE menu_item_id=?', untrackedId)).tracked, 0);
  const water = await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: 6});
  assert.equal(water.status, 200, water.text);
  assert.deepEqual([(await itemByCode(cafe.a, UPC)).tracked, (await itemByCode(cafe.a, UPC)).on_hand], [1, 6], 'tracking is switched on and the quantity counted');
  assert.equal((await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: 0})).json.received, 0, 'quantity 0 only confirms the product');
  assert.equal((await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: 1.5})).status, 400, 'whole units only');
  assert.equal((await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: -3})).status, 400);
  assert.equal((await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: 100001})).status, 400);
  assert.equal((await scan(admin1, {cafeteriaId: cafe.a, barcode: UPC, quantity: 2, cost: 'abc'})).status, 400, 'a cost that is not money is refused');
  assert.equal((await itemByCode(cafe.a, UPC)).on_hand, 6, 'refused requests changed nothing');

  // ---- 4. A proposer adds products but does not price them or count stock ---------------------------------------------
  const proposed = await scan(agent2, {cafeteriaId: cafe.a, barcode: EAN2, quantity: 0, product: {name: 'Chips', category: 'سناك', price: '9.99'}});
  assert.equal(proposed.status, 200, proposed.text);
  assert.deepEqual([proposed.json.created, proposed.json.pending], [true, true]);
  const chips = await itemByCode(cafe.a, EAN2);
  assert.deepEqual([chips.price_minor, chips.active, chips.tracked, chips.on_hand], [0, 0, 0, 0], 'the price the proposer typed is ignored; the product waits for approval and is not on sale');
  const noStock = await scan(agent2, {cafeteriaId: cafe.a, barcode: EAN2, quantity: 10});
  assert.equal(noStock.status, 403, 'a proposer may not change stock');
  assert.equal(noStock.json.code, 'stock_forbidden');
  assert.equal((await itemByCode(cafe.a, EAN2)).on_hand, 0);
  const proposeAndStock = await scan(agent2, {cafeteriaId: cafe.a, barcode: '5449000000996', quantity: 4, product: {name: 'Cola', category: 'مشروبات'}});
  assert.equal(proposeAndStock.status, 403, 'a proposer cannot count stock, not even when the same scan adds the product');
  assert.equal(proposeAndStock.json.created, true, 'the product itself was added (the refusal says so) …');
  assert.equal((await itemByCode(cafe.a, '5449000000996')).on_hand, 0, '… with no stock');
  assert.equal((await scan(agent1, {cafeteriaId: cafe.a, barcode: '4000000000006', product: {name: 'Xy', category: 'Yz'}})).status, 403, 'an agent who only sells cannot add products by scanning');
  assert.equal((await scan(sessions.parent.a, {cafeteriaId: cafe.a, barcode: EAN2})).status, 403, 'a parent cannot scan');
  const approved = await menuPost(admin1, 'edit-menu', {id: chips.id, name: 'Chips', category: 'سناك', price: '3', active: true, available: true});
  assert.equal(approved.status, 200, approved.text);
  assert.equal((await itemByCode(cafe.a, EAN2)).barcode, EAN2, 'approving (editing without a barcode) keeps the barcode');
  const withStock = await scan(admin1, {cafeteriaId: cafe.a, barcode: EAN2, quantity: 10});
  assert.deepEqual([withStock.json.onHand, withStock.json.created], [10, false], 'the administrator then receives the stock of the proposed product');

  // ---- 5. One code, one item in a cafeteria; the same code may exist in another cafeteria -----------------------------------
  const clash = await menuPost(admin1, 'create-menu', {cafeteriaId: cafe.a, name: 'Other juice', category: 'عصائر', price: '1', barcode: EAN});
  assert.equal(clash.status, 409, 'the same barcode on a second item of one cafeteria is refused');
  const clashBy = await menuPost(admin1, 'create-menu', {cafeteriaId: cafe.a, name: 'Other juice', category: 'عصائر', price: '1', barcode: ` ${EAN}\n`});
  assert.equal(clashBy.status, 409, 'scanner noise does not get past the check');
  assert.equal((await rows('SELECT id FROM fushati_menu_items WHERE cafeteria_id=? AND name=?', cafe.a, 'Other juice')).length, 0, 'the refused item was not created');
  assert.equal((await menuPost(admin1, 'create-menu', {cafeteriaId: cafe.a, name: 'Bad', category: 'x', price: '1', barcode: '4006381333932'})).status, 400, 'a wrong check digit is refused when adding by hand too');
  const other = await scan(admin2, {cafeteriaId: cafe.b, barcode: EAN, quantity: 3, product: {name: 'Juice B', category: 'عصائر', price: '2'}});
  assert.equal(other.status, 200, 'cafeteria b may use the same barcode');
  assert.notEqual(other.json.id, juice.id);
  assert.equal((await itemByCode(cafe.a, EAN)).on_hand, 41, "b's scan did not touch a's stock");
  assert.equal((await lookup(admin1, cafe.a, EAN)).json.item.name, 'Juice 200ml', 'each cafeteria sees only its own product for the code');
  assert.equal((await lookup(admin2, cafe.b, EAN)).json.item.name, 'Juice B');
  assert.ok(!(await lookup(admin1, cafe.a, EAN)).text.includes('Juice B'), "a's answer says nothing about b's product");
  assert.equal((await scan(admin1, {cafeteriaId: cafe.b, barcode: EAN, quantity: 1})).status, 403, "a's administrator cannot add stock to b");
  assert.equal((await itemByCode(cafe.b, EAN)).on_hand, 3);

  // ---- 6. Editing a product keeps, changes or clears its barcode -------------------------------------------------------
  const change = await menuPost(admin1, 'edit-menu', {id: juice.id, name: 'Juice 200ml', category: 'عصائر', price: '2.50', active: true, available: true, barcode: EAN2});
  assert.equal(change.status, 409, "a barcode that belongs to another item of the cafeteria cannot be taken");
  const clear = await menuPost(admin1, 'edit-menu', {id: juice.id, name: 'Juice 200ml', category: 'عصائر', price: '2.50', active: true, available: true, barcode: ''});
  assert.equal(clear.status, 200, clear.text);
  assert.equal((await first('SELECT barcode FROM fushati_menu_items WHERE id=?', juice.id)).barcode, null, 'an empty barcode clears it');
  const reuse = await menuPost(admin1, 'create-menu', {cafeteriaId: cafe.a, name: 'Juice again', category: 'عصائر', price: '2', barcode: EAN});
  assert.equal(reuse.status, 200, 'a cleared code can be given to another item');
  assert.equal((await menuPost(admin1, 'edit-menu', {id: menu.b, name: 'xx', category: 'yy', price: '1', active: true, available: true, barcode: '5449000000996'})).status, 403, "a's administrator cannot edit b's product");

  // ---- 7. The audit trail and the backup know about it ------------------------------------------------------------------
  const audited = (await rows("SELECT operation,COUNT(*) n FROM fushati_audit WHERE operation IN ('create-menu','stock-receipt') GROUP BY operation")).reduce((all, row) => ({...all, [row.operation]: row.n}), {});
  assert.ok(audited['create-menu'] >= 3 && audited['stock-receipt'] >= 4, 'adding products and receiving stock by scan are audited');
  const backup = await serve(system, '/api/fushati/backup').then(read);
  assert.equal(backup.status, 200);
  assert.ok(backup.text.includes('"barcode"') && backup.text.includes(EAN), 'the cafeteria backup carries the barcodes');

  console.log('Cafeteria barcodes passed: codes are cleaned and check-digit tested; a known barcode needs only a quantity and an unknown one is added once; one code per item in a cafeteria, shared across cafeterias; lookups and scans follow the same grants as by hand; a repeated request adds stock once; another cafeteria answers like nothing; the backup carries the codes.');
} finally {
  await harness.close();
}
