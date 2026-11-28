// Shared test harness: the real request path, end to end, on a real database.
//
//   sign in  ->  handleKhotwaAuthentication (the gateway)  ->  runWithSchool  ->  the real route handler
//
// This is the same sequence build/sites-worker.ts runs in production, with the
// platform pieces swapped for local ones: an in-memory D1 database (Miniflare)
// with the real migrations, `next/headers` fed from the request, and the school
// context set exactly as the Worker sets it. Nothing about the schools, the
// accounts or the routes is mocked.
//
// Three schools are created: the legacy "default" school (unprefixed tables)
// and two provisioned schools. Every school table of every school gets one row
// whose text values carry that school's marker, so any response can be checked
// for another school's data by searching for foreign markers.
//
// Used by test-cross-school-routes.mjs and test-role-matrix.mjs. Not a test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const {Miniflare} = createRequire(require.resolve('wrangler/package.json'))('miniflare');

export const ORIGIN = 'https://khotwa-test.example.com';
export const PASSWORD = 'cross-school-password-12345';
const SESSION_SECRET = 'cross-school-test-secret-0123456789-abcdefghij';
const ADMIN_EMAIL = 'admin@example.com';

export const SCHOOLS = [
  {key: 'default', id: 'default', marker: 'MARKDEFAULT', digits: '71234500'},
  {key: 'a', id: 'a3f9c19bb2ef', marker: 'MARKAAAA', digits: '71234501'},
  {key: 'b', id: '0123456789ab', marker: 'MARKBBBB', digits: '71234502'},
];
export const SHARED_PARENT_PHONE = '0599999999';
export const schoolByKey = Object.fromEntries(SCHOOLS.map((school) => [school.key, school]));
/** A valid, distinct UUID per school and kind (1 = student, 2 = cafeteria, 3 = menu item, 4 = transfer). Some routes only accept UUID ids. */
export const uuid = (school, kind) => `${school.digits.slice(-2).repeat(4)}-0000-4000-8000-${String(kind).padStart(12, '0')}`;

const MIGRATIONS = fs.readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort();
const migrationStatements = MIGRATIONS.flatMap((file) => fs.readFileSync(path.join('drizzle', file), 'utf8').split('--> statement-breakpoint').filter((statement) => statement.trim()));

