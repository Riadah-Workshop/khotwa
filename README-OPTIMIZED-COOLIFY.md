# Khotwa — targeted optimization and Coolify repair (18 Nov 2026)

This is a **compatibility-first refactor of the supplied Khotwa source**. Existing feature routes, screen names, styling, Arabic/English translations, schema, SQL migrations, and original ownership/credit assets remain in place. This is **not** a full migration off Cloudflare's local development simulator. Run it as **private staging with dummy data only**, not a production school/medical records system.

## What changed

1. **Deployment:** Docker build cache for pnpm; added `.dockerignore` and `.gitignore`; a separate runtime stage contains compiled output, package dependencies, required boot scripts, and a public-asset fallback instead of blindly copying the full source tree; removed expensive recursive `chown` on all dependencies. The runtime still contains Wrangler and its dependencies (needed by the present architecture), so do not expect a tiny image.
2. **Runtime stability:** `init: true`, graceful shutdown, longer readiness grace period, a `/readyz` database/schema-aware probe, and a health check that uses this probe. Database migrations still run at startup **every time** for safety (preserving the persisted local DB and applying newly added migrations).
3. **403 on POST APIs:** 15 existing API handlers now use one shared origin policy (`lib/request-origin.ts`) instead of comparing the browser's public HTTPS origin with the internal HTTP Worker URL. Only exact HTTPS origins in `KHOTWA_PUBLIC_ORIGINS` are accepted; same-site checks and existing missing-Origin requirements are preserved. Browser-supplied forwarded headers **do not** bypass the policy.
4. **403 at login:** exact allowlisting remains mandatory. If `Origin` is missing but a browser sends `Sec-Fetch-Site: same-origin`/`same-site` and an allowlisted HTTPS `Referer`, login accepts that legitimate request. Unlisted, cross-site and malformed requests still get 403. The login page uses `Referrer-Policy: same-origin`; the auth revision is `khotwa-opt-20261118-v4`.
5. **Frontend:** many large, infrequently visited dashboard panels are loaded **when their section is opened** with React lazy/Suspense; the original component props, screen names, navigation, HTML/CSS, and API operations are preserved. Visitor/message notification-count hooks remain available immediately from a small shared module, without loading their complete management panels.
6. **Integrations:** optional original portal/service environment keys are now passed through in `docker-compose.yml` instead of silently being omitted from the container. These integrations still need working URLs, credentials and external services; this patch does not create those services.
7. **Assets:** `public/haramain-logo.png` was recompressed **losslessly** (pixel content identical) to save about 99 KB.

## What was intentionally NOT changed

- No Drizzle schema changes, SQL migrations, data deletion or data migration.
- No menu/feature removals, translations/labels/design changes, auth account replacement or password reset.
- No automatic conversion from D1/R2 to PostgreSQL/S3; that needs a separately tested production migration.
- No change to original authorship, credit, school identity, registration documents or access-control rules.
- No default disabling of features. Existing optional external integrations are still optional.

## Deployment instructions: safest path

**Step 0 — BACK UP BEFORE OVERWRITING.** Keep a copy of the existing GitHub commit and back up the current **Docker named volume** holding `/data/state`. The Compose volume key is `khotwa-preview-state`, but Coolify may prefix the real Docker volume name. Verify it first using `docker volume ls` or `docker inspect`. Do **not** remove the volume, run `docker compose down -v`, or create a new empty volume if you need existing test data. Preserve the current three admin environment variables (and rotate any exposed old credentials).

**Step 1 — update GitHub.** Choose either:

- **Replacement-only ZIP:** extract it and copy the files to the **same relative paths** in your existing private GitHub repository. New files need to be added, too.
- **Full-source ZIP:** extract it and update the code of your existing private GitHub repository. Do **not** put the ZIP file itself inside the repository. Preserve existing GitHub repo/branch, Coolify project and volume configuration.

**Step 2 — verify Coolify.** Keep `Build Pack = Docker Compose`, `Docker Compose file = /docker-compose.yml`, service `khotwa` and internal port `3000`. Ensure the application is reached over **HTTPS**. Set:

```dotenv
KHOTWA_PUBLIC_ORIGINS=https://khotwa-ksa.com,https://www.khotwa-ksa.com
KHOTWA_ADMIN_EMAIL=<your-existing-admin-email>
KHOTWA_ADMIN_PASSWORD_HASH=<your-existing-pbkdf2-sha256-hash>
KHOTWA_SESSION_SECRET=<your-existing-long-random-secret>
```

