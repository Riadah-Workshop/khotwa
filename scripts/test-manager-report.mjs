#!/usr/bin/env node
// School manager dashboard: the labels, chart geometry and CSV export (app/manager/manager-logic.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5}}).outputText)(exports);
  return exports;
}
const m = load('app/manager/manager-logic.ts');

// Attendance statuses are shown as words in the reader's language, with a status colour; unknown values stay readable.
assert.equal(m.attendanceName('present', false), 'حاضر');
assert.equal(m.attendanceName('late', true), 'Late');
assert.equal(m.attendanceName('absent', true), 'Absent');
assert.equal(m.attendanceName('excused', true), 'excused', 'a status the screen does not know is shown as stored, not hidden');
assert.deepEqual(['present', 'late', 'absent', 'other'].map(m.attendanceTone), ['green', 'amber', 'red', 'slate']);

// Ranked bars: largest first, widths relative to the largest, shares add up to the whole.
{
  const rows = m.rankedBars([{name: 'b', value: 10}, {name: 'a', value: 30}, {name: 'zero', value: 0}, {name: 'c', value: 60}]);
  assert.deepEqual(rows.map(r => r.name), ['c', 'a', 'b'], 'ranked largest first and rows with no value are left out');
  assert.deepEqual(rows.map(r => r.width), [100, 50, 17]);
  assert.deepEqual(rows.map(r => r.share), [60, 30, 10]);
  assert.equal(m.rankedBars([{name: 'tiny', value: 1}, {name: 'huge', value: 5000}]).find(r => r.name === 'tiny').width, 2, 'a small value is still a visible bar');
  assert.deepEqual(m.rankedBars([]), []);
  const input = [{name: 'x', value: 1}, {name: 'y', value: 2}];
  m.rankedBars(input);
  assert.deepEqual(input.map(i => i.name), ['x', 'y'], 'the data passed in is not reordered');
}

// Column heights: relative to the tallest; a month with cases is never drawn as nothing.
assert.deepEqual(m.trendColumns([{month: '2026-09', value: 4}, {month: '2026-10', value: 8}, {month: '2026-11', value: 0}]).map(c => c.height), [50, 100, 0]);
assert.equal(m.trendColumns([{month: '2026-09', value: 1}, {month: '2026-10', value: 500}])[0].height, 3);
assert.deepEqual(m.trendColumns([]), []);
// A quiet month is drawn as an empty column instead of vanishing from the trend.
{
  const cols = m.trendColumns([{month: '2026-06', value: 38}, {month: '2026-09', value: 64}], {from: '2026-05-15', to: '2026-10-02'});
  assert.deepEqual(cols.map(c => c.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(cols.map(c => c.value), [0, 38, 0, 0, 64, 0]);
  assert.deepEqual(cols.map(c => c.height), [0, 59, 0, 0, 100, 0]);
  assert.deepEqual(m.trendColumns([{month: '2026-11', value: 3}], {from: '2026-11-01', to: '2026-11-30'}).map(c => c.month), ['2026-11']);
  assert.deepEqual(m.monthsBetween('2025-11-27', '2026-11-26').length, 13, 'a full year spans thirteen calendar months');
  assert.deepEqual(m.monthsBetween('2026-12-01', '2027-02-01'), ['2026-12', '2027-01', '2027-02'], 'across the new year');
  assert.deepEqual(m.monthsBetween('bad', '2026-01-01'), []);
  assert.deepEqual(m.trendColumns([{month: '2026-12', value: 2}], {from: '2026-10-01', to: '2026-11-30'}).map(c => c.month), ['2026-10', '2026-11', '2026-12'], 'a month the database returns is never dropped');
}

assert.equal(m.monthLabel('2026-11', true), 'Nov 26');
assert.equal(m.monthLabel('not-a-month', true), 'not-a-month');
assert.ok(/26/.test(m.monthLabel('2026-11', false)), 'the Arabic label shows the (Gregorian) year');
assert.equal(m.formatMoney(12345), '123.45');
assert.equal(m.formatMoney(1245090), '12,450.90', 'thousands are grouped');
assert.equal(m.formatMoney(Number.NaN), '0.00');
assert.equal(m.sumValues([{name: 'a', value: 2}, {name: 'b', value: 3}]), 5);

// CSV: quoting, a spreadsheet cannot run a cell as a formula, and the file follows the screen language.
assert.equal(m.csvCell('a"b'), '"a""b"');
assert.equal(m.csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
for (const risky of ['+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) assert.ok(m.csvCell(risky).startsWith('"\''), `${JSON.stringify(risky)} is neutralised`);
assert.equal(m.csvCell(-5), '"-5"', 'a real negative number is left alone');
assert.equal(m.csvCell(null), '""');
{
  const data = {schoolName: 'مدرسة الأمل', schoolCode: 'A1', students: 412, openFollowups: 7, from: '2026-11-01', to: '2026-11-26',
    grades: [{name: 'الأول', value: 30}], attendance: [{name: 'late', value: 5}, {name: 'present', value: 90}], categories: [{name: '=cmd|x', value: 2}], trend: [{month: '2026-11', value: 2}]};
  const ar = m.buildReportCsv(data, false);
  const en = m.buildReportCsv(data, true);
  assert.ok(ar.startsWith('﻿'), 'the BOM makes Excel read the Arabic as UTF-8');
  assert.ok(ar.includes('"المدرسة","مدرسة الأمل"') && ar.includes('"الحضور والغياب","حضر متأخرًا","5"'), 'the Arabic file uses Arabic headings');
  assert.ok(ar.includes('حضر متأخرًا') && !ar.includes('"late"'), 'attendance is written as words, not as stored codes');
  assert.ok(en.includes('"School","مدرسة الأمل"') && en.includes('"Attendance","Late","5"'));
  assert.ok(en.includes(`"'=cmd|x"`), 'a case type that looks like a formula is neutralised in the file');
  assert.ok(en.split('\r\n').length === 12, 'one line per record');
  assert.equal(m.reportFileName(data), 'khotwa-manager-report-2026-11-01-2026-11-26.csv');
}
console.log('ok: manager report labels, chart geometry and CSV');
