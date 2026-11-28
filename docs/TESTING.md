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
| `test-cafeteria-presence.mjs` | the cafeteria module | Automatic arrival and departure (see `docs/CAFETERIA-ACCESS.md`): only the system administrator sets a cafeteria's location; the phone reports "arrived" / "left" by itself and an arrival is accepted only at the agent's own cafeteria within its radius; no position is stored; an agent sees nothing of it, even with an old `presence_view` grant, and cannot be given it; administrators get a feed (late reports included, scoped to their cafeterias) and may switch e-mail on; a stay nobody ended is "not confirmed" with no invented time. |
| `test-login-stamps.mjs` | the gateway | Every successful sign-in of every role leaves one stamp (time, who, school, website or app) and nothing about where the person is; the app's user-agent tag is read; a failed sign-in and a broken stamp table change nothing; old stamps age out; parents are masked in the log. |
| `test-app-version.mjs` | pure logic | App versions compare by number (1.10 is newer than 1.9), the update decision is exact (current / available / required / unknown), a release is validated, and a report loses phone numbers, e-mail and IP addresses, ids, tokens and query strings before it is stored; one bug from many people has one fingerprint. |
| `test-app-diagnostics.mjs` | the gateway and routes | The version check is public and the report is for every signed-in role (the read-only manager too) but never anonymous; problems are cleaned, counted and remember how many people met them; a phone's state is kept for the app and for the cafeteria agent's browser only; only the system administrator reads or changes diagnostics and releases; releases and store links are validated; the list is bounded and old entries age out; a missing table is named and never breaks a report. |
| `test-location.mjs` | the cafeteria module | Pure rules, no database: distances, map projection, fit-to-markers, the arrival and departure thresholds, what the agent's phone does with each position, phone-number normalisation. |
| `test-ui-contrast.mjs` | the design kit | Every text/background colour pair of `app/ui/kx.css` meets WCAG AA contrast, so a colour change cannot make text unreadable. |
| `test-guided-tour.mjs` | the first-login tours | Tours are shown once per platform and account, never on every load when storage is blocked; the card is always on screen and never covers what it explains; every step has Arabic and English text and every highlighted element exists in its screen (see `docs/DESIGN.md`). |
| `test-cafeteria-inventory.mjs` | the cafeteria module | Stock (see `docs/CAFETERIA-ACCESS.md`): visible only with `inventory_view` and changed only with `inventory_manage` in that cafeteria; receipts, returns, write-offs and counts each leave a history row and an exact count; the same request twice changes the stock once; two simultaneous write-offs cannot make it negative; untracked items do not move; another cafeteria's items and history answer like something that does not exist. |
| `test-cafeteria-reports.mjs` | the cafeteria module | The 13 reports on a small data set whose numbers are worked out by hand in the test; a report needs `reports` plus the permission for its kind of data, "all cafeterias" is only where both are held, no student, parent or position in any report, and the CSV cannot run a formula. |
| `test-cafeteria-backup.mjs` | the cafeteria module | Every `fushati_*` table and column is classified in `lib/fushati/backup.ts` (a new column fails the test until it is); only the system administrator downloads the backup; no password hash, card secret, sign-in link or agent position is in it; agent positions older than 30 days are blanked and forgotten stays closed. |
| `test-cafeteria-barcode.mjs` | the cafeteria module | Products by barcode (see `docs/CAFETERIA-ACCESS.md`): the barcode rules with real EAN-13/EAN-8/UPC-A/ITF-14 codes (check digit, length, Arabic digits), lookup by permission, unknown barcode added once and then known so only the quantity is needed, the same scan sent twice adds once, a product that was not tracked starts being tracked, a proposer's product waits for approval and cannot receive stock, one barcode per product in a cafeteria but the same barcode may exist in another, editing and clearing a barcode, another cafeteria's items are never found, the audit trail, and the backup carries barcodes. |
| `test-cafeteria-ui.mjs` | the cafeteria inventory and report screens | Stock status colours and words in both languages, the list shows what needs action first, tile counts and stock value, the stock-move preview and check follow the server's rule (cannot remove more than is on hand, a count may be zero, whole quantities only), days of cover, typed amounts (Arabic digits and decimal mark accepted, more than two decimals refused), Saudi time; report cells (money, percent, minutes, dates, empty value is a dash), a cafeteria only offers the reports its grant allows, a date range over 365 days is refused like on the server, report URLs are encoded. |
| `test-manager-report.mjs` | the school manager dashboard | Attendance codes are shown as words in both languages; ranked-bar and column geometry (a small value is still visible, a quiet month is an empty column, not dropped); the CSV export quotes values, neutralises cells that start with `=`, `+`, `-` or `@` so Excel cannot run them as formulas, and follows the screen language. |
| `test-no-popups.mjs` | every screen | Nothing that edits or confirms opens a browser popup: no `confirm()`, `prompt()` or `alert()` anywhere in `app/` (the PWA install prompt is the browser's own and is allowed), every old modal is now a page with a `<SheetBack>` Back bar right after its opening tag (so a new popup cannot be added without a way out), and `ui/sheet.css` loads after the older modal rules and covers the page with an opaque background. |
| `test-action-menu.mjs` | the three-dot menu | Where the list opens (below or above the button, inside the window, in Arabic and English), how the arrow / Home / End keys move over rows that can be used, that a list with every row hidden draws nothing, that "type it again" confirms only on an exact match, that every colour pair is readable (WCAG AA), that the component keeps its roles, Escape and focus handling, and that the cafeteria, console and agent lists use the menu (no row of Edit / Delete buttons) and every red row asks first. |
| `test-agent-layout.mjs` | the agent frame | `app/ui/agent-shell.css` is one `@media screen` block, every selector starts from `.app-shell`, it has no `!important` and is imported last; the header, section tabs and phone menu keep what the guided tour points at; the home page has no banner and its four counts open their lists; the new lines have English. |

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
