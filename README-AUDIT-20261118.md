# Khotwa deployment and login audit patch (18 November 2026)

Apply the five changed/new files at their paths in your existing private GitHub repository:
- `Dockerfile`: separate the dependency-install layer from changing source files; run the auth test before compiling.
- `.dockerignore`: avoid transmitting local secrets, generated state and dependency directories into Docker builds.
- `lib/standalone-auth.ts`: preserve the strict allowlisted-origin rule, report a nonsecret rejection reason, and expose a public auth revision marker in `/healthz`.
- `scripts/test-khotwa-auth.mjs`: regression coverage for revision and rejection categories.
- `README-AUDIT-20261118.md`: this guide.

This package does NOT replace the school application, modify its database, or change the Docker Compose persistent volume. All other files must stay untouched.

After a SUCCESSFUL Coolify redeployment of the latest GitHub commit, check:

```bash
curl -fsS https://khotwa-ksa.com/healthz
```

Expected JSON includes `"auth_revision":"khotwa-audit-20261118-v3"`.

Then check *only dummy credentials*:

```bash
curl -sS -D - -o /dev/null -X POST 'https://khotwa-ksa.com/login' \
  -H 'Origin: https://khotwa-ksa.com' \
  -H 'Sec-Fetch-Site: same-site' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'email=invalid%40example.com&password=invalid'
```

Expected HTTP 401. If you get HTTP 403, inspect `X-Khotwa-Auth-Reject`; the result is a safe reason code, not the password. Missing `auth_revision` means you are still on an older build, or another service is answering the request.

To inspect browser POST, Chrome F12 > Network > Preserve log > submit with dummy credentials > POST /login > Headers. Report only status, Origin, Sec-Fetch-Site, X-Khotwa-Auth-Reject and Request URL. NEVER share cookies, password, form payload, authorization headers, environment values or session secret.

For deployment queues: Coolify > Advanced > Deployment > Auto deploy > Manual deployments only while iterating, then manually deploy once; cancel stale queued jobs after checking that none is actively replacing your running service. Set max concurrent builds = 1 if RAM is limited. Once validated, re-enable auto deploy if desired.

Keep testing data only. The application uses `wrangler dev`/Miniflare as its HTTP server: this is a staging preview, not a secure public production architecture. The exposed account password and signing secret from earlier terminal screenshots must be rotated and protected with valid HTTPS before any login.
