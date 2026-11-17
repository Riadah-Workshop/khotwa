declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    KHOTWA_ADMIN_EMAIL?: string;
    KHOTWA_ADMIN_PASSWORD_HASH?: string;
    KHOTWA_SESSION_SECRET?: string;
  }
}
