// The page's side of diagnostics: tells the server about a problem or about the phone, quietly and rarely.
// Nothing here is shown to the person, nothing here may throw, and nothing here may make the app slower:
//   - at most MAX_PER_PAGE problems per page load, the same one only once
//   - a problem report is sent only while signed in (the first "please sign in" answer switches reporting off)
//   - the phone's state is sent at most every 12 hours, or at once when the app says it changed
// What is sent is cleaned again by the server (lib/app-report.ts) before it is stored.
import {deviceSnapshot, nativePlatform} from './bridge';

export type IssueKind = 'script' | 'promise' | 'api' | 'render' | 'native';

const MAX_PER_PAGE = 8;
const DEVICE_EVERY_MS = 12 * 3_600_000;
const DEVICE_KEY = 'khotwa.device-report';
let enabled = true;
let sent = 0;
const seen = new Set<string>();

function post(body: unknown): Promise<void> {
  return fetch('/api/app/report', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin'})
    .then((response) => {
      if (response.status === 401 || response.status === 403) enabled = false;
    })
    .catch(() => undefined);
}

export function reportIssue(kind: IssueKind, message: string, detail = ''): void {
  if (!enabled || typeof window === 'undefined' || sent >= MAX_PER_PAGE) return;
  const route = window.location.pathname;
  const key = `${kind}|${message}|${route}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  void post({issue: {kind, message, detail, route}});
}

function remembered(): number {
  try {
    return Number(window.localStorage.getItem(DEVICE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** The phone's permissions and version. In a browser only the cafeteria agent's page asks (the server ignores the rest). */
export async function reportDevice(force = false): Promise<void> {
  if (!enabled || typeof window === 'undefined') return;
  const agentPage = window.location.pathname.startsWith('/fushati/agent');
  if (!nativePlatform() && !agentPage) return;
  if (!force && Date.now() - remembered() < DEVICE_EVERY_MS) return;
  try {
    window.localStorage.setItem(DEVICE_KEY, String(Date.now()));
  } catch {
    /* private mode: the report is simply sent again next time */
  }
  await post({device: await deviceSnapshot()});
}

/** Something about the phone changed (a permission was refused): say so now instead of in 12 hours. */
export function notifyDeviceChanged(): void {
  void reportDevice(true);
}
