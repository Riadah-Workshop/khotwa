// Cross-school isolation, layer 4: who may reach what.
//
// For every API route and every role, the real gateway either lets the request
// through or refuses it. The table below says which it should be. The test fails
// when
//   - a route exists that is not in the table (a new route must be classified), or
//   - the table names a route that no longer exists, or
//   - any role/route pair behaves differently from the table (GET and POST).
//
// It is deliberately written as data so a reviewer can read the access policy in
// one place: "can a parent reach /api/data?", "can a manager write anything?".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './support/school-harness.mjs';

function routesIn(dir, base = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) found.push(...routesIn(path.join(dir, entry.name), `${base}/${entry.name}`));
    else if (entry.name === 'route.ts') found.push(`/api${base}`);
  }
  return found.sort();
}
const ROUTES = routesIn('app/api');

// Sessions. "adminInSchool" is the system administrator switched into school a; "deputy" belongs to school a.
const ACTORS = {
  anonymous: () => '',
  admin: (s) => s.admin.default,
  adminInSchool: (s) => s.admin.a,
  deputy: (s) => s.deputy.a,
  deputyDefault: (s) => s.deputy.default,
  manager: (s) => s.manager.a,
  parent: (s) => s.parent.a,
  fushatiAdmin: (s) => s.fushatiAdmin,
  fushatiAgent: (s) => s.fushatiAgent,
};
const EVERYONE = Object.keys(ACTORS);
const STAFF = ['admin', 'adminInSchool', 'deputy', 'deputyDefault'];

// ---- the access policy: route -> roles the gateway lets through -------------------------------------
const POLICY = {};
for (const route of ['backup', 'compatibility', 'data', 'evidence-file', 'identity-import', 'identity-reviews', 'initial-import', 'parents', 'parents/service', 'platform-papers', 'recovery-export', 'reply-templates', 'school-work', 'siblings', 'student-care', 'student-care/import', 'student-evaluation', 'student-file-cards', 'student-identities', 'student-movements']) {
  POLICY[`/api/${route}`] = STAFF; // school data: the Student Affairs Agent and the administrator only
}
// Legacy external services are wired to the default school only.
for (const route of ['visitors', 'messages', 'desk-close']) POLICY[`/api/${route}`] = ['admin', 'deputyDefault'];
POLICY['/api/admin'] = ['admin', 'adminInSchool'];
POLICY['/api/admin/records'] = ['admin', 'adminInSchool'];
POLICY['/api/trip-cleanup'] = ['admin', 'adminInSchool'];
POLICY['/api/account/profile'] = ['deputy', 'deputyDefault'];
POLICY['/api/manager/overview'] = ['admin', 'adminInSchool', 'manager']; // managers: GET only (checked below)
POLICY['/api/parent/status'] = ['parent'];
POLICY['/api/parent/password'] = ['parent'];
POLICY['/api/fushati'] = ['admin', 'adminInSchool', 'manager', 'parent', 'fushatiAdmin', 'fushatiAgent']; // managers: GET only
POLICY['/api/fushati/receipts'] = ['admin', 'adminInSchool', 'parent', 'fushatiAdmin', 'fushatiAgent'];
POLICY['/api/webhooks/resend'] = EVERYONE; // public: it verifies the sender's signature itself
// -----------------------------------------------------------------------------------------------------

const PAGES = {
  '/admin': ['admin', 'adminInSchool'],
  '/manager': ['admin', 'adminInSchool', 'manager'],
  '/parent': ['parent'],
  '/account': ['deputy', 'deputyDefault'],
  '/fushati/admin': ['admin', 'adminInSchool', 'fushatiAdmin'],
  '/fushati/agent': ['admin', 'adminInSchool', 'fushatiAgent'],
};

const unclassified = ROUTES.filter((route) => !(route in POLICY));
assert.deepEqual(unclassified, [], `API route(s) ${unclassified.join(', ')} are not in the access policy of scripts/test-role-matrix.mjs. Decide which roles may reach them (and make sure the gateway enforces it), then add them.`);
const gone = Object.keys(POLICY).filter((route) => !ROUTES.includes(route));
assert.deepEqual(gone, [], `access policy names route(s) that no longer exist: ${gone.join(', ')}`);

const harness = await createHarness();
try {
  const {sessions, gate} = harness;
  let checks = 0;
  const failures = [];
  const expect = async (actor, pathname, method, shouldPass) => {
    const result = await gate(ACTORS[actor](sessions), pathname, {method});
    checks++;
    if (result.allowed !== shouldPass) failures.push(`${actor} ${method} ${pathname}: expected ${shouldPass ? 'through' : 'refused'}, got ${result.allowed ? 'through' : `refused (${result.status}${result.location ? ` -> ${result.location}` : ''})`}`);
  };

  for (const route of ROUTES) {
    for (const actor of EVERYONE) {
      const allowedRoles = POLICY[route];
      await expect(actor, route, 'GET', allowedRoles.includes(actor));
      // Writes: same as reads, except the read-only school manager can never write.
      await expect(actor, route, 'POST', allowedRoles.includes(actor) && actor !== 'manager');
    }
  }
  for (const [page, allowedRoles] of Object.entries(PAGES)) {
    for (const actor of EVERYONE) await expect(actor, page, 'GET', allowedRoles.includes(actor));
  }
  assert.deepEqual(failures, [], `${failures.length} role/route pair(s) differ from the access policy:\n  ${failures.join('\n  ')}`);

  // A refusal must not be a server error, and an anonymous caller must be sent to sign in, not given data.
  const anonymousApi = await gate('', '/api/data');
  assert.ok(!anonymousApi.allowed && [401, 403].includes(anonymousApi.status), `anonymous API call refused with ${anonymousApi.status}`);
  const anonymousPage = await gate('', '/');
  assert.ok(!anonymousPage.allowed && anonymousPage.status === 303 && /login/.test(anonymousPage.location), 'an anonymous page request is redirected to sign in');

  console.log(`Role matrix passed: ${ROUTES.length} API routes x ${EVERYONE.length} roles (GET and POST) and ${Object.keys(PAGES).length} pages match the access policy; every route is classified (${checks} gateway decisions).`);
} finally {
  await harness.close();
}
