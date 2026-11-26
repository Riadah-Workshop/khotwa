#!/usr/bin/env node
// Smoke test for a running Khotwa container (used by .github/workflows/ci.yml).
//
//   node scripts/ci-smoke.mjs http://127.0.0.1:3000
//
// It waits for /readyz, then checks the things a broken deploy would silently
// lose: the schema is ready, the security headers are on, and anonymous callers
// cannot read school data. It never logs in and never sends credentials.

import assert from 'node:assert/strict';

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const WAIT_SECONDS = Number(process.env.SMOKE_WAIT_SECONDS || 300);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForReady() {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  let last = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/readyz`, {signal: AbortSignal.timeout(5000)});
      const body = await response.text();
      last = `HTTP ${response.status} ${body.slice(0, 120)}`;
      if (response.ok) return JSON.parse(body);
    } catch (error) {
      last = error?.name === 'TimeoutError' ? 'timed out' : String(error?.cause?.code || error?.message || error);
    }
    await sleep(3000);
  }
  throw new Error(`/readyz was not ready after ${WAIT_SECONDS}s (last: ${last})`);
}

const checks = [];
async function check(name, run) {
  try {
    await run();
    checks.push({name, ok: true});
    console.log(`ok   ${name}`);
  } catch (error) {
    checks.push({name, ok: false});
    console.log(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`);
  }
}

// redirect: 'manual' so we judge the response the gateway itself sent.
const get = (pathname, init = {}) => fetch(`${base}${pathname}`, {redirect: 'manual', signal: AbortSignal.timeout(15000), ...init});

const ready = await waitForReady();
console.log(`/readyz: ${JSON.stringify(ready)}\n`);

await check('/readyz reports the khotwa service as ready', () => {
  assert.equal(ready.service, 'khotwa');
  assert.equal(ready.status, 'ready');
});

for (const pathname of ['/', '/api/data']) {
  await check(`${pathname} carries the global security headers`, async () => {
    const response = await get(pathname);
    const header = (name) => response.headers.get(name);
    assert.equal(header('x-content-type-options'), 'nosniff');
    assert.equal(header('x-frame-options'), 'DENY');
    assert.equal(header('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(header('strict-transport-security') || '', /max-age=\d+/);
    assert.match(header('permissions-policy') || '', /camera=\(self\)/);
    const csp = header('content-security-policy') || '';
    assert.match(csp, /frame-ancestors 'none'/, `enforced CSP missing frame-ancestors: ${csp}`);
    assert.ok(header('content-security-policy-report-only') || csp.includes('default-src'), 'a full CSP policy must at least be reported');
  });
}

for (const pathname of ['/api/data', '/api/student-care', '/api/backup', '/manager', '/parent']) {
  await check(`anonymous ${pathname} is not served`, async () => {
    const response = await get(pathname);
    assert.notEqual(response.status, 200, `anonymous request got HTTP 200 from ${pathname}`);
    assert.ok(response.status < 500, `expected a refusal or redirect, got HTTP ${response.status}`);
  });
}

await check('anonymous cross-origin write is refused', async () => {
  const response = await get('/api/data', {
    method: 'POST',
    headers: {Origin: 'https://evil.example', 'Content-Type': 'application/json'},
    body: '{}',
  });
  assert.ok([301, 302, 303, 307, 308, 400, 401, 403].includes(response.status), `unexpected HTTP ${response.status}`);
});

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} smoke checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
