// Cross-school isolation, layer 1: the database schema.
//
// Each school's data lives in its own physical copy of 23 tables
// (tenant_<id>_students, ...) created by provisionSchool(), and every SQL
// statement is rewritten to that school's tables. This test applies the REAL
// migrations to a real SQLite database, runs the REAL provisionSchool() and
// rewriteSchoolSql(), and checks the things that would silently leak or break
// one school's data:
//
//   1. every table is either registered as a school table or is a platform
//      table (khotwa_* / fushati_*), so a new school table cannot be forgotten
//   2. no column is named like a school table (the rewriter would rename it)
//   3. platform tables never point at school tables; nothing needs cloning
//      that provisionSchool does not clone (triggers, views)
//   4. no migration after the multi-school one changes a school table (existing
//      tenant copies would never receive the change)
//   5. a provisioned school is a faithful copy: same columns, foreign keys
//      pointing at its OWN tables, same indexes
//   6. one row per table written by each of three schools is visible to that
//      school only, through all the SQL shapes the application uses
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const cache = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  const js = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function('require', 'exports', js)((name) => {
    if (name === 'cloudflare:workers') return {env: {}};
    if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), `${name}.ts`));
    return require(name);
  }, exports);
  return exports;
}

const {SCHOOL_TABLES, rewriteSchoolSql, tenantPrefix, LEGACY_SCHOOL_ID} = load('lib/school-sql.ts');
const {provisionSchool} = load('lib/school-tenancy.ts');

const MIGRATIONS = fs.readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort();
const MULTISCHOOL_MIGRATION = MIGRATIONS.findIndex((name) => name.includes('multischool'));
assert.ok(MULTISCHOOL_MIGRATION > 0, 'could not find the multi-school migration');

