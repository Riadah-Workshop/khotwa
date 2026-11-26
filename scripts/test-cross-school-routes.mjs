// Cross-school isolation, layer 3: the real request path.
//
// Three schools (the legacy "default" school and two provisioned ones) each hold
// one marked row in every school table. Every request below goes through the
// real gateway, the real school context and the real route handler on a real
// database (scripts/support/school-harness.mjs), and the response is searched
// for another school's marker.
//
// Besides the plain "A never sees B" checks, running every school against every
// route in several orders catches the multi-tenant mistake the schema tests
// cannot: a route that caches the first school's database or data and serves it
// to the next school.
import assert from 'node:assert/strict';
import {assertOnlySchool, createHarness, SCHOOLS} from './support/school-harness.mjs';

const harness = await createHarness();
try {
  const {sessions, schoolByKey, serve, DB} = harness;
  const a = schoolByKey.a, b = schoolByKey.b, legacy = schoolByKey.default;

  // Routes that return school data on GET. `own: false` where the stored row is not shown as text.
  const READS = [
    {route: 'data', own: true},
    {route: 'backup', own: true},
    {route: 'siblings', own: true},
    {route: 'student-care', own: true},
    {route: 'parents', own: false},
    {route: 'school-work', own: true},
    {route: 'platform-papers', own: true},
    {route: 'student-movements', own: true},
    {route: 'compatibility', own: true},
    {route: 'student-evaluation', own: false},
    {route: 'reply-templates', own: false},
  ];

  const read = async (cookie, route) => {
    const response = await serve(cookie, `/api/${route}`);
    return {status: response.status, text: await response.text()};
  };

  // 1. Each school's Student Affairs Agent sees only that school, in every order (no cross-request leftovers).
  const orders = [['a', 'b', 'default'], ['b', 'default', 'a'], ['default', 'a', 'b'], ['a', 'default', 'b', 'a']];
  for (const order of orders) {
    for (const key of order) {
      const school = schoolByKey[key];
      for (const {route, own} of READS) {
        const {status, text} = await read(sessions.deputy[key], route);
        assert.equal(status, 200, `deputy of ${key} GET /api/${route}: HTTP ${status} ${text.slice(0, 160)}`);
        assertOnlySchool(text, school, `deputy of ${key} GET /api/${route}`, {requireOwn: own});
      }
    }
  }

  // 2. The system administrator, switched into a school, sees that school only.
  for (const key of ['a', 'b']) {
    for (const route of ['data', 'backup', 'student-care']) {
      const {status, text} = await read(sessions.admin[key], route);
      assert.equal(status, 200, `admin switched to ${key} GET /api/${route}: HTTP ${status}`);
      assertOnlySchool(text, schoolByKey[key], `admin switched to ${key} GET /api/${route}`);
    }
  }
  const adminDefault = await read(sessions.admin.default, 'data');
  assert.equal(adminDefault.status, 200);
  assertOnlySchool(adminDefault.text, legacy, 'admin on the default school GET /api/data');

  // 3. A forged school or role header changes nothing: the signed session decides.
  for (const route of ['data', 'backup']) {
    const forged = await serve(sessions.deputy.a, `/api/${route}`, {headers: {'oai-authenticated-user-school-id': b.id, 'oai-authenticated-user-role': 'main_admin', 'oai-authenticated-user-email': 'admin@example.com'}});
    assert.equal(forged.status, 200);
    assertOnlySchool(await forged.text(), a, `deputy of a with forged headers GET /api/${route}`);
  }
  const forgedAdmin = await serve(sessions.deputy.a, '/api/admin', {headers: {'oai-authenticated-user-role': 'main_admin'}});
  assert.equal(forgedAdmin.status, 403, 'a forged role header does not open admin routes');

  // 4. Writes land in the writing school only; the same id may exist in two schools.
  const templateId = '6f1c2a5e-3b7d-4c8e-9a10-1b2c3d4e5f60';
  const templateIdOfOthers = '7a2d3b6f-4c8e-4d9f-8b21-2c3d4e5f6a71';
  const addTemplate = (key, id) => serve(sessions.deputy[key], '/api/reply-templates', {method: 'POST', body: {op: 'add', id, title: `Template ${schoolByKey[key].marker}`, body: `Body text of ${schoolByKey[key].marker}`}});
  for (const key of ['a', 'b']) {
    const response = await addTemplate(key, templateId);
    assert.equal(response.status, 200, `deputy of ${key} adds a template: HTTP ${response.status} ${(await response.clone().text()).slice(0, 160)}`);
  }
  assert.equal((await addTemplate('a', templateIdOfOthers)).status, 200);
  for (const [key, expected] of [['a', 2], ['b', 1], ['default', 0]]) {
    const {text} = await read(sessions.deputy[key], 'reply-templates');
    const templates = JSON.parse(text).templates;
    assert.equal(templates.length, expected, `school ${key} should have ${expected} saved reply(ies), has ${templates.length}`);
    if (expected) assertOnlySchool(text, schoolByKey[key], `school ${key} reply templates`);
    else for (const school of SCHOOLS) assert.ok(!text.includes(school.marker), `school ${key} must not see any reply of school ${school.key}`);
  }
  const countIn = async (table) => (await DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id LIKE 'parentReplyTemplate:%'`).first()).n;
  assert.equal(await countIn('settings'), 0, 'nothing was written to the default school');
  assert.equal(await countIn(`tenant_${a.id}_settings`), 2);
  assert.equal(await countIn(`tenant_${b.id}_settings`), 1);

  // 5. Parents see their own children only, across schools when (and only when) they are linked to both.
  const status = async (who) => {
    const response = await serve(sessions.parent[who], '/api/parent/status');
    assert.equal(response.status, 200, `parent ${who} GET /api/parent/status: HTTP ${response.status}`);
    return {text: JSON.stringify(await response.json()), body: null};
  };
  const parentA = await status('a');
  assertOnlySchool(parentA.text, a, 'parent of school a');
  const parentB = await status('b');
  assertOnlySchool(parentB.text, b, 'parent of school b');
  const parentAB = await status('ab');
  assert.ok(parentAB.text.includes(a.marker) && parentAB.text.includes(b.marker), 'a parent linked to two schools sees the child in each');
  assert.ok(!parentAB.text.includes(legacy.marker), 'a parent linked to two schools does not see a third school');
  assert.ok(parentAB.text.includes(`${a.marker}:shared-child`) && parentAB.text.includes(`${b.marker}:shared-child`));
  // ...and only the children the guardian is linked to: school a's own seeded child belongs to a different phone number.
  assert.ok(!parentAB.text.includes(`${a.marker}:students.name`), 'a parent does not see other families\' children in the same school');

  // 6. A school manager's overview shows their school only.
  for (const key of ['a', 'b']) {
    const {status: code, text} = await read(sessions.manager[key], 'manager/overview');
    assert.equal(code, 200, `manager of ${key} GET /api/manager/overview: HTTP ${code} ${text.slice(0, 160)}`);
    assertOnlySchool(text, schoolByKey[key], `manager of ${key} overview`);
  }

  console.log(`Cross-school routes passed: ${READS.length} data routes x ${SCHOOLS.length} schools in ${orders.length} request orders, admin school switching, forged headers, writes confined to the writing school (same id in two schools), parent views across schools and manager overviews, all through the real gateway, school context and handlers.`);
} finally {
  await harness.close();
}
