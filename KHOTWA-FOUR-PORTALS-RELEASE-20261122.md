# Khotwa — Four portals, administrator controls, school-manager reports
Release: 2026-11-22 (based on `khotwa-main(5).zip`)

## Entry URLs (same host)

| Role | Login | Destination | Access |
|---|---|---|---|
| System administrator | `/admin-login` (`?lang=en` for English sign-in) | `/admin` | All actual schools, accounts, permissions, all school data, rename, enable/disable, record and school deletion |
| Student Affairs Agent (وكيل شؤون الطلاب) | `/login` | `/` | Full existing school-specific workflow; permanent delete operations restricted to system admin |
| School manager (مدير المدرسة) | `/manager-login` | `/manager` | **Only own school's** overview, attendance/case pie charts, grade/trend charts, date filter, CSV export, browser print/save PDF; no writes |
| Parent (ولي الأمر) | `/parent-login` | `/parent` | Own linked students only, after agent activates access in that school and provides credentials |

English name of `وكيل شؤون الطلاب` is **Student Affairs Agent**; existing Arabic UI text is unchanged. The central admin interface now has Arabic/English switching, retained in browser local storage. The admin login has an English toggle, too. The new school-manager dashboard has an Arabic/English toggle.

## Administrator actions

- Manage schools: create, edit name and code (rename), active status, open school as administrator, **permanently delete** with exact school code confirmation.
- Manage accounts: invite school agent or school manager, track email acceptance, password activation and first login, move to a school, update display name, enable/disable, resend activation, permanently delete with email confirmation.
- Browse records from all **23 school-specific database tables**, search by identifier and available identifying fields, and delete an individual record only after entering its exact key. Foreign-key constraints prevent deleting a referenced record until dependent records have been removed. Files associated with deleted evidence are removed from the R2 bucket when accessible.
- Permanently delete a parent's credentials and school grant only from central admin. School agents retain the original ability to activate, reset or *disable* (not hard-delete) parent access.
- Destructive requests are validated on the API, not just hidden in the interface. Administrative deletion attempts have an operational database audit trail (`khotwa_admin_delete_audit`).

**IMPORTANT:** The `MAIN` row is deliberately excluded from the visible School List. Its `default` partition is retained to prevent loss of existing records; old records remain accessible to the administrator via a separate legacy-data button and the records browser. Do not delete the `default` base tables.

## Database changes and Coolify deployment

New, additive SQL migrations:
- `drizzle/0024_khotwa_managers.sql`: manager role mapping without rebuilding legacy constrained accounts/invitation tables.
- `drizzle/0025_admin_delete_audit.sql`: deletion audit records.

School managers reuse the existing secure school-account activation, but are authenticated with a distinct manager role and separate login. Their requests can only reach `/manager` and GET/HEAD `/api/manager/*` at the authentication gateway. Other users cannot access manager APIs. Managers cannot access the main school-agent app or any write API.

For the existing **Coolify Dockerfile** setup:
1. **Back up the persistent `/data/state` volume (database + uploaded files) and any external storage first.** Keep a tested restore point. Never reset this volume during redeployment.
2. Replace the code with the **full updated project**, commit/push to the GitHub branch used by Coolify, and redeploy with the original persistent volume, domain, HTTPS proxy, SMTP and environment variables intact.
3. Existing `scripts/prepare-vps-config.mjs` includes SQL migrations in the build, and `scripts/launch-vps-preview.mjs` automatically applies pending migrations against the persistent local D1 store at startup. Do not manually repeat a migration.
4. Check Coolify logs for successful migrations and server startup. Verify `/healthz` and log in as admin. Create a **test school**, one agent and one manager; open the manager's invitation and activate password. Check reporting and permission blocks. Test parent access with a dummy student, then verify no school data can cross account boundaries.
5. **Use a staging copy and dummy data before doing any deletion.** Test school deletion and restore from backup on staging. Permanent delete has no undo.

**Security context:** This project's existing `Dockerfile` uses a Wrangler/Miniflare local preview runtime and is labeled **staging** in the original project. It is not independently certified as a hardened public production stack for sensitive student records. Do not treat these code changes or tests as a production security certification; validate deployment infrastructure, privacy and backups before relying on it for live school data.

## Validation

Passed locally with Node 22 experimental TypeScript stripping and SQLite in-memory fixtures:

```
node --experimental-strip-types scripts/test-khotwa-auth.mjs
node --experimental-strip-types scripts/test-deputy-invitations.mjs
node --experimental-strip-types scripts/test-multischool-auth.mjs
node --experimental-strip-types scripts/test-school-tenancy.mjs
node --experimental-strip-types scripts/test-origin-policy.mjs
node --experimental-strip-types scripts/test-school-deletion.mjs
```

TypeScript/TSX parser reported no syntax errors in the modified source files. A complete dependency install, `pnpm build`, deployed smoke test and live email-delivery test were **not run** in the provided environment (no project `node_modules` available). Review build logs and verify with a test account before applying to production.

## Notable preserved functions

Existing school-agent student management, attendance, cases, communication, parent grants, school work, reports, scheduled tasks, backup, translation, Hostinger SMTP email invitations and user names/data remain intact. Parent-specific login and API isolation are retained, not rebuilt.
