// The ratchet decides whether new type/lint errors may merge, so its parsing and comparison are tested.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compare, eslintLinesFor, parseEslintJson, parseTscOutput, tscLinesFor} from './ratchet.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// tsc output: counts per file, ignoring continuation lines and other noise.
const tsc = parseTscOutput([
  "app/a.tsx(7,89): error TS2345: Argument of type 'X' is not assignable.",
  "app/a.tsx(10,2): error TS18046: 'v' is of type 'unknown'.",
  "  Type 'unknown' is not assignable to type 'string'.",
  "lib/b.ts(1,1): error TS5097: An import path can only end with a '.ts' extension.",
  'Found 3 errors in 2 files.',
  '',
].join('\n'));
assert.deepEqual(tsc, {'app/a.tsx': 2, 'lib/b.ts': 1});

// eslint JSON: absolute paths become repo-relative; files without errors are dropped; warnings do not count.
const lint = parseEslintJson(JSON.stringify([
  {filePath: path.join(root, 'app', 'c.tsx'), errorCount: 3, warningCount: 1},
  {filePath: path.join(root, 'lib', 'd.ts'), errorCount: 0, warningCount: 9},
]));
assert.deepEqual(lint, {'app/c.tsx': 3});

// compare: more errors in an existing file, or any error in a new file, is worse; fewer is better; equal is neutral.
const baseline = {'app/a.tsx': 2, 'lib/b.ts': 1, 'lib/old.ts': 4};
let result = compare({'app/a.tsx': 2, 'lib/b.ts': 1, 'lib/old.ts': 4}, baseline);
assert.deepEqual(result, {worse: [], better: []}, 'unchanged counts pass');

result = compare({'app/a.tsx': 3, 'lib/b.ts': 1, 'lib/old.ts': 4}, baseline);
assert.deepEqual(result.worse, [{file: 'app/a.tsx', count: 3, allowed: 2}], 'one more error in a file fails');

result = compare({'app/a.tsx': 2, 'lib/b.ts': 1, 'lib/old.ts': 4, 'app/new.tsx': 1}, baseline);
assert.deepEqual(result.worse, [{file: 'app/new.tsx', count: 1, allowed: 0}], 'an error in a previously clean file fails');

result = compare({'app/a.tsx': 2, 'lib/b.ts': 1, 'lib/old.ts': 1}, baseline);
assert.deepEqual(result.worse, []);
assert.deepEqual(result.better, [{file: 'lib/old.ts', count: 1, allowed: 4}], 'fewer errors are reported so the baseline can be lowered');

result = compare({'app/a.tsx': 2}, baseline);
assert.deepEqual(result.better.map((entry) => entry.file), ['lib/b.ts', 'lib/old.ts'], 'a file with all errors fixed counts as better');

result = compare({'app/a.tsx': 1, 'app/z.tsx': 2}, baseline);
assert.equal(result.worse.length, 1, 'fixing one file never excuses breaking another');

console.log('Ratchet passed: tsc and eslint parsing, per-file comparison, new-file and regression detection, improvement reporting.');

// A failed check shows the errors of the file that got worse, with continuation lines, and nothing from other files.
const tscOutput = ["app/a.tsx(7,89): error TS2345: Argument of type 'X' is not assignable.", "  Type 'unknown' is not assignable to type 'string'.", "lib/b.ts(1,1): error TS5097: An import path can only end with a '.ts' extension.", "app/a.tsx(10,2): error TS18046: 'v' is of type 'unknown'.", ''].join('\n');
assert.deepEqual(tscLinesFor(tscOutput, 'app/a.tsx'), ["app/a.tsx(7,89): error TS2345: Argument of type 'X' is not assignable.", "  Type 'unknown' is not assignable to type 'string'.", "app/a.tsx(10,2): error TS18046: 'v' is of type 'unknown'."]);
assert.deepEqual(tscLinesFor(tscOutput, 'lib/b.ts'), ["lib/b.ts(1,1): error TS5097: An import path can only end with a '.ts' extension."]);
assert.deepEqual(tscLinesFor(tscOutput, 'app/none.ts'), []);
const eslintOutput = JSON.stringify([{filePath: path.join(root, 'app', 'c.tsx'), errorCount: 1, warningCount: 1, messages: [{severity: 2, line: 4, column: 9, ruleId: 'no-unused-vars', message: 'x is unused'}, {severity: 1, line: 5, column: 1, ruleId: 'warn-rule', message: 'only a warning'}]}]);
assert.deepEqual(eslintLinesFor(eslintOutput, 'app/c.tsx'), ['app/c.tsx:4:9 no-unused-vars: x is unused']);
console.log('Ratchet error details passed.');
