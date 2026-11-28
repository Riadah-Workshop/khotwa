// App diagnostics: what the website and the apps report about themselves, kept for the system administrator.
//
//   recordIssue    one problem, counted by fingerprint (the same bug from 40 phones is one row, "40 times, 12 people")
//   recordDevice   the latest state of a phone that has to work (cafeteria agent) or an app install (everyone)
//   diagnosticsSnapshot   what the Diagnostics tab shows: health of the server, problems, phones, versions, sign-ins
//   setRelease / getRelease   the newest and the oldest-still-allowed app version per platform
//
// Recording never throws: a broken diagnostics table must not make the app worse. Nothing stored here holds a position,
// an IP address or a device identifier (see drizzle/0034_app_diagnostics.sql and lib/app-report.ts).
import {deviceProblems, fingerprint} from './app-report';
import type {DeviceProblem, DeviceReport, IssueReport} from './app-report';
import {isVersion, releaseProblem, updateStatus} from './app-version';
import type {Release, UpdateStatus} from './app-version';
import {labelAccounts, STAMP_RETENTION_DAYS, recentStamps} from './login-stamps';
import type {LoginChannel, StampView} from './login-stamps';

export const ISSUE_CAP = 500;
export const ISSUE_RETENTION_DAYS = 90;
export const DEVICE_RETENTION_DAYS = 180;
const DAY = 86_400_000;

export type Reporter = {role: string; accountKey: string; schoolId: string; channel: LoginChannel; appVersion: string; platform: string};

/** Counts one problem. Returns false when nothing was stored. */
export async function recordIssue(db: D1Database, report: IssueReport, who: Reporter, now: Date = new Date()): Promise<boolean> {
  try {
    const key = await fingerprint(report, who.channel);
    const at = now.toISOString();
    const known = await db.prepare('SELECT 1 AS present FROM khotwa_app_issues WHERE fingerprint=?').bind(key).first();
    if (!known) {
      // Full: make room by dropping, in this order, a solved problem, then the one seen least often, then the oldest.
      const total = (await db.prepare('SELECT COUNT(*) AS n FROM khotwa_app_issues').first<{n: number}>())?.n ?? 0;
      if (total >= ISSUE_CAP) {
        const victim = await db.prepare('SELECT fingerprint FROM khotwa_app_issues ORDER BY resolved_at IS NULL, occurrences, last_seen LIMIT 1').first<{fingerprint: string}>();
        if (victim) await removeIssues(db, [victim.fingerprint]);
      }
    }
    await db
      .prepare(
        `INSERT INTO khotwa_app_issues(fingerprint,kind,message,detail,route,role,channel,app_version,platform,occurrences,first_seen,last_seen,resolved_at)
         VALUES(?,?,?,?,?,?,?,?,?,1,?,?,NULL)
         ON CONFLICT(fingerprint) DO UPDATE SET occurrences=occurrences+1,last_seen=excluded.last_seen,app_version=excluded.app_version,role=excluded.role,platform=excluded.platform,resolved_at=NULL`,
      )
      .bind(key, report.kind, report.message, report.detail, report.route, who.role, who.channel, who.appVersion, who.platform, at, at)
      .run();
    if (who.accountKey) await db.prepare('INSERT OR IGNORE INTO khotwa_app_issue_accounts(fingerprint,account_key) VALUES(?,?)').bind(key, who.accountKey.slice(0, 80)).run();
    // No scheduled job exists: old problems and phones are removed a few at a time as new reports arrive.
    const old = new Date(now.getTime() - ISSUE_RETENTION_DAYS * DAY).toISOString();
    const stale = (await db.prepare('SELECT fingerprint FROM khotwa_app_issues WHERE last_seen<? LIMIT 20').bind(old).all<{fingerprint: string}>()).results;
    if (stale.length) await removeIssues(db, stale.map((row) => row.fingerprint));
    return true;
  } catch {
    return false;
  }
}

