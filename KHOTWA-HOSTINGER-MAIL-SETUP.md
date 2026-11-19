# Khotwa — Hostinger Mail activation emails (19 November 2026)

## Step 1: Hostinger mailbox

Create or select a real Hostinger Email mailbox under Hostinger hPanel → Emails → [your domain] → Mailboxes. Prefer a dedicated sender such as `noreply@your-mail-domain.com`.
If supported, use a **revocable app password** (Mailboxes → Options → App passwords) rather than the primary mailbox password. Keep it private.

## Step 2: Coolify environment variables

```env
KHOTWA_APP_URL=https://khotwa-ksa.com
KHOTWA_FROM_EMAIL=noreply@your-mail-domain.com
KHOTWA_SMTP_HOST=smtp.hostinger.com
KHOTWA_SMTP_PORT=465
KHOTWA_SMTP_USER=noreply@your-mail-domain.com
KHOTWA_SMTP_PASSWORD=REPLACE_WITH_ACTUAL_APP_OR_MAILBOX_PASSWORD
```

- `KHOTWA_FROM_EMAIL` must be identical to `KHOTWA_SMTP_USER` and contain only the email address; no display name brackets.
- Choose **secret / protected** (and **Is Literal**, when relevant for `$` characters) for the password in Coolify.
- Do **not** add `RESEND_API_KEY` or `RESEND_WEBHOOK_SECRET`; they are only for the optional Resend fallback.
- This release supports **TLS SMTP port 465 only**, not STARTTLS 587.
- If your Hostinger plan uses **Titan Email**, set `KHOTWA_SMTP_HOST=smtp.titan.email` instead, after confirming its official configuration.
- Do not remove your existing Khotwa administrator/security variables or existing persistent volume.

## Step 3: Deploy

Back up the Coolify persistent `/data/state` volume. Upload the corrected full Khotwa ZIP contents to the repository root (`khotwa-main/` is the archive wrapper). Commit. Redeploy the current Git commit in Coolify. Do not upload only the README.

## Step 4: Check invitation status

1. Sign in to `/admin-login` and open `/admin`.
2. Create a test deputy assigned to a test school and provide an inbox you control.
3. The dashboard should show **قبله خادم Hostinger للإرسال (لم يتأكد التسليم)** once Hostinger accepts the message.
4. Open the mailbox, click `/activate?token=...` and choose a password; confirm **تم إنشاء كلمة المرور** appears.
5. Log in as that deputy at `/login` and check **سجل الدخول بنجاح**.
6. Verify deputies cannot see other schools or access the main admin login.

**SMTP accepted ≠ delivered/read.** Hostinger delivery logs can be reviewed manually in hPanel → Emails → domain → Email Logs, but this release does not claim an automatic delivered/read signal.

If it fails, check mailbox user/password, outgoing port 465 from your VPS, mailbox sending limits, and that the sender address exactly equals the SMTP login. If Hostinger returns `535`, check SMTP credentials. If it times out, test the VPS firewall/port.

## Runtime warning

The app currently uses Wrangler/Miniflare local preview inside Coolify. Passing tests and an SMTP simulation is not a live delivery test or a production hardening audit. Test with controlled accounts and avoid expanding access to student records until production readiness has been reviewed.

Sources for administrator setup: Hostinger's official SMTP configuration and Email Delivery Logs documentation.
