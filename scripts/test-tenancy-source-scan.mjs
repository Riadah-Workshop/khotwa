// Cross-school isolation, layer 2: the source code.
//
// The per-school SQL rewriting only protects statements that go through
// getTenantDb()/getDb(). This scan fails when code could step around it, so that
// a new route cannot quietly read another school's data. It is a guard, not a
// proof: each exception below is a place where a person decided it was safe, and
// the reason is written next to it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/school-sql.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(exports);
const SCHOOL_TABLES = [...exports.SCHOOL_TABLES];
assert.equal(SCHOOL_TABLES.length, 23);

// ---- reviewed exceptions (file -> why it is safe) -------------------------------------------------
// Statements that name a school table on the raw database (no school rewriting).
const RAW_SCHOOL_TABLE_SQL = {
  'build/sites-worker.ts': '/readyz only checks that the base schema exists; it reads no rows',
};
// Code allowed to establish which school a request belongs to.
const RUN_WITH_SCHOOL = {
  'build/sites-worker.ts': 'sets the school from the signed session decided by the gateway',
  'app/api/parent/status/route.ts': "loops over the schools the parent is linked to, read from the platform's own membership records",
};
// Code that builds a table name for an explicit school id (bypasses the request's school).
const TABLE_NAME_FOR_SCHOOL = {
  'app/api/admin/route.ts': 'main_admin only (gateway and route check the role)',
  'app/api/admin/records/route.ts': 'main_admin only (route checks the role, school id validated)',
  'app/api/fushati/route.ts': "school id comes from the cafeteria row the signed-in user is assigned to, or from the parent's own links",
  'lib/fushati/core.ts': 'school id comes from a cafeteria row or from the parent\'s own verified links',
  'lib/parent-identities.ts': "schools come from the parent's own memberships",
  'lib/core.ts': 'dead file: nothing imports it (see docs/TESTING.md); delete it and this entry',
};
// Routes whose request body or URL may carry a school id.
const SCHOOL_ID_FROM_REQUEST = {
  'app/api/admin/route.ts': 'main_admin only',
  'app/api/admin/records/route.ts': 'main_admin only',
};
// ---------------------------------------------------------------------------------------------------

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', '.git'].includes(entry.name)) sourceFiles(full, found);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(full.split(path.sep).join('/'));
  }
  return found;
}
const files = ['app', 'lib', 'db', 'build'].flatMap((dir) => (fs.existsSync(dir) ? sourceFiles(dir) : []));
const text = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const tableAlternatives = [...SCHOOL_TABLES].sort((a, b) => b.length - a.length).join('|');

/** Every file that uses the pattern, minus the reviewed exceptions, must be empty; exceptions must still be needed. */
function check(label, uses, allowed, advice) {
  const unexpected = uses.filter((file) => !(file in allowed));
  assert.deepEqual(unexpected, [], `${label}: ${unexpected.join(', ')}. ${advice}`);
  const stale = Object.keys(allowed).filter((file) => !uses.includes(file));
  assert.deepEqual(stale, [], `${label}: reviewed exception(s) no longer needed, remove them from this test: ${stale.join(', ')}`);
}

// 1. Raw database statements must not name school tables.
const SQL_LITERAL = String.raw`(['"\`])((?:\\.|(?!\1)[\s\S])*?)\1`;
const SCHOOL_TABLE_IN_SQL = new RegExp(String.raw`\b(?:FROM|JOIN|INTO|UPDATE|TABLE|ON)\s+[\`"\[]?(${tableAlternatives})\b`, 'i');
const rawUsers = [];
for (const [file, source] of text) {
  const rawAliases = new Set([...source.matchAll(/(?:const|let|var|,)\s*(\w+)\s*=\s*env\.DB\b/g)].map((m) => m[1]));
  const tenantAliases = new Set([...source.matchAll(/(?:const|let|var|,)\s*(\w+)\s*=\s*(?:getTenantDb|getDb)\(/g)].map((m) => m[1]));
  const aliases = [...rawAliases].filter((name) => !tenantAliases.has(name));
  const patterns = [String.raw`env\.DB!?\??\.(?:prepare|exec)\(\s*`, ...aliases.map((name) => String.raw`\b${name}\??\.(?:prepare|exec)\(\s*`)];
  for (const pattern of patterns) {
    for (const match of source.matchAll(new RegExp(pattern + SQL_LITERAL, 'g'))) {
      if (SCHOOL_TABLE_IN_SQL.test(match[2])) rawUsers.push(file);
    }
  }
}
check('raw database statement names a school table (it would read the default school for everyone)', [...new Set(rawUsers)], RAW_SCHOOL_TABLE_SQL, 'Use getTenantDb() or getDb() so the statement is rewritten to the signed-in school.');

// 2. Only the gateway-adjacent code may decide which school a request belongs to.
check('runWithSchool() sets the active school', [...text].filter(([file, s]) => !file.endsWith('lib/school-tenancy.ts') && /\brunWithSchool\(/.test(s)).map(([file]) => file), RUN_WITH_SCHOOL, 'A school must only come from the signed session, never from request input.');

// 3. Table names for an explicit school.
check('tableName() addresses a specific school directly', [...text].filter(([file, s]) => !/lib\/school-(?:sql|tenancy)\.ts$/.test(file) && /\btableName\(/.test(s)).map(([file]) => file), TABLE_NAME_FOR_SCHOOL, 'Confirm the school id cannot be chosen by the caller, then list the file here with the reason.');

// 4. A school id must not be accepted from a request except by admin-only routes.
const fromRequest = [...text].filter(([file, s]) => file.startsWith('app/api/') && (/\.get\(['"][A-Za-z_]*[sS]chool[A-Za-z_]*['"]\)/.test(s) || /\bschool_?[iI]d\s*:\s*z\./.test(s))).map(([file]) => file);
check('a school id is read from the request', fromRequest, SCHOOL_ID_FROM_REQUEST, 'The school must come from the signed session.');

// 5. No SQL alias may be named like a school table: the rewriter would rename it in every non-default school
//    and the code reading that column would break only there.
const aliasPattern = new RegExp(String.raw`\bAS\s+[\`"\[]?(${tableAlternatives})\b[\`"\]]?(?!\s*\()`, 'gi');
const aliases = [];
for (const [file, source] of text) {
  for (const match of source.matchAll(aliasPattern)) {
    const before = source.slice(Math.max(0, match.index - 40), match.index + 4);
    if (!/(?:import|export)\s+\*\s+$/.test(before.replace(/\s*as\s*$/i, ''))) aliases.push(`${file}: ${match[0]}`);
  }
}
assert.deepEqual(aliases, [], `SQL alias named like a school table: ${aliases.join('; ')}`);

console.log(`Tenancy source scan passed: ${files.length} source files; no raw statement on a school table, school chosen only by the signed session (${Object.keys(RUN_WITH_SCHOOL).length} reviewed callers), ${Object.keys(TABLE_NAME_FOR_SCHOOL).length} reviewed explicit-school users, school id from a request only in ${Object.keys(SCHOOL_ID_FROM_REQUEST).length} admin routes, no table-named SQL aliases.`);
