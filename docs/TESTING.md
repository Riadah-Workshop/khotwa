# Testing and CI

## Run the tests

```bash
corepack pnpm install --frozen-lockfile   # once, and after dependency changes
corepack pnpm test                        # every scripts/test-*.{mjs,cjs,py}
corepack pnpm test -- --only fushati      # only tests whose file name contains "fushati"
node scripts/run-tests.mjs --list         # what would run
corepack pnpm typecheck                   # tsc --noEmit, full output
corepack pnpm lint                        # eslint, full output
corepack pnpm ratchet typecheck           # what CI runs: fails only on NEW type errors
corepack pnpm ratchet lint                # what CI runs: fails only on NEW lint errors
```

`pnpm test` runs each test script in its own process (4 at a time, 180 s limit
each) and exits non-zero if any fails. Python tests need `python3`; they use
only the standard library.

## Add a test

Create `scripts/test-<what-it-checks>.mjs` (or `.cjs` / `.py`). It must exit
`0` on success and non-zero on failure; use `node:assert/strict`. Tests run with
the repository root as the working directory, so read project files by relative
path (`app/api/...`). The runner picks it up automatically.

## Known-failing tests

`scripts/known-failing-tests.json` maps a test file name to the reason it is
known to fail:

```json
{ "test-example.mjs": "needs the X fixture, tracked in #123" }
```

- A listed test that **fails** is reported `XFAIL` and does not fail the run.
- A listed test that **passes** is reported `XPASS` and **fails** the run, so the
  entry has to be removed as soon as the test is fixed.
- Every entry needs a reason, and an entry for a test that no longer exists is
  refused.

Prefer fixing a test over listing it. The list exists so that a broken test
cannot block unrelated work while still being visible.

## Isolation tests (one school or cafeteria must never reach another's data)

Each school has its own physical tables (`tenant_<id>_students`, ...) and the SQL
is rewritten per request, so the main risks are a statement that skips the
rewriting, a request that runs under the wrong school, and a role that can reach
a route it should not. Six tests guard these. All run in `pnpm test` and so in
CI; make the Tests job a required check so none of them can be bypassed.

| Test | Layer | What it proves |
| --- | --- | --- |
| `test-tenancy-schema.mjs` | the tables | Real migrations on real SQLite. A provisioned school gets every school table, indexes and foreign keys, no rows are copied, writes to one school never appear in another, and a table added to the schema later without being added to the tenant list fails the test. Runs locally in under a second. |
| `test-tenancy-source-scan.mjs` | the code | Scans `app/`, `lib/`, `db/`, `build/`. Fails on a raw database statement naming a school table, on `runWithSchool`, table-name builders or a school id read from the request in a file that is not on the reviewed list. Also fails on an exception that is no longer needed. |
| `test-cross-school-routes.mjs` | the request path | Three schools (the legacy `default` one and two provisioned) with a marked row in every table. Real sign-in, real gateway, real school context, real route handlers, on an in-memory D1 database (Miniflare). Every school reads every school-data route in several orders, so a route that caches the first school's data fails. Also parents linked to one or two schools, forged `oai-authenticated-user-*` headers, an administrator switching schools, and the manager overview. |
| `test-role-matrix.mjs` | the gateway | Every `app/api/**/route.ts` is classified in a policy table at the top of the test. For every role (anonymous, system administrator, Student Affairs Agent of the default and another school, manager, parent, cafeteria administrator and agent) the gateway must let the request through or refuse it exactly as the table says, for GET and POST. A new route that is not in the table fails the test, so adding a route forces a decision about who may reach it. |
| `test-cross-cafeteria-routes.mjs` | the cafeteria module | Cafeteria (`fushati_*`) data is in shared tables and scoped in application code, so the SQL rewriting does not cover it. Checks that an agent sees and changes only their assigned cafeteria (and can only propose menu items), administration is closed to agents, parents reach only their own children's cafeterias, and a manager sees only their school's summary. |
| `test-cafeteria-access-model.mjs` | the cafeteria module | Who may see and change which cafeteria (see `docs/CAFETERIA-ACCESS.md`): a cafeteria administrator reaches only the cafeterias assigned to him, may set an alias but not rename, re-bank, disable, delete or create a cafeteria, manages only the agents of his cafeterias (for an agent who also works elsewhere, only the assignment and permissions in his own), and grants permissions per cafeteria. Also checks menu, stock, transfers, balances, export and receipts per permission, and that every refused action left the other cafeteria's data unchanged. Mutation-checked with six planted leaks. |
| `test-cafeteria-presence.mjs` | the cafeteria module | The map and attendance (see `docs/CAFETERIA-ACCESS.md`): only the system administrator sets a cafeteria's location; an agent is recorded as arrived only at his own cafeteria within its radius; one open stay per agent; positions stored only while checked in and shown only with `presence_view` in that cafeteria (never to another cafeteria's administrator or to an agent without it); quiet phones end at their last report; forgotten stays can be ended by an administrator; phone numbers. |
| `test-location.mjs` | the cafeteria module | Pure rules, no database: distances, map projection, fit-to-markers, the arrival and departure thresholds, what the agent's phone does with each position, phone-number normalisation. |

