# Khotwa Hostinger SMTP connection/diagnostics fix — November 19, 2026

This package builds on `khotwa-hostinger-email-diagnostics-full-20261119.zip`. It does not alter school, parent, or student tables, and does not reset any accounts.

## What changed

- `lib/hostinger-smtp.ts`: wait for Cloudflare TCP socket `opened` (previously incorrectly used `ready`), track SMTP stages and connection timeout, wrap unknown errors in safe codes without exposing credentials.
- `lib/deputy-invites.ts`: classify SMTP failures by stage and log stage/type safely in Coolify; preserve explicit SMTP server codes.
- `app/admin/admin-console.tsx`: Arabic explanations of new stage error codes.
- `scripts/test-hostinger-smtp.mjs`: improved mock and error tests for TLS connection readiness.

## Verify noreply is its own mailbox

Your successful VPS email test previously used `emad@khotwa-ksa.com`, not `noreply@khotwa-ksa.com`. Confirm `noreply@khotwa-ksa.com` exists as a mailbox (not merely an alias or forwarder) and has its own valid SMTP password or app password.

Test using the same account that Coolify uses:

```bash
python3 - <<'PYMAIL'
import smtplib, ssl, getpass
from email.message import EmailMessage
sender='noreply@khotwa-ksa.com'
password=getpass.getpass('Hostinger noreply password (hidden): ')
to=input('Test recipient: ').strip()
msg=EmailMessage()
msg['From']=sender
msg['To']=to
msg['Subject']='Khotwa SMTP test'
msg.set_content('SMTP test from VPS')
try:
    with smtplib.SMTP_SSL('smtp.hostinger.com',465,context=ssl.create_default_context(),timeout=20) as smtp:
        smtp.login(sender,password)
        smtp.send_message(msg)
    print('SMTP ACCEPTED')
except smtplib.SMTPAuthenticationError as exc:
    print('SMTP AUTH FAILED',exc.smtp_code)
except Exception as exc:
    print('FAILED',type(exc).__name__)
PYMAIL
```

Never reveal the password or activation tokens.

## Coolify environment

```
KHOTWA_APP_URL=https://khotwa-ksa.com
KHOTWA_SMTP_HOST=smtp.hostinger.com
KHOTWA_SMTP_PORT=465
KHOTWA_SMTP_USER=noreply@khotwa-ksa.com
KHOTWA_FROM_EMAIL=noreply@khotwa-ksa.com
KHOTWA_SMTP_PASSWORD=REPLACE_WITH_VERIFIED_SECRET
```

Ensure the password is a literal/secret value in Coolify, especially if it includes `$`. Redeploy and click «إعادة إرسال الدعوة» again.

When an error occurs, the dashboard should now show `SMTP_STAGE_CONNECT`, `SMTP_STAGE_GREETING`, `SMTP_STAGE_EHLO`, `SMTP_STAGE_AUTH`, `SMTP_STAGE_MAIL_FROM`, `SMTP_STAGE_RCPT_TO`, `SMTP_STAGE_DATA`, or `SMTP_STAGE_ACCEPT` (or a more specific code such as `SMTP_AUTH_FAILED`). Check Coolify logs for `khotwa_smtp_stage_failure` showing stage and failure type without secrets.

If `noreply` sends successfully from the VPS but Khotwa fails at `CONNECT`, inspect connectivity from inside the Khotwa Docker container. The existing project runs Wrangler dev/Miniflare as staging; it is not a supported hardened production server. For production stability, a supported Node.js SMTP sending process may be preferable.

SMTP server acceptance does not prove arrival in the recipient inbox.

## Checks

Six local automated Khotwa tests passed, including mocked Hostinger SMTP transport and invitation activation. Real Hostinger sending through the Coolify application container and the production build have not been verified here.
