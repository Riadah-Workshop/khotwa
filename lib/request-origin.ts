/**
 * CSRF origin validation for school-data mutations behind a TLS proxy.
 * In Coolify, the URL received by the Worker can be http://127.0.0.1 while
 * the browser sends Origin: https://khotwa-ksa.com. Accept ONLY explicitly
 * configured HTTPS public origins, not arbitrary Host/X-Forwarded-* headers.
 *
 * This function does not replace authentication, authorization or rate limits.
 */
export function trustedBrowserOrigin(
  request: Request,
  publicOrigins: string | undefined,
  allowMissingOrigin = false,
): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const supplied = request.headers.get('origin');
  if (!supplied) return allowMissingOrigin;
  try {
    const origin = new URL(supplied);
    // Reject opaque origins, added paths, credentials, malformed ports, etc.
    if ((origin.protocol !== 'https:' && origin.protocol !== 'http:') || origin.origin !== supplied) return false;
    if (origin.origin === new URL(request.url).origin) return true;
    return (publicOrigins || '').split(',').some((configured) => {
      try {
        const allowed = new URL(configured.trim());
        return allowed.protocol === 'https:' &&
          allowed.origin === configured.trim() &&
          allowed.origin === origin.origin;
      } catch { return false; }
    });
  } catch { return false; }
}
