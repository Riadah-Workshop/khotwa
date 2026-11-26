#!/usr/bin/env node
// "Ratchet" for checks that already have errors (typecheck, lint).
//
//   node scripts/ratchet.mjs typecheck
//   node scripts/ratchet.mjs lint
//   node scripts/ratchet.mjs lint --update    # record the current counts as the new baseline
//
// The codebase has existing TypeScript and ESLint errors, so a plain
// `tsc`/`eslint` gate would be red from day one and get ignored. Instead,
// scripts/ratchet-baseline.json records how many errors each file has today.
// The check fails when ANY file has MORE errors than its baseline (including
// a file that had none), so no new debt can be added, and it tells you when
// counts have dropped so the baseline can be lowered and the gain locked in.

import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'ratchet-baseline.json');

const toRelative = (file) => path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');

/** tsc --pretty false prints `path(line,col): error TSxxxx: message`. */
export function parseTscOutput(output) {
  const counts = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+:/);
    if (match) {
      const file = toRelative(match[1]);
      counts[file] = (counts[file] || 0) + 1;
    }
  }
  return counts;
}

/** eslint --format json prints one entry per file with errorCount. */
export function parseEslintJson(output) {
  const counts = {};
  for (const entry of JSON.parse(output)) {
    if (entry.errorCount > 0) counts[toRelative(entry.filePath)] = entry.errorCount;
  }
  return counts;
}

/** The tsc lines (with their continuation lines) that belong to one file, so a failed check can say what is wrong. */
export function tscLinesFor(output, file) {
  const lines = [];
  let inFile = false;
  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+:/);
    if (match) inFile = toRelative(match[1]) === file;
    else if (!/^\s/.test(line)) inFile = false;
    if (inFile) lines.push(line);
  }
  return lines;
}

/** One line per error of one file from eslint --format json. */
export function eslintLinesFor(output, file) {
  const lines = [];
  for (const entry of JSON.parse(output)) {
    if (toRelative(entry.filePath) !== file) continue;
    for (const message of entry.messages) if (message.severity === 2) lines.push(`${file}:${message.line}:${message.column} ${message.ruleId || 'error'}: ${message.message}`);
  }
  return lines;
}

/** Files that got worse, and files that got better, compared with the baseline. */
export function compare(current, baseline) {
  const worse = [];
  const better = [];
  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file] || 0;
    if (count > allowed) worse.push({file, count, allowed});
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = current[file] || 0;
    if (count < allowed) better.push({file, count, allowed});
  }
  const byFile = (a, b) => a.file.localeCompare(b.file);
  return {worse: worse.sort(byFile), better: better.sort(byFile)};
}

const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);

const CHECKS = {
  typecheck: {
    title: 'TypeScript',
    command: ['tsc', ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json']],
    parse: (result) => {
      const counts = parseTscOutput(result.stdout);
      // Exit code 2 with nothing parsed means tsc itself broke (bad config, crash).
      if (result.status !== 0 && total(counts) === 0) {
        throw new Error(`tsc failed without reporting errors:\n${(result.stdout + result.stderr).slice(0, 2000)}`);
      }
      return counts;
    },
  },
  lint: {
    title: 'ESLint',
    command: ['eslint', ['.', '--ignore-pattern', 'dist', '--ignore-pattern', '.next', '--format', 'json']],
    parse: (result) => {
      try {
        return parseEslintJson(result.stdout);
      } catch {
        throw new Error(`eslint did not produce JSON (exit ${result.status}):\n${(result.stderr || result.stdout).slice(0, 2000)}`);
      }
    },
  },
};

function annotate(level, file, message) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const escape = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::${level} file=${escape(file)}::${escape(message)}`);
}

function main(argv) {
  const [name, ...flags] = argv;
  const check = CHECKS[name];
  if (!check || flags.some((flag) => flag !== '--update')) {
    console.error('Usage: node scripts/ratchet.mjs <typecheck|lint> [--update]');
    return 2;
  }

  const [bin, args] = check.command;
  const executable = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${bin}.cmd` : bin);
  if (!existsSync(executable)) {
    console.error(`${bin} is not installed. Run: corepack pnpm install --frozen-lockfile`);
    return 2;
  }
  const result = spawnSync(executable, args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: process.platform === 'win32'});
  if (result.error) {
    console.error(`could not run ${bin}: ${result.error.message}`);
    return 2;
  }

  let current;
  try {
    current = check.parse(result);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const baselines = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : {};
  if (flags.includes('--update')) {
    baselines[name] = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_FILE, `${JSON.stringify(Object.fromEntries(Object.entries(baselines).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`);
    console.log(`${check.title}: baseline updated to ${total(current)} error(s) in ${Object.keys(current).length} file(s).`);
    return 0;
  }

  const baseline = baselines[name] || {};
  const {worse, better} = compare(current, baseline);
  console.log(`${check.title}: ${total(current)} error(s) in ${Object.keys(current).length} file(s); baseline allows ${total(baseline)}.`);

  if (better.length > 0) {
    const fixed = better.reduce((sum, entry) => sum + (entry.allowed - entry.count), 0);
    console.log(`\n${fixed} fewer error(s) than the baseline in ${better.length} file(s). Lock that in:  node scripts/ratchet.mjs ${name} --update`);
    for (const entry of better) console.log(`  ${entry.file}: ${entry.count} (baseline ${entry.allowed})`);
  }
  if (worse.length > 0) {
    console.log(`\nNew ${check.title} errors (these files have more errors than the baseline):`);
    for (const entry of worse) {
      console.log(`  ${entry.file}: ${entry.count} (baseline ${entry.allowed})`);
      // Say what the errors are: nobody can run the checks on a phone, and the log is where the author looks.
      try {
        for (const line of name === 'lint' ? eslintLinesFor(result.stdout, entry.file) : tscLinesFor(result.stdout, entry.file)) console.log(`    ${line}`);
      } catch {
        // The counts above are enough if the output cannot be read again.
      }
      annotate('error', entry.file, `${check.title}: ${entry.count} error(s), baseline allows ${entry.allowed}. Run \`corepack pnpm ${name === 'lint' ? 'lint' : 'typecheck'}\` locally for details.`);
    }
    console.log(`\nFix the new errors, or run \`corepack pnpm ${name === 'lint' ? 'lint' : 'typecheck'}\` to see them in full. Do not raise the baseline to hide them.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