async function removeIssues(db: D1Database, fingerprints: string[]): Promise<void> {
  if (!fingerprints.length) return;
  const list = JSON.stringify(fingerprints);
  await db.prepare('DELETE FROM khotwa_app_issue_accounts WHERE fingerprint IN (SELECT value FROM json_each(?))').bind(list).run();
  await db.prepare('DELETE FROM khotwa_app_issues WHERE fingerprint IN (SELECT value FROM json_each(?))').bind(list).run();
}

/**
 * The state of one account's phone or browser. Stored for the app (every role) and for the cafeteria agent in a
 * browser too, because his arrival alerts depend on the location permission. Everybody else's browser is not recorded.
 */
export async function recordDevice(db: D1Database, device: DeviceReport, who: Reporter, now: Date = new Date()): Promise<boolean> {
  if (!who.accountKey || (who.channel === 'web' && who.role !== 'fushati_agent')) return false;
  try {
    const at = now.toISOString();
    await db
      .prepare(
        `INSERT INTO khotwa_app_devices(account_key,channel,role,school_id,app_version,os_version,device_model,location_permission,background_location,notifications,camera,battery_saver,reported_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(account_key,channel) DO UPDATE SET role=excluded.role,school_id=excluded.school_id,app_version=excluded.app_version,os_version=excluded.os_version,device_model=excluded.device_model,
           location_permission=excluded.location_permission,background_location=excluded.background_location,notifications=excluded.notifications,camera=excluded.camera,battery_saver=excluded.battery_saver,reported_at=excluded.reported_at`,
      )
      .bind(who.accountKey.slice(0, 80), who.channel, who.role, who.schoolId === 'default' ? '' : who.schoolId.slice(0, 80), who.appVersion, device.osVersion || who.platform.slice(0, 30), device.deviceModel, device.location, device.backgroundLocation, device.notifications, device.camera, device.batterySaver, at)
      .run();
    const old = new Date(now.getTime() - DEVICE_RETENTION_DAYS * DAY).toISOString();
    await db.prepare('DELETE FROM khotwa_app_devices WHERE rowid IN (SELECT rowid FROM khotwa_app_devices WHERE reported_at<? LIMIT 20)').bind(old).run();
    return true;
  } catch {
    return false;
  }
}

// ---- releases -------------------------------------------------------------------------------------------------------

export type ReleaseRow = {platform: 'android' | 'ios'; latest_version: string; minimum_version: string; store_url: string; notes_ar: string; notes_en: string; updated_at: string};
export type ReleaseInfo = {platform: 'android' | 'ios'; latest: string; minimum: string; storeUrl: string; notesAr: string; notesEn: string; updatedAt: string};

const toInfo = (row: ReleaseRow): ReleaseInfo => ({platform: row.platform, latest: row.latest_version, minimum: row.minimum_version, storeUrl: row.store_url, notesAr: row.notes_ar, notesEn: row.notes_en, updatedAt: row.updated_at});

export async function getRelease(db: D1Database, platform: string): Promise<ReleaseInfo | null> {
  if (platform !== 'android' && platform !== 'ios') return null;
  try {
    const row = await db.prepare('SELECT * FROM khotwa_app_releases WHERE platform=?').bind(platform).first<ReleaseRow>();
    return row ? toInfo(row) : null;
  } catch {
    return null;
  }
}

export async function allReleases(db: D1Database): Promise<Record<'android' | 'ios', ReleaseInfo | null>> {
  const out: Record<'android' | 'ios', ReleaseInfo | null> = {android: null, ios: null};
  try {
    for (const row of (await db.prepare('SELECT * FROM khotwa_app_releases').all<ReleaseRow>()).results) out[row.platform] = toInfo(row);
  } catch {
    /* the table is not there yet: the snapshot reports the schema problem */
  }
  return out;
}

export type ReleaseInput = {platform: unknown; latest: unknown; minimum: unknown; storeUrl: unknown; notesAr: unknown; notesEn: unknown};
export type ReleaseResult = {ok: true; release: ReleaseInfo} | {ok: false; code: 'platform' | 'latest' | 'minimum' | 'order' | 'url'};

