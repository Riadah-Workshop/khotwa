// The test runner is the merge gate, so it gets its own tests: a runner that
// reports "all green" when something failed would be worse than no runner.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-tests.mjs');
const workspace = mkdtempSync(path.join(tmpdir(), 'khotwa-runner-'));
let caseNumber = 0;

function scenario(files, {known = null, args = []} = {}) {
  const dir = path.join(workspace, `case-${++caseNumber}`);
  mkdirSync(dir);
  for (const [name, source] of Object.entries(files)) writeFileSync(path.join(dir, name), source);
  const knownFile = path.join(dir, 'known.json');
  if (known) writeFileSync(knownFile, JSON.stringify(known));
  const result = spawnSync(process.execPath, [runner, '--dir', dir, '--known', knownFile, '--jobs', '2', ...args], {
    encoding: 'utf8',
    env: {...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: ''},
    timeout: 60_000,
  });
  return {status: result.status, out: `${result.stdout}${result.stderr}`};
}

const PASS = 'process.exit(0);';
const FAIL = 'console.error("boom: expected 1 to equal 2");process.exit(1);';

try {
  let run = scenario({'test-a.mjs': PASS, 'test-b.mjs': PASS});
  assert.equal(run.status, 0, 'all passing tests give exit 0');
  assert.match(run.out, /2 passed, 0 failed/);

  run = scenario({'test-a.mjs': PASS, 'test-b.mjs': FAIL});
  assert.equal(run.status, 1, 'one failing test gives exit 1');
  assert.match(run.out, /FAIL\s+test-b\.mjs/);
  assert.match(run.out, /boom: expected 1 to equal 2/, 'the failure output is shown');
  assert.match(run.out, /1 passed, 1 failed/);

  run = scenario({'test-a.mjs': PASS, 'test-b.mjs': FAIL}, {known: {'test-b.mjs': 'needs a fixture'}});
  assert.equal(run.status, 0, 'a known-failing test that fails does not fail the run');
  assert.match(run.out, /XFAIL\s+test-b\.mjs/);
  assert.match(run.out, /needs a fixture/, 'the reason is printed next to the output');

  run = scenario({'test-a.mjs': PASS}, {known: {'test-a.mjs': 'was broken'}});
  assert.equal(run.status, 1, 'a known-failing test that passes fails the run so the list gets pruned');
  assert.match(run.out, /XPASS\s+test-a\.mjs/);
  assert.match(run.out, /remove it from scripts\/known-failing-tests\.json/);

  run = scenario({'test-a.mjs': PASS}, {known: {'test-gone.mjs': 'deleted long ago'}});
  assert.equal(run.status, 2, 'a stale known-failing entry is refused');
  assert.match(run.out, /test-gone\.mjs/);

  run = scenario({'test-a.mjs': PASS}, {known: {'test-a.mjs': '   '}});
  assert.equal(run.status, 2, 'a known-failing entry needs a reason');

  run = scenario({'test-hang.mjs': 'setInterval(()=>{},1000);'}, {args: ['--timeout', '1']});
  assert.equal(run.status, 1, 'a hanging test fails the run');
  assert.match(run.out, /TIME\s+test-hang\.mjs/);
  assert.match(run.out, /Timed out after 1s/);

  run = scenario({'test-dep.mjs': 'await import("definitely-not-installed-package-xyz");'});
  assert.equal(run.status, 1);
  assert.match(run.out, /dependency "definitely-not-installed-package-xyz" is not installed/, 'missing packages are named');

  run = scenario({'test-alpha.mjs': PASS, 'test-beta.mjs': FAIL}, {args: ['--only', 'alpha']});
  assert.equal(run.status, 0, '--only runs just the matching tests');
  assert.match(run.out, /1 passed/);

  run = scenario({'test-alpha.mjs': PASS, 'helper.mjs': FAIL, 'notes.txt': 'x'});
  assert.equal(run.status, 0, 'only test-*.mjs/cjs/py files are treated as tests');
  assert.match(run.out, /1 passed/);

  run = scenario({'helper.mjs': PASS});
  assert.equal(run.status, 2, 'an empty directory is a mistake, not a pass');

  console.log('Test runner passed: pass/fail exit codes, known-failing (XFAIL/XPASS) handling, stale and unexplained entries, timeouts, missing-package hints, --only filter and file discovery.');
} finally {
  rmSync(workspace, {recursive: true, force: true});
}
