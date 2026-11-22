# Khotwa — Saudi location selection, identity permissions, and shared parent accounts
Release prepared from the uploaded `khotwa-main(6).zip` (22 November 2026).

## What changed

1. **Saudi schools only:** The central administrator creates or edits a school with a Saudi administrative region and a dependent city dropdown. The server validates that the city belongs to the selected province. The list contains all **13 administrative regions and a curated list of their common cities**; it does **not** claim to include all smaller villages and towns. To add a missing city, extend `lib/saudi-locations.ts` before saving that school.
2. **School identity:** Only the system admin may edit the school name and the `deputy` (Student Affairs Agent) and `principal` (School Manager) report-header names. The agent sees these fields read-only. A direct POST to `/api/data` with `op=settings` is rejected for agents. The central administrator continues to create, rename, activate, disable or move accounts; account names are synchronized to the corresponding school report header.
3. **Agent self-service after first sign-in:** `/account` lets an activated Student Affairs Agent change their own password using their current password or request a change to a new email address without admin involvement. New email changes must be confirmed using a time-limited emailed link (30 minutes). The current email remains valid until the link is opened. Password or successful email changes invalidate existing sessions. Display names cannot be changed by the agent. It uses the existing Hostinger SMTP setup.
4. **Parents login by phone/password:** `/parent-login` no longer requests a school code. Parent credentials now live in global `khotwa_parent_identities` keyed by the normalized Saudi mobile number, while each school's grants, students, attendance, and cases remain isolated in that school's own tables. Each parent's active memberships are indexed in `khotwa_parent_memberships` for fast lookup; the school-specific `parent_grants` row is checked each time before showing student data. The parent's dashboard displays children from all linked schools, labeled with each school's name.
5. **Agent linking to existing parent:** The agent enters the parent's mobile number; the interface checks whether an existing account already exists. Activating children in a second school links them to the same parent credential. It does not reveal or overwrite the existing password, nor grant an agent access to another school's records. Disabling access in one school affects that school only. For shared multi-school accounts, agent-side password reset is intentionally blocked to prevent any school agent from taking over the parent's entire global login. The parent can change their password in the parent portal.

## Database migration

The added `drizzle/0026_parent_identity_and_school_location.sql` is additive and should run automatically during the existing Coolify startup migrations. It:
- Adds `region` and `city` to `khotwa_schools` with empty defaults, preserving older school rows. Admins should fill in the location of existing schools.
- Adds `khotwa_parent_identities`, `khotwa_parent_memberships`, and `khotwa_account_email_changes`.
- Migrates existing school-scoped parent credentials to one canonical credential per phone; **the earliest active old account's password is kept** if the same phone previously had separate credentials in more than one school. All original `khotwa_parent_users` rows remain in place for rollback/audit. If that parent previously used different passwords for the two schools, the retained canonical password is the one from the earliest active account; the other password will no longer log in. Inform parents about this one-time consolidation, and arrange an authenticated password reset for anyone who no longer knows that credential.
- Backfills memberships from active school-scoped parent accounts. A school-specific enabled `parent_grants` record remains mandatory to see that school's students.

**Before deployment:** back up `/data/state`, plus the persistent uploaded-file volume / R2 data. Verify migration and test logins on a staging clone using fake parent records in two schools. Do not reset the persistent volume. Existing deployment commands and Hostinger SMTP settings are unchanged. The app remains based on the project’s Wrangler/Miniflare local-preview runtime, which is not a production security certification for sensitive student records.

## Verification run on the supplied source

- SQLite: all migrations `0000` through `0026` executed without error.
- `scripts/test-shared-parent-locations.mjs`: passed (13 provinces, Eastern Province / Al Khobar, invalid city combinations, migration canonical password, two-school membership, disabled grant isolation).
- `scripts/test-multischool-auth.mjs`: passed (updated to phone-only shared parent login).
- `scripts/test-khotwa-auth.mjs`, `scripts/test-deputy-invitations.mjs`, `scripts/test-school-tenancy.mjs`, `scripts/test-school-deletion.mjs`: passed.
- TypeScript / TSX source syntax: parsed with TypeScript compiler API; no syntax errors detected in changed files.
- `pnpm build`, live Coolify deployment, and live SMTP confirmation were not run because dependencies, a live deployed database, and mail access are not available in this environment.

## Acceptance test

1. Admin: create a test school with **Eastern Province → Al Khobar**, create both a manager and a Student Affairs Agent, then test school rename and account display-name changes.
2. Agent: school name, principal name and deputy name must be read-only; attempt to POST `op=settings` directly must return HTTP 403. Update a student and link their parent normally.
3. Agent: visit `/account`, change the password and log in again. Then initiate an email change, open the verification mail, and log in with the new email.
4. Create a parent and child in school A; note the temporary password. Create another child with that same phone in school B; school B should link the parent without issuing any new password.
5. Parent: sign in using **phone + the original password**, without school code. Both children's names and schools should appear. Disabling school B's grant must remove only B's student from the parent view. Trying to reset the shared password from an agent page must be blocked.
