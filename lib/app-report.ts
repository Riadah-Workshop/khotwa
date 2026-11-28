// What the website or the app may tell the server about itself, and how it is cleaned before it is stored.
// Pure logic (no imports) so the tests can run it directly.
//
// The rule: a report says WHAT went wrong and WHERE (a script error, a failed request, a screen that crashed), never
// what a person typed, saw or is. Messages are cut short and lose anything that looks like a phone number, an e-mail
// address, an IP address, a long id or a token; addresses lose their query string; no position, no IP address, no device identifier.

export const ISSUE_KINDS = ['script', 'promise', 'api', 'render', 'native'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const PERMISSION_STATES = ['granted', 'denied', 'prompt', 'unsupported', 'unknown'] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];
export const SWITCH_STATES = ['on', 'off', 'unknown'] as const;
export type SwitchState = (typeof SWITCH_STATES)[number];

export const MAX_MESSAGE = 200;
export const MAX_DETAIL = 160;
export const MAX_ROUTE = 80;
export const MAX_REPORT_BYTES = 4096;

/** Strips what must not be stored. Keeps the sentence readable. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  let text = value.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]+/g, ' ');
  text = text.replace(/https?:\/\/[^\s/?#]+/gi, ''); // the host of an address
  text = text.replace(/([^\s?#]+)[?#]\S*/g, '$1'); // query strings and fragments
  text = text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>');
  text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
  text = text.replace(/\b[A-Za-z0-9_-]{28,}\b/g, '<token>');
  text = text.replace(/(?<![\w/.])\d{1,3}(?:\.\d{1,3}){3}(?![\w.])/g, '<ip>'); // IPv4
  text = text.replace(/(?<![\w:])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi, '<ip>'); // IPv6 (a clock time like 10:30:45 goes too, which is harmless)
  text = text.replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => (match.replace(/\D/g, '').length >= 7 ? '<number>' : match));
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** "/api/fushati/receipts/12345?x=1" -> "/api/fushati/receipts/:id". Empty when it is not a path of this site. */
export function cleanRoute(value: unknown): string {
  if (typeof value !== 'string') return '';
  let path = value.trim();
  try {
    path = new URL(path, 'https://app.local').pathname;
  } catch {
    return '';
  }
  if (!path.startsWith('/')) return '';
  path = path
    .split('/')
    .map((part) => (/^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,})$/i.test(part) ? ':id' : part))
    .join('/');
  path = path.replace(/[^\w/:.@-]/g, '');
  return path.length > MAX_ROUTE ? path.slice(0, MAX_ROUTE) : path;
}

export type IssueReport = {kind: IssueKind; message: string; detail: string; route: string};

/** A problem report from the page, or null when there is nothing worth keeping. */
export function normalizeIssue(input: unknown): IssueReport | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const kind = (ISSUE_KINDS as readonly string[]).includes(String(data.kind)) ? (data.kind as IssueKind) : null;
  const message = cleanText(data.message, MAX_MESSAGE);
  if (!kind || !message) return null;
  return {kind, message, detail: cleanText(data.detail, MAX_DETAIL), route: cleanRoute(data.route)};
}

export type DeviceReport = {
  osVersion: string;
  deviceModel: string;
  location: PermissionState;
  backgroundLocation: PermissionState;
  notifications: PermissionState;
  camera: PermissionState;
  batterySaver: SwitchState;
};

const permission = (value: unknown): PermissionState => ((PERMISSION_STATES as readonly string[]).includes(String(value)) ? (value as PermissionState) : 'unknown');
const switchState = (value: unknown): SwitchState => ((SWITCH_STATES as readonly string[]).includes(String(value)) ? (value as SwitchState) : 'unknown');
const label = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[^\w .+()-]/g, '').trim().slice(0, max) : '');

export function normalizeDevice(input: unknown): DeviceReport | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  return {
    osVersion: label(data.osVersion, 30),
    deviceModel: label(data.deviceModel, 40),
    location: permission(data.location),
    backgroundLocation: permission(data.backgroundLocation),
    notifications: permission(data.notifications),
    camera: permission(data.camera),
    batterySaver: switchState(data.batterySaver),
  };
}

/** Coarse "Android 14 · Chrome 126" from a user-agent. Enough to tell which phones have a problem; not a fingerprint. */
export function describeAgent(userAgent: string | null | undefined): string {
  const ua = userAgent || '';
  const android = /Android (\d{1,2})/.exec(ua);
  const ios = /(?:iPhone|iPad|CPU) OS (\d{1,2})/.exec(ua);
  const os = android ? `Android ${android[1]}` : ios ? `iOS ${ios[1]}` : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const pick = (re: RegExp, name: string) => {
    const match = re.exec(ua);
    return match ? `${name} ${match[1]}` : '';
  };
  const browser =
    /KhotwaApp\//.test(ua) ? 'App' : pick(/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge') || pick(/SamsungBrowser\/(\d+)/, 'Samsung') || pick(/(?:Chrome|CriOS)\/(\d+)/, 'Chrome') || pick(/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox') || pick(/Version\/(\d+)[\d.]* .*Safari/, 'Safari');
  return [os, browser].filter(Boolean).join(' · ');
}

/** Digits and long ids differ between two people who hit the same bug; the fingerprint must not. */
export function fingerprintSource(report: IssueReport, channel: string): string {
  const message = report.message.replace(/<[a-z]+>/g, '').replace(/\d+/g, '#').toLowerCase();
  return [report.kind, message, report.route, channel].join('|');
}

export async function fingerprint(report: IssueReport, channel: string): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprintSource(report, channel));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 10), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type DeviceProblem = 'location_not_allowed' | 'background_not_allowed' | 'camera_not_allowed' | 'notifications_off' | 'battery_saver' | 'update_required' | 'update_available';

/**
 * What is wrong with a phone, for the people who need it to work. Only the cafeteria agent depends on location and the
 * camera (arrival alerts and scanning); everyone is told about notifications and updates.
 */
export function deviceProblems(device: {role: string; channel: string; location: string; backgroundLocation: string; notifications: string; camera: string; batterySaver: string}, update: UpdateLike): DeviceProblem[] {
  const out: DeviceProblem[] = [];
  const agent = device.role === 'fushati_agent';
  // Only a refusal or an unanswered question is a problem. 'unknown' and 'unsupported' mean the phone could not say.
  if (agent && (device.location === 'denied' || device.location === 'prompt')) out.push('location_not_allowed');
  if (agent && device.channel !== 'web' && device.location === 'granted' && device.backgroundLocation === 'denied') out.push('background_not_allowed');
  if (agent && device.camera === 'denied') out.push('camera_not_allowed');
  if (device.channel !== 'web' && device.notifications === 'denied') out.push('notifications_off');
  if (agent && device.channel !== 'web' && device.batterySaver === 'on') out.push('battery_saver');
  if (update === 'required') out.push('update_required');
  else if (update === 'available') out.push('update_available');
  return out;
}
type UpdateLike = 'current' | 'available' | 'required' | 'unknown';
