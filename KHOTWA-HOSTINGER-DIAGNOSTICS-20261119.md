# Khotwa — diagnosing failed Hostinger email invitations

The original `issueDeputyInvite` handler discarded every SMTP exception, so the UI only displayed **فشل الإرسال**. This patch stores **only a non-sensitive error code** for administrators and logs the code in Coolify as `khotwa_deputy_invitation_failed`. It never prints SMTP passwords, complete invitation links, or tokens.

## Deploy
1. Back up the persistent D1 volume `/data/state`.
2. Upload all modified files, **including `drizzle/0023_deputy_invite_diagnostics.sql`**, preserving repository paths.
3. Confirm Coolify has `KHOTWA_APP_URL`, `KHOTWA_FROM_EMAIL`, `KHOTWA_SMTP_HOST`, `KHOTWA_SMTP_PORT`, `KHOTWA_SMTP_USER`, `KHOTWA_SMTP_PASSWORD`.
4. `KHOTWA_FROM_EMAIL` must exactly match `KHOTWA_SMTP_USER`. Hostinger Email normally uses `smtp.hostinger.com:465` with SSL/TLS (verify your product; Titan may differ).
5. Use a **Literal/Secret** variable for the SMTP password if it includes `$`. Never upload passwords to GitHub.
6. Redeploy; click **إعادة إرسال الدعوة** for the failed deputy and read the new **السبب** field in the admin table.
7. In Coolify runtime logs, look for `khotwa_deputy_invitation_failed` and its `errorCode`.

## Error codes
- `EMAIL_PROVIDER_NOT_CONFIGURED`: no SMTP credentials passed into runtime.
- `SMTP_CREDENTIALS_INCOMPLETE`: SMTP user or password missing.
- `SMTP_AUTH_FAILED`: SMTP login rejected by Hostinger (usually wrong user/password, or blocked mailbox).
- `SMTP_SENDER_MISMATCH`: KHOTWA_FROM_EMAIL != KHOTWA_SMTP_USER.
- `SMTP_CONNECTION_TIMEOUT` / `SMTP_CONNECTION_FAILED`: connectivity, outbound port, DNS or VPS firewall problem.
- `SMTP_TLS_FAILED`: TLS handshake/certificate problem.
- `SMTP_SERVER_REJECTED`: Hostinger refused sender, recipient or sending operation; check Hostinger sending limits and mailbox state.
- `SMTP_RUNTIME_UNSUPPORTED`: Cloudflare-compatible Worker simulator cannot open TCP sockets; consider a supported SMTP service over HTTP or a Node SMTP sidecar.

## Test the VPS network without passwords
In the **VPS SSH terminal**, run:

```bash
openssl s_client -connect smtp.hostinger.com:465 -servername smtp.hostinger.com -brief < /dev/null
```

A successful certificate/TLS negotiation proves the host can reach port 465; it does **not** prove the login password is correct. If `openssl` is missing, install it via your usual VPS package management process or use `nc -vz smtp.hostinger.com 465`.

## Limitations
Only a successful SMTP `250` after `DATA` indicates acceptance by Hostinger, not delivery to the recipient. This staging deployment runs Wrangler/Miniflare behind Coolify; a complete production hardening review remains required.
