# Khotwa • GitHub → Coolify on a VPS (initial private staging test)

**IMPORTANT:** This source came from a ChatGPT Sites / Cloudflare Workers app. The attached Dockerfile runs the **Wrangler/Miniflare local preview** with local D1 (SQLite) and R2-emulated object files. Cloudflare explicitly does not position this development simulator as a hardened public production platform. This path is ONLY to bring up a private staging copy and verify the current features. Do not store real student, parent, phone, or medical data in this staging instance. Production requires a separate deployment decision and security, migration, backups, and integration verification.

## 1. Make a private GitHub repository

Extract `Khotwa-GitHub-Coolify-Staging.zip`. Enter the `khotwa` directory (contains `package.json`, `Dockerfile`, `docker-compose.yml`). From Git Bash or a terminal:

```sh
git init
git add .
git commit -m "Initial Khotwa source and Coolify staging deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/khotwa.git
git push -u origin main
```

First create the empty, **Private** `khotwa` repository on GitHub. For the push, use GitHub authentication (GitHub Desktop, Git Credential Manager, or SSH). Do not upload a ZIP as one file inside the repo. Do not commit the output of the credentials generator or any `.env` file.

## 2. Create the staging credentials

Run on a trusted computer with Node.js 22+:

```sh
node scripts/create-admin-credentials.mjs
```

The command prints three Coolify environment variables (`KHOTWA_ADMIN_EMAIL`, `KHOTWA_ADMIN_PASSWORD_HASH`, `KHOTWA_SESSION_SECRET`) and one random password for **your private password manager only**. Replace the example email with your actual intended admin email. The password must NOT go in Coolify or GitHub; only the hash does. Use HTTPS in Coolify (the session cookie uses `Secure`).

## 3. Coolify setup

1. Open Coolify, create/open project **Khotwa** and select a **Staging** environment on your VPS.
2. Select **+ New → Git repository** (private repository through GitHub App or deploy key) and choose `khotwa`, branch `main`.
3. Set **Build strategy: Docker Compose**, **Base Directory: /**, **Docker Compose Location: /docker-compose.yml**. These options follow the Git-based Compose app path in current Coolify.
4. Enter the three secrets from Step 2 under **Environment Variables**. Treat them as secrets. Avoid spaces/quotes around values you copied from the generator.
5. Under **Domains**, route your staging hostname to service **khotwa**, internal port **3000**. For example, `https://test-khotwa.example.com:3000` in the Coolify domain field (public browser URL is normal `https://test-khotwa.example.com`). Set your DNS A record to the VPS public IP. Turn on TLS/Let's Encrypt in Coolify.
6. For extra protection, **restrict access to trusted testers at the proxy or VPN**. Avoid public indexing and do not add real student data.
7. Click **Deploy**. The image will install dependencies, build the Worker, apply all ordered SQL migrations once to the local persistent D1 store, and start the stage preview.
8. Open `/login` on your staging domain and sign in with your chosen email and generated password. Then open `/` and check the dashboard.

## 4. First verification

- Login should show **خطوة • Khotwa**; an unauthenticated API call should return 401.
- Check that `GET /healthz` reports `{"service":"khotwa","status":"up"}`.
- Verify Students, attendance, cases, reports and an evidence upload with **dummy** data. Restart/redeploy and check records still exist; the `khotwa-preview-state` Docker volume stores the local database and uploaded files.
- Verify form submissions: some original routes compare the request `Origin` to the internal Worker URL; a reverse-proxy hostname/scheme mismatch can return HTTP 403 and must be tested before relying on the preview.
- The original live database, uploaded attachments, and ChatGPT Sites connector services **are not in the source archive**. Parent/visitor endpoints requiring other services remain unconfigured. Some features may show unavailable until integrated.

## 5. Maintenance and important limits

- A redeploy **must retain the `khotwa-preview-state` named volume**. Deleting it deletes the test data. Back it up before major changes.
- The supplied login is **one staging administrator**, not staff accounts, role management, SSO, or password reset. It strips untrusted `oai-authenticated-*` headers before injecting identity from a validated signed session, but is not a substitute for a production security review. Put a separate access layer / rate limiter in front.
- `lib/brand.ts` and `lib/care-access.ts` retain the source author's registered ownership, school labels, and owner-specific care-access list. They are **not** automatically reassigned by renaming the app. The new admin may not have access to restricted care data until permissions are carefully re-designed.
- The registration PDF/PNG has been *renamed as an asset path*, not altered inside: it is an original third-party/owner certificate. Do not present it as a Khotwa ownership certificate.
- `ORIGINAL-SOURCE-MANIFEST.json` and `README-SITES-ORIGINAL.md` are preserved as historical provenance. The original owner rights and attribution were not erased.
- Production: decide between deploying the Worker properly to Cloudflare with D1/R2 and real identity, or engineering a Node/postgreSQL/S3 (or local SQLite/object storage) migration for permanent VPS hosting with a proper auth and backup system. A `wrangler dev` container is not a recommended production endpoint.