**Do not** place real values in Git, logs, screenshots or support messages. If the actual public hostname is different, set `KHOTWA_PUBLIC_ORIGINS` to the **exact public HTTPS origin(s)** used by browsers; no trailing slashes or paths. The previous credential values do not need to change just to install this patch, but rotate if exposed.

Other existing optional environment keys can be set if those services exist: `VISITOR_PORTAL_URL`, `VISITOR_ADMIN_KEY`, `PARENT_SERVICE_KEY`, `BACKUP_EXPORT_KEY`, `BACKUP_EXPORT_EXPIRES_AT`, `CARE_IMPORT_KEY`.

**Step 3 — deploy one commit only.** Avoid overlapping/repeated auto-deploys while testing. Docker BuildKit is required for the pnpm cache mount (normally present in modern Docker/Coolify installations). The first build still downloads dependencies and compiles the Worker, so it may be slow; later source-only rebuilds can reuse the dependency layer. A database migration check always occurs at container start.

**Step 4 — verify safely.** Use your public hostname:

```sh
curl -fsS https://khotwa-ksa.com/healthz
curl -fsS https://khotwa-ksa.com/readyz
```

Expected `/healthz`: `"service":"khotwa"`, `"status":"up"`, and `"auth_revision":"khotwa-opt-20261118-v4"`. Expected `/readyz`: HTTP 200 and `"status":"ready"`. An unconfigured or still-starting database gives `/readyz` HTTP 503. The container health check now detects it instead of reporting a false success.

Open `/login` in a browser; log in, then verify **with dummy records**: dashboard, student list, add/edit, attendance, cases, visitor/message counts, reports, a test evidence file, and a restart/redeploy with data still present. Test both public hostnames if you use both. Check the optional integrations only if they have been configured.

**Step 5 — investigate unexpected 403/401.** On the login POST in browser developer tools, record *only* status, `Origin`, `Sec-Fetch-Site`, request URL, and `X-Khotwa-Auth-Reject`. If `origin-not-allowlisted`, fix `KHOTWA_PUBLIC_ORIGINS`; if `missing-origin`, inspect browser privacy policy/proxy and the HTTPS form submit. Do not share Cookie/Set-Cookie, credentials, request form body or secret environment variables. HTTP 401 with intentionally invalid credentials is expected. An unauthenticated POST to a protected API should return 401.

## Offline checks completed for this package

- `node --experimental-strip-types scripts/test-khotwa-auth.mjs` — passed.
- `node --experimental-strip-types scripts/test-origin-policy.mjs` — passed.
- TypeScript/TSX parser checks — no syntax parse errors.
- Original source paths, screen names, database schema and all numbered migrations retained; compressed logo has identical decoded pixels.

### Not possible to validate in this sandbox

The full `pnpm install`, Vite/Vinext production compile, runtime database migration, Coolify container startup, browser page sizes and live regressions **were not executed** because the package registry is not reachable in this execution environment and Docker is unavailable. **Do not claim this deployment has passed production or end-to-end testing.** Perform the smoke checks above on a private staging deployment before allowing users in.

## If the new release fails

1. In Coolify, redeploy the last known-good **Git commit** (or restore the original source archive to the same GitHub repository).
2. Keep the **same existing volume** and existing environment credentials; do not reset or recreate the database.
3. Check `/healthz`, `/readyz`, and deployment logs for dependency, migration, port/proxy or origin failures.
4. If the local D1 volume itself has been damaged, restore it from your **pre-deploy volume backup** using your normal tested recovery procedure — do not overwrite the only copy.

## Long-term production architecture recommendation

The startup command remains `wrangler dev` + Miniflare, even after these optimizations. That is a local **development simulator**, not a hardened, supported always-on production architecture. For a permanent public school platform containing sensitive student or family records, plan a separately tested migration to a production runtime and managed/persisted database/object storage (for example, a properly implemented Node runtime with PostgreSQL + S3-compatible storage, or a production Cloudflare Worker with D1/R2), plus user/role authorization, backups/restore drills, throttling, audit logging, and integration tests. That is a different migration and **cannot responsibly be represented as completed by this patch**.
