#!/usr/bin/env node
// Runs every scripts/test-*.{mjs,cjs,py} and exits non-zero when a test fails.
//
//   pnpm test                      run everything
//   pnpm test -- --only fushati    only tests whose file name contains "fushati"
//   node scripts/run-tests.mjs --list
//
// Tests are independent scripts, so each runs in its own process. They run in
// parallel (default 4) with a per-test timeout, and the repo root is the
// working directory because the tests read project files by relative path.
//
// scripts/known-failing-tests.json lists tests that are known to fail, with a
// reason. A listed test that fails is reported as XFAIL and does not fail the
// run. A listed test that passes is reported as XPASS and DOES fail the run, so
// the list shrinks as tests are fixed instead of hiding regressions forever.

import {spawn} from 'node:child_process';
import {appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_OUTPUT_CHARS = 1_000_000;
const TEST_FILE = /^test-.+\.(mjs|cjs|py)$/;
const IN_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

function usage(message) {
  if (message) console.error(`run-tests: ${message}\n`);
  console.error(`Usage: node scripts/run-tests.mjs [options]

  --only <text>     only run tests whose file name contains <text> (repeatable)
  --jobs <n>        tests to run at once (default ${defaultJobs()})
  --timeout <sec>   per-test timeout in seconds (default 180)
  --list            print the tests that would run and exit
  --json <file>     also write machine-readable results to <file>
  --dir <dir>       directory to scan (default: scripts/)
  --known <file>    known-failing list (default: scripts/known-failing-tests.json)`);
  process.exit(2);
}

function defaultJobs() {
  return Math.max(1, Math.min(4, os.availableParallelism()));
}

function parseArgs(argv) {
  const options = {
    dir: path.join(ROOT, 'scripts'),
    known: path.join(ROOT, 'scripts', 'known-failing-tests.json'),
    jobs: defaultJobs(),
    timeoutSeconds: 180,
    only: [],
    list: false,
    json: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) usage(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--only') options.only.push(value());
    else if (arg === '--jobs') options.jobs = Number(value());
    else if (arg === '--timeout') options.timeoutSeconds = Number(value());
    else if (arg === '--json') options.json = path.resolve(value());
    else if (arg === '--dir') options.dir = path.resolve(value());
    else if (arg === '--known') options.known = path.resolve(value());
    else if (arg === '--list') options.list = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--') continue;
    else usage(`unknown option ${arg}`);
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1) usage('--jobs must be a whole number >= 1');
  if (!(options.timeoutSeconds > 0)) usage('--timeout must be a positive number of seconds');
  return options;
}

function discover({dir, only}) {
  if (!existsSync(dir)) usage(`directory not found: ${dir}`);
  return readdirSync(dir)
    .filter((name) => TEST_FILE.test(name))
    .filter((name) => only.length === 0 || only.some((text) => name.includes(text)))
    .sort();
}

function loadKnownFailing(file) {
  if (!existsSync(file)) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    usage(`${file} is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    usage(`${file} must be an object of {"test-file-name": "reason"}`);
  }
  for (const [name, reason] of Object.entries(parsed)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      usage(`${file}: "${name}" needs a non-empty reason`);
    }
  }
  return new Map(Object.entries(parsed));
}

function commandFor(dir, name) {
  const file = path.join(dir, name);
  if (name.endsWith('.mjs')) {
    return [process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', file]];
  }
  if (name.endsWith('.cjs')) return [process.execPath, [file]];
  return [process.env.PYTHON || 'python3', [file]];
}

const liveChildren = new Set();

function killTree(child) {
  try {
    // Tests that start Miniflare spawn workerd children; kill the whole group.
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of liveChildren) killTree(child);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

function runOne({dir, name, timeoutSeconds}) {
  const started = Date.now();
  const [command, args] = commandFor(dir, name);
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({name, ms: Date.now() - started, output, ...result});
    };
    const child = spawn(command, args, {
      cwd: ROOT,
      env: {...process.env, CI: process.env.CI || 'true', NO_COLOR: '1'},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    liveChildren.add(child);
    const collect = (chunk) => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk;
    };
    child.stdout.setEncoding('utf8').on('data', collect);
    child.stderr.setEncoding('utf8').on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutSeconds * 1000);
    child.on('error', (error) => {
      liveChildren.delete(child);
      output += `could not start ${command}: ${error.message}\n`;
      finish({passed: false, timedOut: false, exitCode: null});
    });
    child.on('close', (exitCode, signal) => {
      liveChildren.delete(child);
      if (timedOut) output += `\nTimed out after ${timeoutSeconds}s and was killed.\n`;
      else if (signal) output += `\nKilled by signal ${signal}.\n`;
      finish({passed: exitCode === 0 && !timedOut, timedOut, exitCode});
    });
  });
}

async function runPool(names, limit, worker) {
  const results = new Array(names.length);
  let next = 0;
  const lanes = Array.from({length: Math.min(limit, names.length)}, async () => {
    while (next < names.length) {
      const index = next++;
      results[index] = await worker(names[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}

// A failing test almost always prints the reason last, so keep the tail.
function tail(text, lines = 30, maxChars = 4000) {
  const kept = text.trimEnd().split('\n').slice(-lines).join('\n');
  return kept.length > maxChars ? `…${kept.slice(-maxChars)}` : kept;
}

// Turns "Cannot find module 'wrangler/package.json'" into a hint that says what to do.
function missingDependencyHint(output) {
  const match = output.match(/Cannot find (?:module|package) '([^'.][^']*)'/);
  if (!match) return null;
  const packageName = match[1].startsWith('@') ? match[1].split('/').slice(0, 2).join('/') : match[1].split('/')[0];
  return `dependency "${packageName}" is not installed (run the install step first)`;
}

function annotation(level, file, title, message) {
  const escapeData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = (text) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
  console.log(`::${level} file=${escapeProperty(file)},title=${escapeProperty(title)}::${escapeData(message)}`);
}

function classify(result, known) {
  if (known.has(result.name)) return result.passed ? 'xpass' : 'xfail';
  return result.passed ? 'pass' : result.timedOut ? 'timeout' : 'fail';
}

const LABEL = {pass: 'PASS ', fail: 'FAIL ', timeout: 'TIME ', xfail: 'XFAIL', xpass: 'XPASS'};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const known = loadKnownFailing(options.known);
  const names = discover(options);

  if (names.length === 0) usage('no tests found');
  if (options.list) {
    for (const name of names) console.log(known.has(name) ? `${name}  (known failing)` : name);
    return 0;
  }

  // A stale entry would silently stop protecting anything, so refuse it.
  const allNames = new Set(readdirSync(options.dir));
  const stale = [...known.keys()].filter((name) => !allNames.has(name));
  if (stale.length > 0) {
    console.error(`run-tests: known-failing list names tests that do not exist: ${stale.join(', ')}`);
    return 2;
  }

  console.log(`Running ${names.length} test(s), ${Math.min(options.jobs, names.length)} at a time, ${options.timeoutSeconds}s timeout each.\n`);
  const startedAll = Date.now();
  const results = await runPool(names, options.jobs, async (name) => {
    const result = await runOne({dir: options.dir, name, timeoutSeconds: options.timeoutSeconds});
    result.status = classify(result, known);
    result.hint = result.passed ? null : missingDependencyHint(result.output);
    console.log(`${LABEL[result.status]} ${name} (${(result.ms / 1000).toFixed(1)}s)`);
    return result;
  });

  const count = (status) => results.filter((result) => result.status === status).length;
  const unexpected = results.filter((result) => ['fail', 'timeout', 'xpass'].includes(result.status));

  for (const result of results.filter((entry) => ['fail', 'timeout', 'xfail'].includes(entry.status))) {
    const expected = result.status === 'xfail';
    const heading = `${expected ? 'Known failing' : 'Failed'}: ${result.name}${result.hint ? ` — ${result.hint}` : ''}`;
    if (IN_GITHUB_ACTIONS) console.log(`::group::${heading}`);
    else console.log(`\n----- ${heading}`);
    if (expected) console.log(`(known failing: ${known.get(result.name)})`);
    console.log(tail(result.output, 60, 8000));
    if (IN_GITHUB_ACTIONS) console.log('::endgroup::');
    if (IN_GITHUB_ACTIONS && !expected) {
      annotation('error', `scripts/${result.name}`, `${result.status === 'timeout' ? 'Test timed out' : 'Test failed'}: ${result.name}`, `${result.hint ? `${result.hint}\n` : ''}${tail(result.output)}`);
    }
  }
  for (const result of results.filter((entry) => entry.status === 'xpass')) {
    const message = `${result.name} now passes — remove it from scripts/known-failing-tests.json`;
    console.log(`\n${message}`);
    if (IN_GITHUB_ACTIONS) annotation('error', 'scripts/known-failing-tests.json', 'Known-failing test now passes', message);
  }

  const seconds = ((Date.now() - startedAll) / 1000).toFixed(1);
  console.log(`\n${count('pass')} passed, ${count('fail') + count('timeout')} failed, ${count('xfail')} known failing, ${count('xpass')} unexpectedly passing — ${results.length} total in ${seconds}s`);

  if (options.json) {
    const report = results.map(({name, status, ms, exitCode, hint}) => ({name, status, ms, exitCode, hint}));
    writeFileSync(options.json, JSON.stringify({total: results.length, results: report}, null, 2));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.filter((result) => result.status !== 'pass').map((result) => `| ${result.name} | ${result.status} | ${result.hint || ''} |`);
    const lines = [
      '### Tests',
      '',
      `${count('pass')} passed, ${count('fail') + count('timeout')} failed, ${count('xfail')} known failing, ${count('xpass')} unexpectedly passing (${results.length} total, ${seconds}s)`,
      '',
      ...(rows.length > 0 ? ['| Test | Result | Note |', '| --- | --- | --- |', ...rows, ''] : []),
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  return unexpected.length === 0 ? 0 : 1;
}

process.exitCode = await main();
