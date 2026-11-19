declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    KHOTWA_ADMIN_EMAIL?: string;
    KHOTWA_ADMIN_PASSWORD_HASH?: string;
    KHOTWA_SESSION_SECRET?: string;
    KHOTWA_PUBLIC_ORIGINS?: string;
    KHOTWA_APP_URL?: string;
    RESEND_API_KEY?: string;
    KHOTWA_FROM_EMAIL?: string;
    RESEND_WEBHOOK_SECRET?: string;
  }
}
