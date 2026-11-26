# Khotwa — secrets inventory and rotation checklist

`README-AUDIT-20261118.md` (repository root) records that an administrator password and the session-signing secret were shown in terminal screenshots. Treat every value below that was ever pasted into a chat, ticket, screenshot or commit as exposed, and rotate it once. Nothing in this file contains a real value.

All of these are set in Coolify under *Environment Variables*, never in GitHub, never in the image.

## What to rotate

| Variable | What it protects | Rotating it |
|---|---|---|
| `KHOTWA_SESSION_SECRET` | Signs every login cookie | Everyone is signed out at once. Do it first. |
| `KHOTWA_ADMIN_PASSWORD_HASH` (with `KHOTWA_ADMIN_EMAIL`) | The system administrator login | Generate a new pair, see below. |
| `KHOTWA_SMTP_PASSWORD`, `KHOTWA_SMTP_USER` | Mailbox used for invitation e-mails | Change the mailbox password at the mail host, then update here. |
| `KHOTWA_SMTP_RELAY_TOKEN` | Token between the app and the SMTP relay | New random value in both places. |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | E-mail provider access and delivery webhooks | Create a new key / signing secret at the provider, then update here. |
| `BACKUP_EXPORT_KEY` (+ `BACKUP_EXPORT_EXPIRES_AT`) | Key-based backup download | Remove both when no automated backup is running; otherwise new key and a short expiry. |
| `RECOVERY_EXPORT_KEY` (+ `RECOVERY_EXPORT_EXPIRES_AT`) | Key-based recovery export | Same as above. |
| `CARE_IMPORT_KEY` (+ `CARE_IMPORT_EXPIRES_AT`) | Key-based import of student care data | Same as above. |
| `TRIP_PURGE_KEY` (+ `TRIP_PURGE_ID`, `TRIP_PURGE_EXPIRES_AT`) | One-off trip data cleanup | Remove when not in use. |
| `PARENT_SERVICE_KEY`, `VISITOR_ADMIN_KEY` | Shared keys with the external parent/visitor services | New value on both sides; coordinate the switch. |

Not secrets (safe to keep as they are): `KHOTWA_PUBLIC_ORIGINS`, `KHOTWA_FROM_EMAIL`, `KHOTWA_APP_URL`, `KHOTWA_SMTP_HOST`, `KHOTWA_SMTP_PORT`, `VISITOR_PORTAL_URL`.

Keys that carry an `..._EXPIRES_AT` are only accepted until that date. Leave them unset when the job they serve is not running.

## Generate a new administrator login and session secret

1. On your own computer, in a copy of the project: `node scripts/create-admin-credentials.mjs`
2. In Coolify, set `KHOTWA_ADMIN_EMAIL`, `KHOTWA_ADMIN_PASSWORD_HASH` and `KHOTWA_SESSION_SECRET` from the printed lines.
3. Store the printed `KHOTWA_ADMIN_PASSWORD` in a password manager. It is not recoverable from the hash and must not go into Coolify or GitHub.
4. The hash contains `$` characters. Enter it as a literal value (see `COOLIFY-DEPLOYMENT-FIX-20261119.md` in the repository root); if Compose substitutes variables, double each `$` as `$$`.
5. Redeploy and confirm the new password works and the old one is refused.

## Other accounts

- Deputy, manager and cafeteria accounts keep their own passwords in the database. After the rotation, make sure no account still uses a temporary or shared password; the "must change password" flag is available for cafeteria users.
- Any other secret that was ever in a screenshot: the mailbox password, Coolify's own login, GitHub and the VPS provider's console. These are outside the app, so rotate them too.

## Keeping them out of Git

`.gitignore` now excludes `.env*`, key files, local runtime state and release ZIPs, and `.dockerignore` keeps the same out of the image. If a secret was ever committed, rotating it is not optional: deleting the file later does not remove it from history.
