Khotwa v10 / Fushati — Build ERR_MODULE_NOT_FOUND hotfix (2026-11-23)

The uploaded Coolify deployment log fails at Dockerfile test stage because:
Cannot find module /app/lib/fushati/identifiers.ts imported from /app/lib/standalone-auth.ts.

The existing lib/standalone-auth.ts contains imports of new Fushati modules.
These files were present in the supplied v10 release ZIP but the deployed build
context is missing at least identifiers.ts. This package restores the six new
supporting files that were added to v10, not the modified older files.

Instructions:
1. Open your Khotwa repository main branch.
2. From this ZIP, place files in the EXACT paths below, relative to the project root
   (the folder containing Dockerfile and package.json):
   lib/fushati/identifiers.ts
   lib/fushati/invitations.ts
   lib/fushati/categories.ts
   lib/admin-credentials.ts
   lib/school-stages.ts
   drizzle/0028_khotwa_fushati_enhancements.sql
3. Confirm these paths exist on GitHub (not nested inside an extra khotwa-main folder).
4. Commit and push ALL new files; using git on your PC, verify with:
   git ls-files lib/fushati/identifiers.ts lib/fushati/invitations.ts
5. In Coolify, redeploy the new commit. Confirm the build log no longer shows
   ERR_MODULE_NOT_FOUND for identifiers.ts, then check remaining tests/build.
6. Do not reset /data/state or delete any database tables. A database backup is
   advised before deploying migration 0028 to an existing installation.

Tests performed on original complete-source release (Node 22.16.0):
- node --experimental-strip-types scripts/test-khotwa-auth.mjs — PASS
- node --experimental-strip-types scripts/test-fushati-auth.mjs — PASS

This hotfix does not establish that the entire Docker build or Coolify runtime succeeds.
If the same error persists despite seeing the file on GitHub, inspect .dockerignore
and verify that the build's Dockerfile context/root points to the project folder.

Secondary log warning:
Docker Compose reported that two random-looking variable names were unset.
Such warnings can occur when a value containing $ characters is interpolated;
review how secret/password-hash values are supplied, without sharing them.