The tests that use the full request path share `scripts/support/school-harness.mjs`
(the runner ignores `scripts/support/`). It builds the schools, accounts and
sessions, and offers `serve()` (the whole path), `gate()` (the gateway only) and
`assertOnlySchool()` (fails when a response contains another school's marker or
phone digits). Every school-data assertion also requires the school's **own**
marker to be present, so an empty response cannot pass by accident.

### When one of them fails

- **Source scan, "is not on the reviewed list":** use `getTenantDb()` or `getDb()`
  instead. Only add the file to the list in the test if the use is genuinely
  safe, and write the reason next to it; a reviewer should read that line.
- **Source scan, "no longer needed":** delete the stale entry.
- **Role matrix, a new route:** add it to `POLICY` with the roles that may reach it,
  and make sure the gateway in `lib/standalone-auth.ts` really enforces it.
- **Role matrix or route test, a pair that differs:** the gateway or the route
  changed who can reach what. Fix the code unless the change is intended, in which
  case update the table in the same pull request and say why.
- **Schema test, a new school table:** add it to `TABLES` in `lib/school-sql.ts` and
  give it a migration; the test names what is missing.
- **A seeding error in the route tests (UNIQUE / FOREIGN KEY):** usually tenant
  isolation is broken, for example a tenant database cached across requests.

The route-level tests need the installed dependencies (Miniflare comes with
`wrangler`), so run `pnpm install` first; the two SQLite-based tests run anywhere.

## What CI runs (`.github/workflows/ci.yml`)

| Job | What it checks |
| --- | --- |
| Tests | `pnpm install --frozen-lockfile`, then `pnpm test` (including the isolation tests above) |
| Typecheck | `pnpm ratchet typecheck`: no file may have more TypeScript errors than the baseline |
| Lint | `pnpm ratchet lint`: no file may have more ESLint errors than the baseline |
| Docker build and smoke test | Builds the production image (which also runs the Dockerfile's own test gate and `pnpm build`), starts it with throwaway configuration, and runs `scripts/ci-smoke.mjs`: `/readyz` is ready, security headers are present, and anonymous requests cannot read `/api/data`, student care, backup, manager or parent pages |

## The error ratchet

The code base already has TypeScript and ESLint errors (mostly `unknown` and
`any` typing). A plain `tsc` or `eslint` gate would be red from day one, so
`scripts/ratchet-baseline.json` records how many errors each file has **today**.
CI fails when any file has *more* errors than its baseline, including a file that
had none, so no new debt can be added while the old debt is paid down.

When you fix errors, the check prints a notice. Lock the gain in:

```bash
corepack pnpm ratchet typecheck --update   # or: lint --update
```

Never raise a baseline to make a failure go away. Fix the new errors instead.

Third-party actions are pinned to full commit SHAs; update them deliberately.

To make a job block merging, require it under **Settings → Branches → Branch
protection rules → Require status checks to pass** (repository admin).
