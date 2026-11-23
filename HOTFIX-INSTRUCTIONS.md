# Khotwa / Fushati migration 0027 hotfix — 2026-11-23

## Root cause

The original `drizzle/0027_fushati_cafeteria.sql` used nested `CASE ... END` expressions in the `fushati_ledger_after_insert` trigger. Wrangler 4.92.0's SQL statement splitter misidentified the trigger's closing `END`, split a single trigger into two fragments, and produced `incomplete input: SQLITE_ERROR` while applying migration 0027. Khotwa exits with status 1 when migration fails; Coolify restarts it.

## Exact replacement

Replace **only** the existing file:

`drizzle/0027_fushati_cafeteria.sql`

with the version supplied here. The corrected trigger uses `IIF()` (SQLite 3.32+) in place of nested `CASE ... END`. Tables, indexes, other trigger protections and the migration filename remain unchanged.

**Important:** If your GitHub repository already has `drizzle/` at its root, upload the file directly into that folder. Do not create an additional `khotwa-main/` folder.

## Deployment instructions

1. Back up the existing Coolify persistent storage `/data/state` (including its database) before applying any migration.
2. In GitHub, overwrite `drizzle/0027_fushati_cafeteria.sql` with this file, commit the change and verify a **new commit SHA** appears.
3. Use Coolify **Redeploy**. You do not need to clear build caches or delete persistent storage.
4. In Coolify > Runtime Logs, confirm that migration 0027 applies without an error and the application reaches its startup message.
5. When the container is running, check Khotwa's login pages and a simple Fushati action before using it with real financial data.

## What to do if it still restarts

From VPS shell:

```sh
docker ps -a --filter name=khotwa
docker logs --tail 150 "$(docker ps -aq --filter name=khotwa | head -n 1)"
```

Share the newest error text. If the logs still show the *same* `incomplete input` error, confirm the new image contains the corrected file and Coolify did not reuse an old image.

Do not delete the database, drop tables, modify `d1_migrations`, or run a destructive migration rollback. Existing school/student/parent data is not changed by this hotfix.

## Checks performed before packaging

- Examined migration 0027 from `khotwa-main(8).zip`.
- Reproduced the incorrect split using the Wrangler 4.92.0 splitter algorithm (19 fragments; second trigger split).
- Verified the corrected file produces 18 complete SQL statements, with both triggers intact.
- Applied corrected SQL to SQLite 3.46.1 in a test database.
- Tested credit posting, purchase posting, daily and monthly counter rollover, daily-limit rejection, insufficient-balance rejection, and unchanged balances after rejected postings.

This was **not** a live test on the user's Coolify server; production startup remains to be verified after deployment.
