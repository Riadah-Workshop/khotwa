# Testing and CI

## Run the tests

```bash
corepack pnpm install --frozen-lockfile   # once, and after dependency changes
corepack pnpm test                        # every scripts/test-*.{mjs,cjs,py}
corepack pnpm test -- --only fushati      # only tests whose file name contains "fushati"
node scripts/run-tests.mjs --list         # what would run
corepack pnpm typecheck                   # tsc --noEmit
corepack pnpm lint
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

## What CI runs (`.github/workflows/ci.yml`)

| Job | What it checks |
| --- | --- |
| Tests | `pnpm install --frozen-lockfile`, then `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Docker build and smoke test | Builds the production image (which also runs the Dockerfile's own test gate and `pnpm build`), starts it with throwaway configuration, and runs `scripts/ci-smoke.mjs`: `/readyz` is ready, security headers are present, and anonymous requests cannot read `/api/data`, student care, backup, manager or parent pages |

Third-party actions are pinned to full commit SHAs; update them deliberately.

To make a job block merging, require it under **Settings → Branches → Branch
protection rules → Require status checks to pass** (repository admin).
