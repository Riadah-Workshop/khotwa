// Sign-in time stamps: when each person signed in, and from the website or the app. Nothing else.
//
// A stamp holds the role, who (the account id, or "parent:" + the phone number for a parent), the school, the time,
// the Saudi day, the channel and the app version. It holds NO position, NO IP address and NO device identifier, for
// anyone. Failing to write a stamp must never stop a sign-in, so callers use recordLoginStamp inside try/catch
// (it also catches by itself and reports whether it worked).
//
// The app announces itself in its user-agent: "KhotwaApp/1.2.0 (android)" or "(ios)". A browser has no such tag.

export type LoginChannel = 'web' | 'android' | 'ios';
export type StampClaim = {uid: string; role: string; sid: string};

const ROLES = new Set(['main_admin', 'manager', 'deputy', 'parent', 'fushati_admin', 'fushati_agent']);
export const STAMP_RETENTION_DAYS = 180;

/** Which channel signed in, from the app's own user-agent tag. Anything else is the website. */
export function channelOf(userAgent: string | null | undefined): {channel: LoginChannel; version: string} {
  const match = /KhotwaApp\/(\d{1,3}(?:\.\d{1,3}){1,3}) \((android|ios)\)/.exec(userAgent || '');
  return match ? {channel: match[2] as LoginChannel, version: match[1]} : {channel: 'web', version: ''};
}

/** Saudi calendar day of a moment. */
export function stampDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
  const item = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${item('year')}-${item('month')}-${item('day')}`;
}

/** Writes one stamp. Returns false (and writes nothing) for a role it does not know, or when the database refuses. */
export async function recordLoginStamp(db: D1Database, claim: StampClaim, userAgent: string | null | undefined, date: Date = new Date()): Promise<boolean> {
  if (!ROLES.has(claim.role) || !claim.uid) return false;
  try {
    const {channel, version} = channelOf(userAgent);
    await db
      .prepare('INSERT INTO khotwa_login_stamps(id,role,account_key,school_id,signed_in_at,day_key,channel,app_version) VALUES(?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), claim.role, claim.uid.slice(0, 80), claim.sid === 'default' ? '' : claim.sid.slice(0, 80), date.toISOString(), stampDay(date), channel, version)
      .run();
    // No scheduled job exists in this deployment: old stamps are removed a few at a time as new ones arrive.
    const cutoff = new Date(date.getTime() - STAMP_RETENTION_DAYS * 86_400_000).toISOString();
    await db.prepare('DELETE FROM khotwa_login_stamps WHERE id IN (SELECT id FROM khotwa_login_stamps WHERE signed_in_at<? LIMIT 50)').bind(cutoff).run();
    return true;
  } catch {
    return false;
  }
}

export type StampRow = {id: string; role: string; account_key: string; school_id: string; signed_in_at: string; day_key: string; channel: LoginChannel; app_version: string};
export type StampView = {id: string; role: string; name: string; school: string; at: string; day: string; channel: LoginChannel; appVersion: string};

/** "+966512345678" -> "+96651•••5678": enough to recognise a parent, not enough to copy the number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/^parent:/, '');
  return digits.length <= 7 ? digits : `${digits.slice(0, 6)}•••${digits.slice(-4)}`;
}

/** The latest stamps, newest first, with a readable name for each. For the system administrator only. */
export async function recentStamps(db: D1Database, options: {days?: number; role?: string; limit?: number; nowMs?: number} = {}): Promise<StampView[]> {
  const days = Math.min(STAMP_RETENTION_DAYS, Math.max(1, Math.floor(options.days ?? 7)));
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)));
  const since = new Date((options.nowMs ?? Date.now()) - days * 86_400_000).toISOString();
  const rows = options.role && ROLES.has(options.role)
    ? (await db.prepare('SELECT * FROM khotwa_login_stamps WHERE signed_in_at>=? AND role=? ORDER BY signed_in_at DESC LIMIT ?').bind(since, options.role, limit).all<StampRow>()).results
    : (await db.prepare('SELECT * FROM khotwa_login_stamps WHERE signed_in_at>=? ORDER BY signed_in_at DESC LIMIT ?').bind(since, limit).all<StampRow>()).results;
  const accountIds = [...new Set(rows.filter((row) => row.role === 'deputy' || row.role === 'manager').map((row) => row.account_key))];
  const fushatiIds = [...new Set(rows.filter((row) => row.role === 'fushati_admin' || row.role === 'fushati_agent').map((row) => row.account_key))];
  const schoolIds = [...new Set(rows.map((row) => row.school_id).filter(Boolean))];
  const names = new Map<string, string>();
  const schools = new Map<string, string>();
  if (accountIds.length) for (const row of (await db.prepare('SELECT id,full_name FROM khotwa_accounts WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(accountIds)).all<{id: string; full_name: string}>()).results) names.set(row.id, row.full_name);
  if (fushatiIds.length) for (const row of (await db.prepare('SELECT id,full_name FROM fushati_users WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(fushatiIds)).all<{id: string; full_name: string}>()).results) names.set(row.id, row.full_name);
  if (schoolIds.length) for (const row of (await db.prepare('SELECT id,name FROM khotwa_schools WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(schoolIds)).all<{id: string; name: string}>()).results) schools.set(row.id, row.name);
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    name: row.role === 'parent' ? maskPhone(row.account_key) : row.role === 'main_admin' ? '' : names.get(row.account_key) ?? '',
    school: schools.get(row.school_id) ?? '',
    at: row.signed_in_at,
    day: row.day_key,
    channel: row.channel,
    appVersion: row.app_version,
  }));
}
