#!/usr/bin/env node
// Cafeteria screens: inventory helpers (app/fushati/stock-ui.ts) and report helpers (app/fushati/report-ui.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5}}).outputText)(exports);
  return exports;
}
const s = load('app/fushati/stock-ui.ts');
const r = load('app/fushati/report-ui.ts');

const item = (over) => ({id: 'x', name: 'عصير', category: 'مشروبات', priceMinor: 300, active: true, available: true, tracked: true, onHand: 10, threshold: 5, costMinor: 200, updatedAt: '', sold30d: 0, status: 'ok', ...over});

// --- stock status: colour and words ---------------------------------------------------------------
assert.deepEqual(['ok', 'low', 'out', 'untracked'].map(s.statusTone), ['green', 'amber', 'red', 'slate']);
assert.equal(s.statusLabel('low', true), 'Low');
assert.equal(s.statusLabel('out', false), 'نفد');
assert.equal(s.statusLabel('weird', true), 'weird', 'an unknown status is shown as it came');

// --- the list shows what needs action first ------------------------------------------------------------
{
  const sorted = s.sortForAttention([item({name: 'b', status: 'ok'}), item({name: 'z', status: 'untracked', tracked: false}), item({name: 'c', status: 'low'}), item({name: 'a', status: 'out'}), item({name: 'a2', status: 'ok'})]);
  assert.deepEqual(sorted.map(i => i.name), ['a', 'c', 'a2', 'b', 'z']);
  const input = [item({name: 'q', status: 'ok'}), item({name: 'p', status: 'out'})];
  s.sortForAttention(input);
  assert.deepEqual(input.map(i => i.name), ['q', 'p'], 'the list passed in is not reordered');
}

// --- tiles: counts and the value of the stock on hand --------------------------------------------------
{
  const sum = s.summarize([item({onHand: 10, costMinor: 200}), item({status: 'low', onHand: 3, costMinor: 100}), item({status: 'out', onHand: 0, costMinor: 500}), item({tracked: false, status: 'untracked', onHand: 99, costMinor: 100}), item({onHand: 4, costMinor: null})]);
  assert.deepEqual(sum, {tracked: 4, low: 1, out: 1, untracked: 1, valueMinor: 2300, withoutCost: 1});
  assert.equal(s.summarize([]).valueMinor, 0);
}

// --- recording stock: the preview and the check use the same rule as the server ---------------------------
assert.equal(s.afterMove(10, 'receipt', 5), 15);
assert.equal(s.afterMove(10, 'return', 1), 11);
assert.equal(s.afterMove(10, 'waste', 4), 6);
assert.equal(s.afterMove(10, 'waste', 11), null, 'more than is on hand cannot be removed');
assert.equal(s.afterMove(10, 'stocktake', 3), 3, 'a count becomes the stock');
assert.equal(s.afterMove(10, 'stocktake', 0), 0, 'a count of zero is allowed');
assert.equal(s.afterMove(10, 'receipt', 0), null);
assert.equal(s.afterMove(10, 'receipt', 1.5), null);
assert.equal(s.afterMove(10, 'bogus', 1), null);
assert.equal(s.moveProblem(10, 'damage', 11), 'insufficient');
assert.equal(s.moveProblem(10, 'damage', 10), null);
assert.equal(s.moveProblem(10, 'receipt', 0), 'quantity');
assert.equal(s.moveProblem(10, 'stocktake', 0), null);
assert.equal(s.moveProblem(10, 'receipt', 100001), 'quantity');
assert.equal(s.moveProblem(10, 'receipt', -1), 'quantity');
assert.equal(s.MOVE_KINDS.length, 6);
for (const kind of s.MOVE_KINDS) assert.ok(kind.label.ar && kind.label.en && kind.hint.ar && kind.hint.en, `${kind.kind} has both languages`);

// --- days of stock left --------------------------------------------------------------------------------------
assert.equal(s.daysOfCover({tracked: true, onHand: 30, sold30d: 60}), 15);
assert.equal(s.daysOfCover({tracked: true, onHand: 30, sold30d: 0}), null, 'nothing sold: no estimate');
assert.equal(s.daysOfCover({tracked: false, onHand: 30, sold30d: 60}), null);
assert.equal(s.daysOfCover({tracked: true, onHand: 0, sold30d: 60}), 0);

// --- history names --------------------------------------------------------------------------------------------
assert.equal(s.movementLabel('purchase', true), 'Sale');
assert.equal(s.movementLabel('expired', false), 'منتهي الصلاحية');
assert.equal(s.movementLabel('new-kind', true), 'new-kind');

// --- typed amounts ----------------------------------------------------------------------------------------------
assert.equal(s.costInput('12.5'), '12.5');
assert.equal(s.costInput('١٢٫٥'), '12.5', 'Arabic digits and the Arabic decimal mark are understood');
assert.equal(s.costInput(' 3,50 '), '3.50');
assert.equal(s.costInput(''), '');
assert.equal(s.costInput('abc'), null);
assert.equal(s.costInput('1.234'), null, 'more than two decimals is not an amount');
assert.equal(s.costInput('-5'), null);
assert.equal(s.money(1245090), '12,450.90');
assert.equal(s.saudiTime('2026-11-26T11:05:00.000Z'), '2026-11-26 14:05', 'Saudi time is UTC+3');
assert.equal(s.saudiTime('not a date'), 'not a date');

