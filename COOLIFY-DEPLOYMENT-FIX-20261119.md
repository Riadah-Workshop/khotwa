# Khotwa Coolify deployment correction — 2026-11-19

## Observed failure (from deployment log 08:22:49)

The repository deployed commit `d4a55a72735a21f0bd6af3fb89f87a3a08331d9c`. It failed before Vite compilation in Dockerfile step `RUN node --experimental-strip-types scripts/test-khotwa-auth.mjs`. The deployed test expects `khotwa-opt-20261118-v4` but the updated authentication gateway reports `khotwa-multischool-20261119-v1`. This is a stale test in GitHub, not a VPS timeout.

**Fix:** Upload the `scripts/test-khotwa-auth.mjs` from this correction archive to the **same path** in `Riadah-Workshop/khotwa`, branch `main`, overwriting the older file, then commit. Confirm GitHub's line near the top expects `khotwa-multischool-20261119-v1`. If more than one file was missed during the first upload, replace the full project contents instead. Never upload a nested `khotwa-main/` directory under the repository root.

## Second issue: Compose is expanding the admin password hash

The log also reports two random-looking variables unset. These are the two base64url fragments of the PBKDF2 password hash after `$`. Docker Compose substitutes empty strings for unknown variables, which corrupts `KHOTWA_ADMIN_PASSWORD_HASH` and can prevent authentication even if the build succeeds.

In Coolify > Khotwa > Environment Variables, edit `KHOTWA_ADMIN_PASSWORD_HASH` (do not reveal or log the value). Make it a **literal** value, not a variable reference; in versions offering `Is Literal`, enable it. Ensure the value reaching the container retains all three literal `$` separators. For a manually maintained Compose `.env` file, single-quote the **whole value**: `KHOTWA_ADMIN_PASSWORD_HASH='pbkdf2-sha256$240000$SALT$DERIVED'` (SALT and DERIVED are placeholders, not real credentials). Docker Compose official documentation confirms single-quoted `.env` values are literal. Do not use a plain unquoted value containing `$` in a Compose env file. Verify after deployment that the two `variable is not set` warnings are absent.

This patch also validates the password-hash structure at runtime, failing with a clear diagnostic instead of allowing silent login failures. It does not modify the stored password or any school/student records.

## Deploy checklist

1. Back up the persistent `/data/state` volume before changing a deployment.
2. Overwrite `scripts/test-khotwa-auth.mjs` and `scripts/launch-vps-preview.mjs` with the attached files and commit to `main`. Do not replace any school data or persistent state.
3. In Coolify, verify the literal `KHOTWA_ADMIN_PASSWORD_HASH` secret; also retain `KHOTWA_ADMIN_EMAIL` and `KHOTWA_SESSION_SECRET`.
4. Redeploy the new Git commit. The build stage must pass four tests then proceed to Vite compilation.
5. Check application logs for migration completion and verify `/healthz`, `/readyz`, administrator sign-in, one deputy sign-in, and parent sign-in.
6. Do not treat this patch as proof of a successful production deployment; the full build and real VPS have not been reproduced in this environment.

Do **not** disable the Dockerfile tests; they are useful for protecting student data isolation and authentication.
