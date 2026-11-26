// Run: node --experimental-strip-types scripts/test-security-headers.mjs
// No dependencies: it imports the TypeScript sources directly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes, webcrypto} from 'node:crypto';
import {withSecurityHeaders, SECURITY_HEADERS, ENFORCED_CSP, REPORT_ONLY_CSP} from '../lib/security-headers.ts';
import {handleKhotwaAuthentication as gateway} from '../lib/standalone-auth.ts';

// A CSP is only honoured if every directive parses. A single missing quote makes the
// browser drop that directive silently, so check the syntax rather than eyeball it.
const KEYWORDS = new Set(["'none'", "'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "'strict-dynamic'"]);
const DIRECTIVES = new Set(['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'media-src', 'connect-src', 'worker-src', 'manifest-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']);
function assertValidCsp(policy, label) {
  assert.ok(policy && !policy.endsWith(';'), label + ': empty or trailing semicolon');
  const seen = new Set();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    assert.ok(DIRECTIVES.has(name), `${label}: unknown directive ${name}`);
    assert.ok(!seen.has(name), `${label}: duplicate directive ${name}`);
    seen.add(name);
    assert.ok(sources.length > 0, `${label}: ${name} has no sources`);
    for (const source of sources) {
      if (source.includes("'")) {
        const valid = KEYWORDS.has(source) || /^'(?:nonce|sha256|sha384|sha512)-[A-Za-z0-9+/_=-]+'$/.test(source);
        assert.ok(valid, `${label}: malformed quoted source ${source} in ${name}`);
      }
    }
  }
  return seen;
}

// 1. The policies this release adds.
assert.ok(assertValidCsp(ENFORCED_CSP, 'ENFORCED_CSP').has('frame-ancestors'));
assertValidCsp(REPORT_ONLY_CSP, 'REPORT_ONLY_CSP');

// 2. The pages the gateway renders itself (the original bug: frame-ancestors 'none).
const salt = randomBytes(16), password = 'ExampleOnlyNotARealPassword123!';
const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const hash = Buffer.from(await webcrypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 240000}, key, 256)).toString('base64url');
const env = {
  KHOTWA_PUBLIC_ORIGINS: 'https://khotwa-test.example.com',
  KHOTWA_ADMIN_EMAIL: 'test@example.com',
  KHOTWA_ADMIN_PASSWORD_HASH: 'pbkdf2-sha256$240000$' + salt.toString('base64url') + '$' + hash,
  KHOTWA_SESSION_SECRET: 'STAGING_ONLY_SECRET_1234567890_STAGING_ONLY_SECRET',
};
let checkedPages = 0;
for (const path of ['/login', '/admin-login', '/manager-login', '/parent-login', '/fushati-admin-login', '/fushati-agent-login']) {
  const result = await gateway(new Request('https://khotwa-test.example.com' + path), env);
  const response = result.response;
  assert.equal(response?.status, 200, path);
  const csp = response.headers.get('content-security-policy');
  assert.ok(csp, path + ' has no CSP');
  const directives = assertValidCsp(csp, path);
  assert.ok(csp.includes("frame-ancestors 'none'"), path + ': frame-ancestors must be exactly \'none\'');
  assert.ok(directives.has('frame-ancestors') && directives.has('form-action') && directives.has('base-uri'), path);
  // The same page, after the Worker wrapper: its own stricter policy is kept, not replaced or doubled.
  const wrapped = withSecurityHeaders(response);
  assert.equal(wrapped.headers.get('content-security-policy'), csp, path + ': page CSP must win');
  assert.equal(wrapped.headers.get('content-security-policy-report-only'), null, path);
  assert.equal(wrapped.headers.get('x-frame-options'), 'DENY', path);
  assert.equal(wrapped.headers.get('strict-transport-security'), SECURITY_HEADERS['Strict-Transport-Security'], path);
  assert.equal(wrapped.headers.get('referrer-policy'), 'no-referrer', path + ': page-specific policy must win');
  checkedPages++;
}
assert.equal(checkedPages, 6);

// 3. The wrapper on ordinary responses.
const plain = withSecurityHeaders(new Response('hello', {status: 200, headers: {'Content-Type': 'text/plain'}}));
assert.equal(await plain.text(), 'hello');
for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(plain.headers.get(name), value, name);
assert.equal(plain.headers.get('content-security-policy-report-only'), REPORT_ONLY_CSP);
assert.equal(plain.headers.get('content-type'), 'text/plain');
assert.match(plain.headers.get('permissions-policy'), /camera=\(self\)/);
assert.match(plain.headers.get('permissions-policy'), /geolocation=\(\)/);
assert.doesNotMatch(plain.headers.get('strict-transport-security'), /includeSubDomains|preload/);

// A route that sets its own value keeps it.
const custom = withSecurityHeaders(new Response('x', {headers: {'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer'}}));
assert.equal(custom.headers.get('x-frame-options'), 'SAMEORIGIN');
assert.equal(custom.headers.get('referrer-policy'), 'no-referrer');

// Immutable redirect responses, several cookies, and empty-body statuses survive intact.
const redirect = withSecurityHeaders(Response.redirect('https://khotwa-test.example.com/admin', 303));
assert.equal(redirect.status, 303);
assert.equal(redirect.headers.get('location'), 'https://khotwa-test.example.com/admin');
assert.equal(redirect.headers.get('x-content-type-options'), 'nosniff');
const cookies = new Headers({'Content-Type': 'application/json'});
cookies.append('Set-Cookie', 'a=1; Path=/; HttpOnly');
cookies.append('Set-Cookie', 'b=2; Path=/; HttpOnly');
const withCookies = withSecurityHeaders(new Response('{}', {status: 201, statusText: 'Created', headers: cookies}));
assert.equal(withCookies.status, 201);
assert.equal(withCookies.statusText, 'Created');
assert.deepEqual(withCookies.headers.getSetCookie(), ['a=1; Path=/; HttpOnly', 'b=2; Path=/; HttpOnly']);
for (const status of [204, 304]) {
  const empty = withSecurityHeaders(new Response(null, {status}));
  assert.equal(empty.status, status);
  assert.equal(empty.body, null);
  assert.equal(empty.headers.get('x-content-type-options'), 'nosniff');
}
const upgrade = {status: 101};
assert.equal(withSecurityHeaders(upgrade), upgrade, 'WebSocket upgrades must pass through untouched');

// 4. Wiring: the Worker has one exit and it goes through the wrapper.
const worker = fs.readFileSync(new URL('../build/sites-worker.ts', import.meta.url), 'utf8');
assert.equal((worker.match(/export default/g) || []).length, 1);
assert.ok(worker.includes('withSecurityHeaders(await routes.fetch(request, env, ctx))'), 'Worker must wrap every response');

console.log('Security headers passed: valid CSP syntax on all login pages and new policies, page CSP preserved, wrapper keeps redirects/cookies/empty bodies, Worker has a single wrapped exit.');