// === reports ===========================================================================================================
const col = (key, type, extra = {}) => ({key, type, label: {ar: key, en: key}, ...extra});
assert.equal(r.formatCell(1245090, col('t', 'money'), true), '12,450.90');
assert.equal(r.formatCell(12.34, col('p', 'percent'), true), '12.3%');
assert.equal(r.formatCell(150, col('m', 'minutes'), true), '2 h 30 min');
assert.equal(r.formatCell(150, col('m', 'minutes'), false), '2 س 30 د');
assert.equal(r.formatCell(45, col('m', 'minutes'), true), '45 min');
assert.equal(r.formatCell(120, col('m', 'minutes'), true), '2 h');
assert.equal(r.formatCell(null, col('x', 'money'), true), '—', 'no value is a dash, not zero');
assert.equal(r.formatCell(undefined, col('x', 'text'), true), '—');
assert.equal(r.formatCell('low', col('s', 'enum', {values: {low: {ar: 'منخفض', en: 'Low'}}}), false), 'منخفض');
assert.equal(r.formatCell('unknown', col('s', 'enum', {values: {}}), true), 'unknown');
assert.equal(r.formatCell('2026-11-26T11:05:00Z', col('d', 'datetime'), true), '2026-11-26 14:05');
assert.equal(r.formatCell('=cmd', col('t', 'text'), true), '=cmd', 'on screen text is shown as it is (the CSV file neutralises formulas on the server)');
assert.equal(r.isNumeric(col('a', 'money')) && r.isNumeric(col('a', 'minutes')) && !r.isNumeric(col('a', 'text')) && !r.isNumeric(col('a', 'datetime')), true);

const catalog = [
  {id: 'sales-daily', group: 'sales', needs: 'sales_view', dated: true, title: {ar: 'a', en: 'a'}, description: {ar: 'a', en: 'a'}, columns: []},
  {id: 'low-stock', group: 'stock', needs: 'inventory_view', dated: false, title: {ar: 'b', en: 'b'}, description: {ar: 'b', en: 'b'}, columns: []},
  {id: 'topups', group: 'money', needs: 'balances_view', dated: true, title: {ar: 'c', en: 'c'}, description: {ar: 'c', en: 'c'}, columns: []},
];
const cafes = [{id: 'c1', label: 'A', active: true, reports: ['sales-daily', 'low-stock']}, {id: 'c2', label: 'B', active: true, reports: ['low-stock']}];
assert.deepEqual(r.reportsFor(catalog, cafes, 'c1').map(x => x.id), ['sales-daily', 'low-stock']);
assert.deepEqual(r.reportsFor(catalog, cafes, 'c2').map(x => x.id), ['low-stock'], 'a cafeteria only offers what its grant allows');
assert.deepEqual(r.reportsFor(catalog, cafes, 'all').map(x => x.id), ['sales-daily', 'low-stock'], '"all" offers what at least one cafeteria allows, and not what none does');
assert.deepEqual(r.reportsFor(catalog, cafes, 'nope'), []);
assert.deepEqual(r.groupReports(catalog).map(g => g.group.id), ['sales', 'money', 'stock'], 'groups appear in a fixed order and empty groups are left out');

assert.equal(r.rangeProblem('2026-11-01', '2026-11-26'), null);
assert.equal(r.rangeProblem('2026-11-26', '2026-11-01'), 'order');
assert.equal(r.rangeProblem('2026-02-30', '2026-03-01'), 'date', 'a day that does not exist');
assert.equal(r.rangeProblem('', '2026-03-01'), 'date');
assert.equal(r.rangeProblem('2025-11-25', '2026-11-26'), 'long', '366 days apart is too long, like on the server');
assert.equal(r.rangeProblem('2025-11-26', '2026-11-26'), null, '365 days apart is the longest allowed');

assert.equal(r.reportUrl('sales-daily', 'all', '2026-11-01', '2026-11-26'), '/api/fushati/reports?op=run&report=sales-daily&cafeteriaId=all&from=2026-11-01&to=2026-11-26');
assert.ok(r.reportUrl('margin', 'abc', '2026-11-01', '2026-11-26', {format: 'csv', lang: 'en'}).endsWith('&format=csv&lang=en'));
assert.ok(!r.reportUrl('x&y', 'a b', '2026-11-01', '2026-11-26').includes('x&y'), 'values are encoded into the query');

{
  const run = {columns: [col('day', 'text'), col('orders', 'int'), col('total', 'money')], totals: {orders: 12, total: 5000}};
  assert.deepEqual(r.headline(run), {column: run.columns[2], value: 5000}, 'money is the headline when there is a money total');
  assert.equal(r.headline({columns: run.columns, totals: null}), null);
  assert.equal(r.headline({columns: [col('orders', 'int')], totals: {orders: 7}}).value, 7);
  assert.equal(r.headline({columns: [col('name', 'text')], totals: {name: 'x'}}), null);
}
for (const group of r.GROUPS) assert.ok(group.label.ar && group.label.en && group.description.ar && group.description.en);
console.log('ok: cafeteria inventory and report helpers');