/** A store address the app may open: https only, no credentials, no spaces. Empty is allowed (then the app just says "update"). */
export function cleanStoreUrl(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length > 300 || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function setRelease(db: D1Database, input: ReleaseInput, now: Date = new Date()): Promise<ReleaseResult> {
  if (input.platform !== 'android' && input.platform !== 'ios') return {ok: false, code: 'platform'};
  const latest = typeof input.latest === 'string' ? input.latest.trim() : '';
  const minimum = typeof input.minimum === 'string' && input.minimum.trim() ? input.minimum.trim() : latest ? '1.0' : '';
  const problem = releaseProblem({latest, minimum});
  if (problem) return {ok: false, code: problem};
  const storeUrl = cleanStoreUrl(input.storeUrl);
  if (storeUrl === null) return {ok: false, code: 'url'};
  const note = (value: unknown) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 240) : '');
  await db
    .prepare(
      `INSERT INTO khotwa_app_releases(platform,latest_version,minimum_version,store_url,notes_ar,notes_en,updated_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(platform) DO UPDATE SET latest_version=excluded.latest_version,minimum_version=excluded.minimum_version,store_url=excluded.store_url,notes_ar=excluded.notes_ar,notes_en=excluded.notes_en,updated_at=excluded.updated_at`,
    )
    .bind(input.platform, latest, minimum, storeUrl, note(input.notesAr), note(input.notesEn), now.toISOString())
    .run();
  return {ok: true, release: (await getRelease(db, input.platform))!};
}

/** What the app is told. Nothing in it is secret, so the endpoint is public (the update check happens before sign-in). */
export function versionAnswer(platform: string, current: string, release: ReleaseInfo | null): {platform: string; status: UpdateStatus; latest: string; minimum: string; storeUrl: string; notes: {ar: string; en: string}} {
  const checked: Release | null = release ? {latest: release.latest, minimum: release.minimum} : null;
  return {
    platform,
    status: platform === 'android' || platform === 'ios' ? updateStatus(isVersion(current) ? current : '', checked) : 'current',
    latest: release?.latest ?? '',
    minimum: release?.minimum ?? '',
    storeUrl: release?.storeUrl ?? '',
    notes: {ar: release?.notesAr ?? '', en: release?.notesEn ?? ''},
  };
}

// ---- the Diagnostics tab ---------------------------------------------------------------------------------------------

/** Tables and columns that must exist for the app to work. A missing one means a migration did not run. */
export const REQUIRED_SCHEMA: ReadonlyArray<readonly [string, string?]> = [
  ['khotwa_schools'],
  ['khotwa_accounts'],
  ['khotwa_login_limits'],
  ['khotwa_login_stamps'],
  ['khotwa_app_issues'],
  ['khotwa_app_issue_accounts'],
  ['khotwa_app_devices'],
  ['khotwa_app_releases'],
  ['fushati_users', 'presence_email'],
  ['fushati_visits', 'arrival_logged_at'],
  ['fushati_visits', 'departure_logged_at'],
  ['fushati_cafeterias', 'latitude'],
];

export async function schemaMissing(db: D1Database): Promise<string[]> {
  const missing: string[] = [];
  const columns = new Map<string, Set<string>>();
  for (const [table, column] of REQUIRED_SCHEMA) {
    if (!columns.has(table)) {
      try {
        columns.set(table, new Set((await db.prepare(`PRAGMA table_info("${table}")`).all<{name: string}>()).results.map((row) => row.name)));
      } catch {
        columns.set(table, new Set());
      }
    }
    const present = columns.get(table)!;
    if (!present.size) missing.push(table);
    else if (column && !present.has(column)) missing.push(`${table}.${column}`);
  }
  return [...new Set(missing)];
}

