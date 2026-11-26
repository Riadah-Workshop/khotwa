// Central response hardening. Every response that leaves the Worker passes through
// withSecurityHeaders() (see build/sites-worker.ts), so a page, an API route, a
// redirect, a static asset or an error all get the same baseline.
//
// A header that a route already set always wins: for example the login pages ship
// their own, stricter Content-Security-Policy and are left untouched.

// Enforced now. These directives do not restrict where scripts, styles or images
// load from, so they cannot break a page: no <iframe>, <embed>, <object> or <base>
// is used anywhere in the app, and every <form> posts to the same origin.
export const ENFORCED_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";

// Report-only: the full fetch policy the app is expected to satisfy. It never blocks
// anything. Open the browser console on the main screens (attendance, reports,
// care, cafeteria, parent portal) and look for "Content-Security-Policy-Report-Only"
// messages; when a full release cycle shows none, rename this header to
// Content-Security-Policy to enforce it. 'unsafe-inline' remains for scripts because
// the framework emits inline bootstrap scripts; a nonce-based policy is the next step.
export const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // OpenStreetMap map tiles for the cafeteria map (the only third-party host the app loads anything from).
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': ENFORCED_CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // The barcode/QR scanner needs the camera, and the cafeteria agent's arrival check needs the position, on this
  // origin only. Nothing else is used.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=(), serial=()',
  // One year, this host only. No includeSubDomains/preload: other subdomains of the
  // domain (mail, panel) are outside this application.
  'Strict-Transport-Security': 'max-age=31536000',
};

export function withSecurityHeaders(response: Response): Response {
  // A WebSocket upgrade response cannot be rebuilt.
  if (response.status === 101) return response;
  // Rebuilding the response gives a mutable header map (redirects and responses
  // fetched from the asset store are immutable) without touching the body stream.
  const out = new Response(response.body, response);
  const hasCsp = out.headers.has('Content-Security-Policy');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  if (!hasCsp && !out.headers.has('Content-Security-Policy-Report-Only')) {
    out.headers.set('Content-Security-Policy-Report-Only', REPORT_ONLY_CSP);
  }
  return out;
}