function migratedDatabase() {
  const db = new DatabaseSync(':memory:');
  for (const file of MIGRATIONS) {
    for (const statement of fs.readFileSync(path.join('drizzle', file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
  return db;
}

// Just enough of D1's interface for provisionSchool().
const asD1 = (db) => ({
  prepare(sql) {
    const statement = db.prepare(sql);
    return {
      async all() { return {results: statement.all()}; },
      async run() { statement.run(); return {}; },
    };
  },
});

const db = migratedDatabase();
const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
const isPlatformTable = (name) => name.startsWith('khotwa_') || name.startsWith('fushati_');
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all();

// 1. Every table is a registered school table or a platform table.
const missing = SCHOOL_TABLES.filter((name) => !tableNames.includes(name));
assert.deepEqual(missing, [], `SCHOOL_TABLES lists tables the migrations do not create: ${missing.join(', ')}`);
const unclassified = tableNames.filter((name) => !SCHOOL_TABLES.includes(name) && !isPlatformTable(name));
assert.deepEqual(unclassified, [], `Table(s) ${unclassified.join(', ')} are not isolated per school. A school table must be added to TABLES in lib/school-sql.ts (and provisioned for every existing school); a platform-wide table must be prefixed khotwa_ or fushati_.`);

// 2. No column shares a name with a school table (the SQL rewriter works on bare identifiers).
for (const table of SCHOOL_TABLES) {
  for (const column of columnsOf(table)) {
    assert.ok(!SCHOOL_TABLES.includes(column.name), `column ${table}.${column.name} is named like a school table; the SQL rewriter would rename it in every non-default school`);
  }
}

// 3. Platform tables must not depend on school tables; provisionSchool() clones only tables and indexes.
for (const table of tableNames.filter(isPlatformTable)) {
  for (const fk of db.prepare(`PRAGMA foreign_key_list(${table})`).all()) {
    assert.ok(!SCHOOL_TABLES.includes(fk.table), `platform table ${table} has a foreign key to school table ${fk.table}`);
  }
}
const mentionsSchoolTable = (sql) => SCHOOL_TABLES.some((table) => new RegExp(`\\b${table}\\b`).test(sql));
const uncloned = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('trigger','view')").all().filter((row) => SCHOOL_TABLES.includes(row.tbl_name) || mentionsSchoolTable(row.sql));
assert.deepEqual(uncloned.map((row) => `${row.type} ${row.name}`), [], 'triggers/views that touch school tables are not copied by provisionSchool(), so school copies would behave differently');

// 4. Existing schools are provisioned once, so later migrations must not change school tables.
const SCHEMA_CHANGE = new RegExp(`\\b(?:ALTER\\s+TABLE|DROP\\s+TABLE|DROP\\s+INDEX|CREATE\\s+(?:UNIQUE\\s+)?INDEX[^;]*?\\sON|CREATE\\s+TRIGGER[^;]*?\\sON)\\s+[\`"\\[]?(${SCHOOL_TABLES.join('|')})\\b`, 'gi');
for (const file of MIGRATIONS.slice(MULTISCHOOL_MIGRATION + 1)) {
  const sql = fs.readFileSync(path.join('drizzle', file), 'utf8').replace(/--[^\n]*/g, '');
  const touched = [...sql.matchAll(SCHEMA_CHANGE)].map((match) => match[1]);
  assert.deepEqual(touched, [], `${file} changes school table(s) ${[...new Set(touched)].join(', ')}, but schools that already exist keep their own copies of those tables and would never receive the change. Add a per-school migration runner before changing school tables.`);
}

// 5. A provisioned school is a faithful copy that points only at its own tables.
const SCHOOLS = [
  {id: LEGACY_SCHOOL_ID, marker: 'DEFAULTSCHOOL'},
  {id: 'a3f9c19bb2ef', marker: 'SCHOOLAAAA'},
  {id: '0123456789ab', marker: 'SCHOOLBBBB'},
];
for (const school of SCHOOLS.filter((entry) => entry.id !== LEGACY_SCHOOL_ID)) await provisionSchool(asD1(db), school.id);
await assert.rejects(() => provisionSchool(asD1(db), LEGACY_SCHOOL_ID), /already provisioned/);

const baseIndexes = (table) => db.prepare(`PRAGMA index_list(${table})`).all().filter((index) => index.origin === 'c').map((index) => ({name: index.name, unique: index.unique, columns: db.prepare(`PRAGMA index_info(${index.name})`).all().map((column) => column.name)}));
for (const school of SCHOOLS.filter((entry) => entry.id !== LEGACY_SCHOOL_ID)) {
  const prefix = tenantPrefix(school.id);
  const physical = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?").all(`${prefix}%`).map((row) => row.name).sort();
  assert.deepEqual(physical, SCHOOL_TABLES.map((table) => prefix + table).sort(), `school ${school.id} must have exactly one copy of every school table`);
  for (const table of SCHOOL_TABLES) {
    const copy = prefix + table;
    const strip = (columns) => columns.map(({name, type, notnull, dflt_value, pk}) => ({name, type, notnull, dflt_value, pk}));
    assert.deepEqual(strip(columnsOf(copy)), strip(columnsOf(table)), `${copy} must have the same columns as ${table}`);
    const baseKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all().map((fk) => `${fk.from}>${prefix}${fk.table}.${fk.to}:${fk.on_delete}`).sort();
    const copyKeys = db.prepare(`PRAGMA foreign_key_list(${copy})`).all().map((fk) => `${fk.from}>${fk.table}.${fk.to}:${fk.on_delete}`).sort();
    assert.deepEqual(copyKeys, baseKeys, `${copy} foreign keys must point at this school's own tables`);
    const copyIndexes = db.prepare(`PRAGMA index_list(${copy})`).all().filter((index) => index.origin === 'c').map((index) => ({name: index.name, unique: index.unique, columns: db.prepare(`PRAGMA index_info(${index.name})`).all().map((column) => column.name)}));
    assert.deepEqual(copyIndexes.map((index) => ({...index, name: index.name.replace(prefix, '')})).sort((a, b) => a.name.localeCompare(b.name)), baseIndexes(table).sort((a, b) => a.name.localeCompare(b.name)), `${copy} must have the same indexes as ${table}`);
  }
}

// 6. Data written by one school is invisible to the others. One row per table per school, seeded
//    generically from the real columns, in foreign-key order, always through the SQL rewriter.
const parentsOf = (table) => db.prepare(`PRAGMA foreign_key_list(${table})`).all();
function insertionOrder() {
  const ordered = [];
  const visit = (table) => {
    if (ordered.includes(table)) return;
    for (const fk of parentsOf(table)) visit(fk.table);
    ordered.push(table);
  };
  SCHOOL_TABLES.forEach(visit);
  return ordered;
}
function seed(school) {
  const rows = {};
  for (const table of insertionOrder()) {
    const columns = columnsOf(table);
    const foreignKeys = parentsOf(table);
    const row = {};
    for (const column of columns) {
      const parent = foreignKeys.find((fk) => fk.from === column.name);
      if (parent) row[column.name] = rows[parent.table][parent.to];
      else if (/INT|REAL|NUM/i.test(column.type)) row[column.name] = 1;
      else row[column.name] = `${school.marker}:${table}.${column.name}`;
    }
    rows[table] = row;
    const sql = `INSERT INTO ${table}(${columns.map((column) => column.name).join(',')}) VALUES(${columns.map(() => '?').join(',')})`;
    db.prepare(rewriteSchoolSql(sql, school.id)).run(...columns.map((column) => row[column.name]));
  }
  return rows;
}
const seeded = Object.fromEntries(SCHOOLS.map((school) => [school.id, seed(school)]));
const query = (school, sql, ...params) => db.prepare(rewriteSchoolSql(sql, school.id)).all(...params);
const cell = (school, sql, ...params) => Object.values(query(school, sql, ...params)[0] || {})[0];

for (const school of SCHOOLS) {
  for (const table of SCHOOL_TABLES) {
    const rows = query(school, `SELECT * FROM ${table}`);
    assert.equal(rows.length, 1, `${school.marker} must see exactly its own row in ${table}, saw ${rows.length}`);
    for (const value of Object.values(rows[0])) {
      if (typeof value === 'string') assert.ok(value.startsWith(`${school.marker}:`), `${school.marker} read another school's value from ${table}: ${value}`);
    }
  }
}

// The same logic through the SQL shapes the application uses.
const [legacy, schoolA, schoolB] = SCHOOLS;
const studentId = (school) => seeded[school.id].students.id;
const markers = (rows) => JSON.stringify(rows);

assert.ok(markers(query(schoolA, 'SELECT s.name FROM students s JOIN cases c ON c.student_id=s.id')).includes(schoolA.marker), 'join');
assert.ok(!markers(query(schoolA, 'SELECT s.name FROM students s JOIN cases c ON c.student_id=s.id')).includes(schoolB.marker));
assert.equal(cell(schoolA, 'SELECT COUNT(*) FROM students WHERE id IN (SELECT student_id FROM cases)'), 1, 'sub-query');
assert.equal(cell(schoolA, 'WITH x AS (SELECT id FROM students) SELECT COUNT(*) FROM x'), 1, 'CTE');
assert.equal(cell(schoolA, 'SELECT EXISTS(SELECT 1 FROM students WHERE id=?)', studentId(schoolA)), 1, 'EXISTS');
assert.equal(cell(schoolA, 'SELECT EXISTS(SELECT 1 FROM students WHERE id=?)', studentId(schoolB)), 0, "school A cannot see school B's student by id");
assert.equal(cell(schoolA, 'SELECT EXISTS(SELECT 1 FROM students WHERE id=?)', studentId(legacy)), 0, "a new school cannot see the default school's student by id");
assert.equal(cell(legacy, 'SELECT EXISTS(SELECT 1 FROM students WHERE id=?)', studentId(schoolA)), 0, "the default school cannot see a new school's student by id");
assert.equal(cell(schoolA, 'SELECT "students"."id" FROM "students"'), studentId(schoolA), 'double-quoted identifiers');
assert.equal(cell(schoolA, 'SELECT `students`.`id` FROM `students`'), studentId(schoolA), 'backtick identifiers');
assert.equal(cell(schoolA, 'SELECT [students].[id] FROM [students]'), studentId(schoolA), 'bracket identifiers');
assert.equal(cell(schoolA, 'SELECT id FROM main.students'), studentId(schoolA), 'schema-qualified');
assert.equal(cell(schoolA, "SELECT COUNT(*) FROM students WHERE name LIKE '%cases%'"), 0, 'a table name inside a string literal is data, not a table');
assert.equal(query(schoolA, 'PRAGMA table_info(students)').length, columnsOf('students').length, 'PRAGMA reads the school copy');

// Writes land only in the writing school.
db.prepare(rewriteSchoolSql("INSERT INTO settings(id,value) VALUES('shape','a1') ON CONFLICT(id) DO UPDATE SET value=excluded.value", schoolA.id)).run();
db.prepare(rewriteSchoolSql("INSERT OR REPLACE INTO settings(id,value) VALUES('shape','a2')", schoolA.id)).run();
assert.equal(cell(schoolA, "SELECT value FROM settings WHERE id='shape'"), 'a2');
assert.equal(cell(schoolB, "SELECT COUNT(*) FROM settings WHERE id='shape'"), 0, 'upsert stayed in school A');
assert.equal(cell(legacy, "SELECT COUNT(*) FROM settings WHERE id='shape'"), 0, 'upsert did not reach the default school');
db.prepare(rewriteSchoolSql("UPDATE students SET name='changed'", schoolA.id)).run();
assert.equal(cell(schoolB, "SELECT COUNT(*) FROM students WHERE name='changed'"), 0, 'UPDATE stayed in school A');
assert.equal(cell(legacy, "SELECT COUNT(*) FROM students WHERE name='changed'"), 0);
db.prepare(rewriteSchoolSql('DELETE FROM followups', schoolA.id)).run();
assert.equal(cell(schoolA, 'SELECT COUNT(*) FROM followups'), 0);
assert.equal(cell(schoolB, 'SELECT COUNT(*) FROM followups'), 1, 'DELETE stayed in school A');
assert.equal(cell(legacy, 'SELECT COUNT(*) FROM followups'), 1, 'DELETE did not reach the default school');
// A school's rows never block or cascade into another school's: A's case still has its children, B's is untouched.
assert.equal(cell(schoolB, 'SELECT COUNT(*) FROM cases'), 1);

// A foreign key can only be satisfied by the school's own parent row.
const caseColumns = columnsOf('cases').map((column) => column.name);
const foreignCase = {...seeded[schoolA.id].cases, id: 'attached-to-other-school', student_id: studentId(schoolB)};
const insertCase = (row) => db.prepare(rewriteSchoolSql(`INSERT INTO cases(${caseColumns.join(',')}) VALUES(${caseColumns.map(() => '?').join(',')})`, schoolA.id)).run(...caseColumns.map((name) => row[name]));
assert.throws(() => insertCase(foreignCase), /FOREIGN KEY/, "school A cannot attach a case to school B's student");
insertCase({...foreignCase, student_id: studentId(schoolA)}); // the same insert with its own student is fine, so the failure above is the isolation

console.log(`Tenancy schema passed: ${tableNames.length} tables classified, ${SCHOOL_TABLES.length} school tables cloned faithfully for 2 schools, no column/trigger/migration hazards, and ${SCHOOLS.length * SCHOOL_TABLES.length} per-table rows isolated across 3 schools through joins, sub-queries, CTEs, quoting styles, upserts, updates and deletes.`);
