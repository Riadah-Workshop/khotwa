# Khotwa / Coolify runtime restart review — 2026-11-23

## Evidence

The attached Coolify screenshot shows that the *deployment* finished and that the new image build was skipped for repeated redeploys of the same Git commit. The screenshot does **not** contain the application startup exception or the container restart reason. A finished deployment is not evidence of a healthy running container.

The application starts through `scripts/launch-vps-preview.mjs`, which validates three required secrets, checks the admin-password hash formatting, applies all pending local D1 migrations to `/data/state`, launches its loopback SMTP relay, then starts Wrangler on port 3000. Failure of any mandatory startup phase exits the process; `restart: unless-stopped` can then cause a restart loop. `/readyz` runs a database readiness check and is used by Docker health checking.

Static and SQLite tests pass, including migration 0027 on a fresh SQLite database. This does not prove that Wrangler successfully migrated the existing production database. The exact runtime error is not visible in the provided screenshot.

## Patch scope

- `lib/standalone-auth.ts`: **fix** cafeteria admin/agent login HTML forms submitting to `/login` rather than their correct `/fushati-*-login` endpoints. This is a confirmed functionality bug, but not evidence of the restart cause.
- `scripts/test-fushati-auth.mjs`: regression test that rendered login forms have the correct POST target.
- `scripts/launch-vps-preview.mjs`: more explicit stage-level startup diagnostics for missing/invalid required settings, storage-file permissions, migration exit codes, and Wrangler process exit; does not print secret values or change data/migration behavior.
- `scripts/healthcheck-vps.mjs`: actionable health-check error messages, without secrets.

No database migration, persistent volume, or school record was changed by this patch.

## Deployment

1. Take a backup of persistent `/data/state` and current production credentials (keep secrets private). **Do not delete volumes, clear database files, or reset the application.**
2. Copy the three runtime/authentication files and one test file in the patch into the repository at the same relative paths, preserving the existing project. Commit and push so that the Git SHA changes, then deploy once. Repeatedly redeploying an unchanged commit can reuse the cached image.
3. Inspect **Runtime Logs** in Coolify, not only **Deployment Logs**. Look for `[khotwa-startup]` and `D1 migration failed`, `Invalid KHOTWA_ADMIN_PASSWORD_HASH`, `Missing required environment variable`, `Wrangler stopped`, or `Private SMTP relay`.
4. If Runtime Logs are sparse, use Coolify's VPS/host SSH terminal:

```bash
docker ps -a --filter name=khotwa --format 'table {{.Names}}\t{{.Status}}\t{{.ID}}'
CID=$(docker ps -aq --filter name=khotwa | head -n 1)
[ -n "$CID" ] && docker inspect "$CID" --format 'Exit={{.State.ExitCode}} Restarts={{.RestartCount}} OOMKilled={{.State.OOMKilled}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}'
[ -n "$CID" ] && docker logs --tail 180 --timestamps "$CID" 2>&1
```

5. Do **not** post any passwords, hashes, tokens, SMTP credentials or connection strings. Share the runtime *error messages* and exit/status diagnostics if you need help with the next fix.

## What the error implies

- `Invalid KHOTWA_ADMIN_PASSWORD_HASH`: Docker Compose has probably expanded the `$` separators. Store the PBKDF2 value as a **literal** Coolify environment variable (do not send the value to ChatGPT).
- `Missing required environment variable`: restore the named setting in Coolify.
- `D1 migration failed`: inspect Wrangler's actual SQL message above the diagnostic line and the existing migration table; do not manually rerun or delete migration records without a backup and review.
- `OOMKilled=true` or `Exit=137`: investigate VPS memory usage and process limits.
- `Health=unhealthy`, `Exit=0` / no restarts: investigate `/readyz` response and Worker DB readiness; health checking alone does not prove the process crashed.
- `Wrangler stopped` or process exits with other codes: runtime worker crash; use error stack in Runtime Logs.

## Verification done locally

- Existing Khotwa auth, origin, tenancy, multi-school, SMTP, invitation test suite passed.
- Fushati auth test passed including new login POST action assertions.
- Fushati ledger test passed.
- Original migrations 0000–0027 applied in a fresh SQLite database using Python SQLite.
- Node syntax checks on patched `.mjs` files passed.

Full Docker/Cloudflare Wrangler application startup could not be reproduced here because the required project dependencies are not locally installed and the package registry is not reachable. Do not treat this patch as confirmation that the production restart is resolved.