export type IssueView = {fingerprint: string; kind: string; message: string; detail: string; route: string; role: string; channel: string; appVersion: string; platform: string; occurrences: number; people: number; firstSeen: string; lastSeen: string; resolvedAt: string | null};
export type DeviceView = {name: string; role: string; school: string; channel: string; appVersion: string; osVersion: string; deviceModel: string; location: string; backgroundLocation: string; notifications: string; camera: string; batterySaver: string; reportedAt: string; update: UpdateStatus; problems: DeviceProblem[]};
export type Environment = {mail: boolean; origins: boolean; storage: boolean};

export type Snapshot = {
  generatedAt: string;
  health: {database: {ok: boolean; latencyMs: number}; schemaMissing: string[]; environment: Environment};
  counts: {openIssues: number; solvedIssues: number; issues24h: number; phonesWithProblems: number; signIns24h: number; signIns7d: number; appSignIns7d: number};
  issues: IssueView[];
  devices: DeviceView[];
  versions: {channel: string; version: string; people: number}[];
  releases: Record<'android' | 'ios', ReleaseInfo | null>;
  signIns: StampView[];
  stampRetentionDays: number;
};

export async function diagnosticsSnapshot(db: D1Database, environment: Environment, options: {nowMs?: number; showSolved?: boolean} = {}): Promise<Snapshot> {
  const nowMs = options.nowMs ?? Date.now();
  const startedAt = Date.now();
  let databaseOk = true;
  try {
    await db.prepare('SELECT 1').first();
  } catch {
    databaseOk = false;
  }
  const latencyMs = Date.now() - startedAt;
  const missing = databaseOk ? await schemaMissing(db) : [];
  const since = (days: number) => new Date(nowMs - days * DAY).toISOString();
  const count = async (sql: string, ...params: unknown[]) => {
    try {
      return (await db.prepare(sql).bind(...params).first<{n: number}>())?.n ?? 0;
    } catch {
      return 0;
    }
  };

  let issues: IssueView[] = [];
  try {
    const rows = (
      await db
        .prepare(
          `SELECT i.*,(SELECT COUNT(*) FROM khotwa_app_issue_accounts a WHERE a.fingerprint=i.fingerprint) AS people FROM khotwa_app_issues i
           ${options.showSolved ? '' : 'WHERE i.resolved_at IS NULL'} ORDER BY i.resolved_at IS NOT NULL, i.last_seen DESC LIMIT 100`,
        )
        .all<Record<string, string | number | null>>()
    ).results;
    issues = rows.map((row) => ({
      fingerprint: String(row.fingerprint),
      kind: String(row.kind),
      message: String(row.message),
      detail: String(row.detail),
      route: String(row.route),
      role: String(row.role),
      channel: String(row.channel),
      appVersion: String(row.app_version),
      platform: String(row.platform),
      occurrences: Number(row.occurrences),
      people: Number(row.people),
      firstSeen: String(row.first_seen),
      lastSeen: String(row.last_seen),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    }));
  } catch {
    /* reported through schemaMissing */
  }

  const releases = databaseOk ? await allReleases(db) : {android: null, ios: null};
  let devices: DeviceView[] = [];
  const versionCounts = new Map<string, {channel: string; version: string; people: number}>();
  try {
    const rows = (await db.prepare('SELECT * FROM khotwa_app_devices ORDER BY reported_at DESC LIMIT 300').all<Record<string, string>>()).results;
    const labels = await labelAccounts(db, rows.map((row) => ({role: row.role, account_key: row.account_key, school_id: row.school_id})));
    devices = rows.map((row) => {
      const update: UpdateStatus = row.channel === 'android' || row.channel === 'ios' ? updateStatus(row.app_version, releases[row.channel] ? {latest: releases[row.channel]!.latest, minimum: releases[row.channel]!.minimum} : null) : 'current';
      const problems = deviceProblems(
        {role: row.role, channel: row.channel, location: row.location_permission, backgroundLocation: row.background_location, notifications: row.notifications, camera: row.camera, batterySaver: row.battery_saver},
        update,
      );
      return {
        name: labels.name({role: row.role, account_key: row.account_key}),
        role: row.role,
        school: labels.school({school_id: row.school_id}),
        channel: row.channel,
        appVersion: row.app_version,
        osVersion: row.os_version,
        deviceModel: row.device_model,
        location: row.location_permission,
        backgroundLocation: row.background_location,
        notifications: row.notifications,
        camera: row.camera,
        batterySaver: row.battery_saver,
        reportedAt: row.reported_at,
        update,
        problems,
      };
    });
    for (const row of rows) {
      if (row.channel === 'web') continue;
      const key = `${row.channel}|${row.app_version}`;
      const entry = versionCounts.get(key) ?? {channel: row.channel, version: row.app_version, people: 0};
      entry.people++;
      versionCounts.set(key, entry);
    }
  } catch {
    /* reported through schemaMissing */
  }
  // The phones that need attention first.
  devices.sort((a, b) => b.problems.length - a.problems.length || b.reportedAt.localeCompare(a.reportedAt));

  const [openIssues, solvedIssues, issues24h, signIns24h, signIns7d, appSignIns7d] = await Promise.all([
    count('SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE resolved_at IS NULL'),
    count('SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE resolved_at IS NOT NULL'),
    count('SELECT COUNT(*) AS n FROM khotwa_app_issues WHERE resolved_at IS NULL AND last_seen>=?', since(1)),
    count('SELECT COUNT(*) AS n FROM khotwa_login_stamps WHERE signed_in_at>=?', since(1)),
    count('SELECT COUNT(*) AS n FROM khotwa_login_stamps WHERE signed_in_at>=?', since(7)),
    count("SELECT COUNT(*) AS n FROM khotwa_login_stamps WHERE signed_in_at>=? AND channel<>'web'", since(7)),
  ]);
  let signIns: StampView[] = [];
  try {
    signIns = await recentStamps(db, {days: 7, limit: 100, nowMs});
  } catch {
    /* reported through schemaMissing */
  }
  return {
    generatedAt: new Date(nowMs).toISOString(),
    health: {database: {ok: databaseOk, latencyMs}, schemaMissing: missing, environment},
    counts: {openIssues, solvedIssues, issues24h, phonesWithProblems: devices.filter((device) => device.problems.some((p) => p !== 'update_available')).length, signIns24h, signIns7d, appSignIns7d},
    issues,
    devices,
    versions: [...versionCounts.values()].sort((a, b) => a.channel.localeCompare(b.channel) || b.version.localeCompare(a.version, undefined, {numeric: true})),
    releases,
    signIns,
    stampRetentionDays: STAMP_RETENTION_DAYS,
  };
}

export type IssueOp = 'resolve-issue' | 'reopen-issue' | 'delete-issue' | 'clear-solved';

export async function changeIssues(db: D1Database, op: IssueOp, fingerprintValue: unknown, now: Date = new Date()): Promise<number> {
  if (op === 'clear-solved') {
    const rows = (await db.prepare('SELECT fingerprint FROM khotwa_app_issues WHERE resolved_at IS NOT NULL LIMIT 500').all<{fingerprint: string}>()).results;
    await removeIssues(db, rows.map((row) => row.fingerprint));
    return rows.length;
  }
  const key = typeof fingerprintValue === 'string' && /^[0-9a-f]{20}$/.test(fingerprintValue) ? fingerprintValue : '';
  if (!key) return 0;
  if (op === 'delete-issue') {
    const present = await db.prepare('SELECT 1 AS present FROM khotwa_app_issues WHERE fingerprint=?').bind(key).first();
    await removeIssues(db, [key]);
    return present ? 1 : 0;
  }
  const result = await db.prepare('UPDATE khotwa_app_issues SET resolved_at=? WHERE fingerprint=?').bind(op === 'resolve-issue' ? now.toISOString() : null, key).run();
  return result.meta?.changes ?? 0;
}