export async function createHarness() {
  const requestStore = new AsyncLocalStorage();
  const env = {};
  const modules = new Map();

  function resolveFrom(from, name) {
    const base = path.resolve(path.dirname(from), name);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    throw new Error(`cannot resolve ${name} from ${from}`);
  }
  function load(file) {
    const absolute = path.resolve(file);
    if (modules.has(absolute)) return modules.get(absolute);
    const exports = {};
    modules.set(absolute, exports);
    const js = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
    new Function('require', 'exports', js)((name) => {
      if (name === 'cloudflare:workers') return {env};
      if (name === 'next/headers') return {headers: async () => requestStore.getStore().headers};
      if (name === 'next/navigation') return {redirect() { throw new Error('redirect() called'); }};
      if (name.startsWith('.')) return load(resolveFrom(absolute, name));
      return require(name);
    }, exports);
    return exports;
  }

  // Column and foreign-key facts come from a plain SQLite copy of the same migrations.
  const reference = new DatabaseSync(':memory:');
  for (const statement of migrationStatements) reference.exec(statement);

  const mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("ok")}}', compatibilityDate: '2026-05-15', d1Databases: {DB: 'cross-school-routes'}, d1Persist: false});
  const DB = await mf.getD1Database('DB');
  for (const statement of migrationStatements) await DB.prepare(statement).run();

  const tenancy = load('lib/school-tenancy.ts');
  const gateway = load('lib/standalone-auth.ts');
  const {hashPassword} = load('lib/account-security.ts');
  const passwordHash = await hashPassword(PASSWORD);
  Object.assign(env, {DB, KHOTWA_ADMIN_EMAIL: ADMIN_EMAIL, KHOTWA_ADMIN_PASSWORD_HASH: passwordHash, KHOTWA_SESSION_SECRET: SESSION_SECRET, KHOTWA_PUBLIC_ORIGINS: ORIGIN});

  const now = '2026-11-02T08:00:00.000Z';
  for (const school of SCHOOLS) {
    const name = `School ${school.marker}`;
    if (school.id === 'default') await DB.prepare('UPDATE khotwa_schools SET name=? WHERE id=?').bind(name, school.id).run();
    else {
      await DB.prepare('INSERT INTO khotwa_schools(id,code,name,active,created_at) VALUES(?,?,?,1,?)').bind(school.id, `CODE-${school.key}`, name, now).run();
      await tenancy.provisionSchool(DB, school.id);
    }
  }

  // ---- seed one marked row in every school table of every school --------------------------------
  const tables = [...tenancy.SCHOOL_TABLES];
  const facts = Object.fromEntries(tables.map((table) => [table, {
    columns: reference.prepare(`PRAGMA table_info(${table})`).all(),
    foreignKeys: reference.prepare(`PRAGMA foreign_key_list(${table})`).all(),
  }]));
  const order = [];
  const visit = (table) => {
    if (order.includes(table)) return;
    for (const fk of facts[table].foreignKeys) visit(fk.table);
    order.push(table);
  };
  ['students', ...tables].forEach(visit);

  function buildRow(school, table, rows, overrides = {}) {
    const row = {};
    for (const column of facts[table].columns) {
      const name = column.name;
      const fk = facts[table].foreignKeys.find((entry) => entry.from === name);
      if (name in overrides) row[name] = overrides[name];
      else if (fk) row[name] = rows[fk.table][fk.to];
      else if (table === 'students' && name === 'id') row[name] = uuid(school, 1);
      else if (name === 'student_ids') row[name] = JSON.stringify([rows.students.id]);
      else if (['extra', 'snapshot', 'data', 'payload'].includes(name)) row[name] = JSON.stringify({marker: school.marker});
      else if (name === 'deleted_at') row[name] = '';
      else if (/INT|REAL|NUM/i.test(column.type)) row[name] = 1;
      else if (name === 'phone' || name.endsWith('_phone')) row[name] = `05${school.digits}`;
      else if (name === 'date' || name.endsWith('_date')) row[name] = '2026-11-02';
      else if (name.endsWith('_time')) row[name] = '08:00';
      else if (name.endsWith('_at')) row[name] = now;
      else row[name] = `${school.marker}:${table}.${name}`;
    }
    return row;
  }
  const insertRow = (school, table, row) => tenancy.runWithSchool({schoolId: school.id, role: 'main_admin', identity: 'seed'}, async () => {
    const names = facts[table].columns.map((column) => column.name);
    try {
      await tenancy.getTenantDb().prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(() => '?').join(',')})`).bind(...names.map((name) => row[name])).run();
    } catch (error) {
      // Each school is seeded with its own, distinct keys, so a clash means the rows went to somebody else's tables.
      throw new Error(`Seeding ${table} for school "${school.id}" failed: ${error.message}. A UNIQUE or FOREIGN KEY error here usually means tenant isolation is broken (rows written for one school landed in another school's tables, e.g. a tenant database cached across requests).`, {cause: error});
    }
  });

  const seeded = {};
  for (const school of SCHOOLS) {
    const rows = (seeded[school.id] = {});
    for (const table of order) {
      rows[table] = buildRow(school, table, rows);
      await insertRow(school, table, rows[table]);
    }
  }

  // A child shared by the "same" parent in two schools (a parent with children across the city).
  const sharedChildren = {};
  for (const school of SCHOOLS.filter((entry) => entry.id !== 'default')) {
    const rows = seeded[school.id];
    const child = buildRow(school, 'students', rows, {id: `shared-child-${school.key}`, name: `${school.marker}:shared-child`, phone: SHARED_PARENT_PHONE});
    await insertRow(school, 'students', child);
    await insertRow(school, 'parent_grants', buildRow(school, 'parent_grants', {...rows, students: child}, {phone: SHARED_PARENT_PHONE}));
    sharedChildren[school.id] = child;
  }

  // ---- accounts and sessions ----------------------------------------------------------------------
  const addAccount = async (id, schoolId, email, manager) => {
    await DB.prepare("INSERT INTO khotwa_accounts(id,school_id,email,full_name,role,password_hash,active,session_version,created_at,activated_at) VALUES(?,?,?,?,'deputy',?,1,1,?,?)").bind(id, schoolId, email, `Account ${id}`, passwordHash, now, now).run();
    if (manager) await DB.prepare('INSERT INTO khotwa_manager_accounts(account_id) VALUES(?)').bind(id).run();
  };
  for (const school of SCHOOLS) await addAccount(`deputy-${school.key}`, school.id, `deputy-${school.key}@example.com`, false);
  for (const school of SCHOOLS.filter((entry) => entry.id !== 'default')) await addAccount(`manager-${school.key}`, school.id, `manager-${school.key}@example.com`, true);

  const phones = {a: `05${schoolByKey.a.digits}`, b: `05${schoolByKey.b.digits}`, ab: SHARED_PARENT_PHONE};
  const memberships = {a: [schoolByKey.a], b: [schoolByKey.b], ab: [schoolByKey.a, schoolByKey.b]};
  for (const [who, phone] of Object.entries(phones)) {
    await DB.prepare('INSERT INTO khotwa_parent_identities(phone,password_hash,session_version,created_at) VALUES(?,?,1,?)').bind(phone, passwordHash, now).run();
    for (const school of memberships[who]) await DB.prepare('INSERT INTO khotwa_parent_memberships(phone,school_id,enabled,updated_at) VALUES(?,?,1,?)').bind(phone, school.id, now).run();
  }

  const form = (pathname, payload) => new Request(ORIGIN + pathname, {method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(payload).toString()});
  async function login(pathname, payload) {
    const result = await gateway.handleKhotwaAuthentication(form(pathname, payload), env);
    assert.equal(result.response?.status, 303, `sign-in at ${pathname} failed`);
    const cookie = result.response.headers.get('set-cookie');
    assert.ok(cookie && !cookie.startsWith('__Host-khotwa_session=;'), `sign-in at ${pathname} set no session`);
    return cookie.split(';')[0];
  }

  const sessions = {deputy: {}, manager: {}, admin: {}, parent: {}};
  for (const school of SCHOOLS) sessions.deputy[school.key] = await login('/login', {email: `deputy-${school.key}@example.com`, password: PASSWORD});
  for (const school of SCHOOLS.filter((entry) => entry.id !== 'default')) sessions.manager[school.key] = await login('/manager-login', {email: `manager-${school.key}@example.com`, password: PASSWORD});
  sessions.admin.default = await login('/admin-login', {email: ADMIN_EMAIL, password: PASSWORD});
  for (const school of SCHOOLS.filter((entry) => entry.id !== 'default')) sessions.admin[school.key] = (await gateway.adminSwitchCookie(SESSION_SECRET, ADMIN_EMAIL, school.id)).split(';')[0];
  for (const [who, phone] of Object.entries(phones)) sessions.parent[who] = await login('/parent-login', {phone, password: PASSWORD});

  // Cafeteria (Fushati) accounts: an administrator and an agent identified by mobile number.
  const addFushati = (id, email, role, identifier) => DB.prepare('INSERT INTO fushati_users(id,email,full_name,role,password_hash,active,must_change_password,session_version,created_at,login_identifier,activated_at) VALUES(?,?,?,?,?,1,0,1,?,?,?)').bind(id, email, `Account ${id}`, role, passwordHash, now, identifier, now).run();
  // UUID ids: the cafeteria route only accepts those when a request names a user.
  const fushatiIds = Object.fromEntries(['admin1', 'admin2', 'admin3', 'agent1', 'agent2'].map((name, index) => [name, `f0000000-0000-4000-8000-00000000000${index + 1}`]));
  await addFushati(fushatiIds.admin1, 'fushati-admin@example.com', 'fushati_admin', '');
  await addFushati(fushatiIds.agent1, 'fushati-agent@example.com', 'fushati_agent', 'phone:+966512345678');
  sessions.fushatiAdmin = await login('/fushati-admin-login', {email: 'fushati-admin@example.com', password: PASSWORD});
  sessions.fushatiAgent = await login('/fushati-agent-login', {identifier: '0512345678', password: PASSWORD});
  // More accounts for the cafeteria access tests. Cafeteria access is by assignment, so none of them
  // can reach any cafeteria until a test assigns one.
  await addFushati(fushatiIds.admin2, 'fushati-admin-2@example.com', 'fushati_admin', '');
  await addFushati(fushatiIds.admin3, 'fushati-admin-3@example.com', 'fushati_admin', '');
  await addFushati(fushatiIds.agent2, 'fushati-agent-2@example.com', 'fushati_agent', 'phone:+966512345679');
  sessions.fushatiAdmin2 = await login('/fushati-admin-login', {email: 'fushati-admin-2@example.com', password: PASSWORD});
  sessions.fushatiAdmin3 = await login('/fushati-admin-login', {email: 'fushati-admin-3@example.com', password: PASSWORD});
  sessions.fushatiAgent2 = await login('/fushati-agent-login', {identifier: '0512345679', password: PASSWORD});

  /** Only the gateway: does this request get through, and if not, how is it refused? */
  async function gate(cookie, pathname, {method = 'GET', headers = {}} = {}) {
    const auth = await gateway.handleKhotwaAuthentication(new Request(ORIGIN + pathname, {method, headers: {cookie: cookie || '', origin: ORIGIN, ...headers}}), env);
    return auth.response ? {allowed: false, status: auth.response.status, location: auth.response.headers.get('location')} : {allowed: true, status: null, location: null};
  }

  /** One request through the whole path. Returns the Response (the gateway's own, if it refuses). */
  async function serve(cookie, pathname, {method = 'GET', body, headers = {}} = {}) {
    const init = {method, headers: {cookie: cookie || '', origin: ORIGIN, ...headers}};
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const url = new URL(ORIGIN + pathname);
    const auth = await gateway.handleKhotwaAuthentication(new Request(url, init), env);
    if (auth.response) return auth.response;
    const routeName = url.pathname.replace(/^\/api\//, '');
    const route = load(`app/api/${routeName}/route.ts`);
    assert.equal(typeof route[method], 'function', `app/api/${routeName}/route.ts does not export ${method}`);
    const run = () => route[method](auth.request);
    return requestStore.run({headers: auth.request.headers}, () => (auth.school ? tenancy.runWithSchool(auth.school, run) : run()));
  }

  return {
    DB, env, tenancy, schools: SCHOOLS, schoolByKey, sessions, seeded, sharedChildren, phones, serve, gate, tables, fushatiIds, addFushati, login, gateway, form,
    async close() { await mf.dispose(); },
  };
}

/** Fails if the response contains data of any school other than `school`. */
export function assertOnlySchool(text, school, label, {requireOwn = true} = {}) {
  if (requireOwn) assert.ok(text.includes(school.marker), `${label}: nothing of school ${school.key} came back (the route is not reading that school's tables?)`);
  for (const other of SCHOOLS) {
    if (other.key === school.key) continue;
    assert.ok(!text.includes(other.marker), `${label}: LEAK, school ${school.key} received data of school ${other.key} (${other.marker})`);
    assert.ok(!text.includes(other.digits), `${label}: LEAK, school ${school.key} received a phone number of school ${other.key}`);
  }
}
