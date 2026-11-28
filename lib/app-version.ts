// App versions: "1.4.2" style, up to four numbers. Pure logic (no imports) so the tests and the browser can both use it.
//
// The app asks the server "I am 1.4.2 on Android, is there something newer?" and the answer is one of
//   current    nothing newer, or this is the website
//   available  a newer version exists: show a bar the person may dismiss
//   required   this version is older than the minimum the administrator allows: the app asks for the update first
//   unknown    the app did not say its version, so nothing is asked of it

export type UpdateStatus = 'current' | 'available' | 'required' | 'unknown';
export type Release = {latest: string; minimum: string};

const VERSION = /^\d{1,3}(?:\.\d{1,3}){1,3}$/;

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

/** 1.4.2 -> [1,4,2,0]; null when it is not a version. */
export function parseVersion(value: unknown): number[] | null {
  if (!isVersion(value)) return null;
  const parts = value.split('.').map(Number);
  while (parts.length < 4) parts.push(0);
  return parts;
}

/** -1, 0 or 1. Missing trailing numbers count as zero (1.2 equals 1.2.0). null when either side is not a version. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 4; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

export function updateStatus(current: unknown, release: Release | null | undefined): UpdateStatus {
  if (!parseVersion(current)) return 'unknown';
  if (!release) return 'current';
  if (compareVersions(current, release.minimum) === -1) return 'required';
  if (compareVersions(current, release.latest) === -1) return 'available';
  return 'current';
}

/** A release the administrator may save: both versions valid and the minimum not above the latest. Returns a message or null. */
export function releaseProblem(release: Release): 'latest' | 'minimum' | 'order' | null {
  if (!isVersion(release.latest)) return 'latest';
  if (!isVersion(release.minimum)) return 'minimum';
  if (compareVersions(release.minimum, release.latest) === 1) return 'order';
  return null;
}
