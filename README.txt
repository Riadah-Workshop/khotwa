Khotwa admin-login Origin:null fix — 2026-11-22

Symptoms verified in Chrome DevTools:
POST https://www.khotwa-ksa.com/admin-login => HTTP 403
X-Khotwa-Auth-Reject: invalid-origin
Origin: null
Sec-Fetch-Site: same-origin
Sec-Fetch-Mode: navigate
Sec-Fetch-Dest: document

REPLACE THESE TWO FILES AT THE SAME PATHS IN YOUR CURRENT GITHUB REPOSITORY:
  lib/standalone-auth.ts
  scripts/test-khotwa-auth.mjs

Do not delete other files or recreate Docker volumes. The production code change
is confined to loginOriginRejection in lib/standalone-auth.ts.

Why: strict URL parsing rejected the browser's literal Origin:null. The new
branch permits Origin:null ONLY when browser-provided Fetch Metadata proves
that it is a same-origin top-level navigation. Existing HTTPS allowlisted
Origin checks remain unchanged. Cross-site and same-site opaque-origin
requests remain blocked. No password/security settings are disabled.

Manual verification:
1. Save these 2 files in the GitHub Khotwa project at the exact paths.
2. Redeploy once in Coolify. Keep the persistent /data/state volume.
3. Test login at https://www.khotwa-ksa.com/admin-login in a new incognito tab.
4. Check POST status in DevTools: no more invalid-origin 403.
   A 401 means credential rejection, a 303 means successful sign-in.
5. If 401 persists, confirm KHOTWA_ADMIN_EMAIL and the literal hash in Coolify,
   but never share secrets in chat/screenshots.

Local checks passed:
  node --experimental-strip-types scripts/test-khotwa-auth.mjs
  node --experimental-strip-types scripts/test-multischool-auth.mjs
  node --experimental-strip-types scripts/test-deputy-invitations.mjs
  node --experimental-strip-types scripts/test-origin-policy.mjs

This is a source-code correction only. Live production behavior requires
redeployment and verification. For the longer term, standardize a single
canonical hostname in Coolify to avoid redirecting form POST requests.
