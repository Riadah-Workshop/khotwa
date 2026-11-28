// Arrival and departure of cafeteria agents (database side).
//
// The agent's phone decides by itself when he reaches or leaves the cafeteria (lib/fushati/location.ts) and reports
// only those two events. His position is looked at once, on arrival, to refuse a claim made from somewhere else;
// it is never stored. A stay is one row of fushati_visits with its times, the distance on arrival and the reason it ended.
//
// Who may see the stays is decided by the route (the presence_view permission on that cafeteria, never an agent);
// nothing here checks access, so every function takes ids that the caller has already authorised.
import {db, now} from './core';
import {agentContactPhone} from './identifiers';
import {
  POSITION_RETENTION_DAYS,
  STAY_MAX_MS,
  distanceMeters,
  durationMinutes,
  eventTime,
  hasLeftSpot,
  isAtSpot,
  visitState,
  type VisitState,
} from './location';

export type Position = {lat: number; lng: number; accuracyM: number};
export type CafeteriaPoint = {id: string; latitude: number | null; longitude: number | null; arrival_radius_m: number};

export type VisitRow = {
  id: string;
  user_id: string;
  cafeteria_id: string;
  day_key: string;
  arrived_at: string;
  arrive_distance_m: number;
  last_seen_at: string;
  left_at: string | null;
  leave_reason: string | null;
};

export const hasPoint = (cafeteria: CafeteriaPoint): cafeteria is CafeteriaPoint & {latitude: number; longitude: number} =>
  typeof cafeteria.latitude === 'number' && typeof cafeteria.longitude === 'number';

/** The agent's current stay, if he is at a cafeteria. */
export async function openVisit(userId: string): Promise<VisitRow | null> {
  return db().prepare('SELECT * FROM fushati_visits WHERE user_id=? AND left_at IS NULL').bind(userId).first<VisitRow>();
}

/**
 * A stay with no departure for STAY_MAX_MS is over, but nobody knows when: close it at the last confirmation so a dead
 * phone cannot turn into a three-day shift. Returns the stay if it is still open.
 */
export async function closeIfUnconfirmed(visit: VisitRow | null, nowMs = Date.now()): Promise<VisitRow | null> {
  if (!visit || visit.left_at) return visit;
  if (nowMs - Date.parse(visit.last_seen_at) <= STAY_MAX_MS) return visit;
  await db().prepare("UPDATE fushati_visits SET left_at=last_seen_at,leave_reason='signal_lost' WHERE id=? AND left_at IS NULL").bind(visit.id).run();
  return null;
}

/**
 * Housekeeping that runs when an agent reports (there is no scheduled job in this deployment): stays nobody ended are
 * closed, and the coordinates of old stays (kept before positions stopped being stored) are blanked after
 * POSITION_RETENTION_DAYS. Idempotent, and it reads only what still needs work.
 */
export async function purgeOldPositions(nowMs: number): Promise<{closed: number; blanked: number}> {
  const quiet = new Date(nowMs - STAY_MAX_MS).toISOString();
  const cutoff = new Date(nowMs - POSITION_RETENTION_DAYS * 86_400_000).toISOString();
  const [closed, blanked] = await db().batch([
    db().prepare("UPDATE fushati_visits SET left_at=last_seen_at,leave_reason='signal_lost' WHERE left_at IS NULL AND last_seen_at<?").bind(quiet),
    db()
      .prepare('UPDATE fushati_visits SET arrive_lat=NULL,arrive_lng=NULL,last_lat=NULL,last_lng=NULL WHERE left_at IS NOT NULL AND left_at<? AND (arrive_lat IS NOT NULL OR last_lat IS NOT NULL)')
      .bind(cutoff),
  ]);
  return {closed: closed.meta.changes, blanked: blanked.meta.changes};
}

export type ArrivalResult =
  | {ok: true; visitId: string; already: boolean; arrivedAt: string; movedFrom: string | null}
  | {ok: false; code: 'no_location' | 'too_far'; distanceM: number; radiusM: number};

/**
 * Record an arrival if the reported position is at the cafeteria. `reportedAt` is the time the phone saw it (a phone
 * that was offline reports late); see eventTime for when it is believed.
 */
export async function arrive(userId: string, cafeteria: CafeteriaPoint, position: Position, reportedAt?: string | null): Promise<ArrivalResult> {
  const stamp = now();
  const nowMs = Date.parse(stamp);
  await purgeOldPositions(nowMs);
  const open = await closeIfUnconfirmed(await openVisit(userId), nowMs);
  if (!hasPoint(cafeteria)) return {ok: false, code: 'no_location', distanceM: 0, radiusM: cafeteria.arrival_radius_m};
  const distanceM = Math.round(distanceMeters(position, {lat: cafeteria.latitude, lng: cafeteria.longitude}));
  if (!isAtSpot(distanceM, cafeteria.arrival_radius_m, position.accuracyM)) {
    return {ok: false, code: 'too_far', distanceM, radiusM: cafeteria.arrival_radius_m};
  }
  if (open && open.cafeteria_id === cafeteria.id) {
    // Still the same stay: the phone confirmed he is here.
    await db().prepare('UPDATE fushati_visits SET last_seen_at=? WHERE id=? AND left_at IS NULL').bind(stamp, open.id).run();
    return {ok: true, visitId: open.id, already: true, arrivedAt: open.arrived_at, movedFrom: null};
  }
  const arrivedAt = new Date(eventTime(reportedAt, nowMs)).toISOString();
  const visitId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  // Arriving at another cafeteria ends the stay at the previous one in the same transaction.
  if (open) statements.push(db().prepare("UPDATE fushati_visits SET left_at=?,leave_reason='moved',departure_logged_at=? WHERE id=? AND left_at IS NULL").bind(stamp, stamp, open.id));
  statements.push(
    db()
      .prepare(
        'INSERT INTO fushati_visits(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at,arrival_logged_at) VALUES(?,?,?,?,?,NULL,NULL,?,?,NULL,NULL,?,?,?)',
      )
      .bind(visitId, userId, cafeteria.id, dayKey(arrivedAt), arrivedAt, Math.round(position.accuracyM), distanceM, Math.round(position.accuracyM), stamp, stamp),
  );
  try {
    await db().batch(statements);
  } catch (error) {
    // Two reports raced: the unique index let one through. The other request is the same stay.
    if (!/UNIQUE constraint/i.test(String(error instanceof Error ? error.message : error))) throw error;
    const winner = await openVisit(userId);
    if (winner && winner.cafeteria_id === cafeteria.id) return {ok: true, visitId: winner.id, already: true, arrivedAt: winner.arrived_at, movedFrom: null};
    throw error;
  }
  return {ok: true, visitId, already: false, arrivedAt, movedFrom: open ? open.cafeteria_id : null};
}

export type DepartureResult = {checkedOut: false} | {checkedOut: true; visitId: string; cafeteriaId: string; leftAt: string; reason: string};

/** Record a departure. `position` (if the phone sent one) decides whether it is recorded as "left the area" or as a plain departure. */
export async function depart(userId: string, position: Position | null, reportedAt?: string | null): Promise<DepartureResult> {
  const stamp = now();
  const nowMs = Date.parse(stamp);
  const open = await closeIfUnconfirmed(await openVisit(userId), nowMs);
  if (!open) return {checkedOut: false};
  let reason = 'manual';
  if (position) {
    const cafeteria = await db().prepare('SELECT id,latitude,longitude,arrival_radius_m FROM fushati_cafeterias WHERE id=?').bind(open.cafeteria_id).first<CafeteriaPoint>();
    if (cafeteria && hasPoint(cafeteria) && hasLeftSpot(distanceMeters(position, {lat: cafeteria.latitude, lng: cafeteria.longitude}), cafeteria.arrival_radius_m, position.accuracyM)) reason = 'left_area';
  }
  // A departure cannot be before the arrival.
  const leftMs = Math.max(eventTime(reportedAt, nowMs), Date.parse(open.arrived_at));
  const leftAt = new Date(leftMs).toISOString();
  const result = await db().prepare('UPDATE fushati_visits SET left_at=?,leave_reason=?,last_seen_at=?,departure_logged_at=? WHERE id=? AND left_at IS NULL').bind(leftAt, reason, stamp, stamp, open.id).run();
  if ((result.meta?.changes ?? 0) < 1) return {checkedOut: false};
  return {checkedOut: true, visitId: open.id, cafeteriaId: open.cafeteria_id, leftAt, reason};
}

/** An administrator closes a stay that the agent forgot to end. */
export async function closeByAdmin(visitId: string): Promise<boolean> {
  const result = await db().prepare("UPDATE fushati_visits SET left_at=?,leave_reason='closed_by_admin' WHERE id=? AND left_at IS NULL").bind(now(), visitId).run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Saudi calendar day of an ISO timestamp (the same day keys the sales use). */
export function dayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(iso));
  const item = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${item('year')}-${item('month')}-${item('day')}`;
}

export type VisitView = {
  id: string;
  cafeteriaId: string;
  userId: string;
  name: string;
  phone: string;
  arrivedAt: string;
  /** When the departure was recorded. Null while he is inside, and for a stay that nobody ended (no time is invented). */
  leftAt: string | null;
  leaveReason: string | null;
  state: VisitState;
  /** Minutes on site; null when the departure was never recorded. */
  durationMin: number | null;
  arriveDistanceM: number;
};

type VisitWithUser = VisitRow & {full_name: string; phone: string; login_identifier: string};

/** Stays for the attendance screen. A stay nobody ended for too long is shown as "not confirmed", not as a long shift. */
export async function visitsFor(cafeteriaIds: string[], sinceIso: string, nowMs: number): Promise<VisitView[]> {
  if (!cafeteriaIds.length) return [];
  const rows = (
    await db()
      .prepare(
        "SELECT v.*,u.full_name,u.phone,u.login_identifier FROM fushati_visits v JOIN fushati_users u ON u.id=v.user_id WHERE v.cafeteria_id IN (SELECT value FROM json_each(?)) AND (v.left_at IS NULL OR v.arrived_at>=?) ORDER BY v.arrived_at DESC LIMIT 400",
      )
      .bind(JSON.stringify(cafeteriaIds), sinceIso)
      .all<VisitWithUser>()
  ).results;
  return rows.map((row) => {
    const state = visitState(row.last_seen_at, row.left_at, nowMs);
    const departureKnown = !!row.left_at && row.leave_reason !== 'signal_lost';
    return {
      id: row.id,
      cafeteriaId: row.cafeteria_id,
      userId: row.user_id,
      name: row.full_name,
      phone: agentContactPhone(row),
      arrivedAt: row.arrived_at,
      leftAt: departureKnown ? row.left_at : null,
      leaveReason: row.left_at ? row.leave_reason : state === 'unconfirmed' ? 'signal_lost' : null,
      state,
      durationMin: departureKnown ? durationMinutes(row.arrived_at, row.left_at, nowMs) : state === 'inside' ? durationMinutes(row.arrived_at, null, nowMs) : null,
      arriveDistanceM: row.arrive_distance_m,
    };
  });
}

export type PresenceEvent = {id: string; kind: 'arrived' | 'left'; at: string; cafeteriaId: string; userId: string; name: string};

/**
 * What the administrator is told: one event per arrival and one per departure that the server heard of after
 * `sinceIso`, oldest first. The feed follows when the server heard (arrival_logged_at / departure_logged_at), because a
 * phone that was offline reports late with the time it saw the event; `at` is that event time. A stay that nobody
 * ended (signal_lost) and a stay an administrator ended himself are not departures, so they are not announced.
 */
export async function eventsSince(cafeteriaIds: string[], sinceIso: string, limit = 60): Promise<PresenceEvent[]> {
  if (!cafeteriaIds.length) return [];
  const rows = (
    await db()
      .prepare(
        `SELECT id,cafeteria_id,user_id,full_name,kind,at FROM (
           SELECT v.id,v.cafeteria_id,v.user_id,u.full_name,'arrived' AS kind,v.arrived_at AS at,COALESCE(v.arrival_logged_at,v.arrived_at) AS heard FROM fushati_visits v JOIN fushati_users u ON u.id=v.user_id
             WHERE v.cafeteria_id IN (SELECT value FROM json_each(?1)) AND COALESCE(v.arrival_logged_at,v.arrived_at)>?2
           UNION ALL
           SELECT v.id,v.cafeteria_id,v.user_id,u.full_name,'left' AS kind,v.left_at AS at,COALESCE(v.departure_logged_at,v.left_at) AS heard FROM fushati_visits v JOIN fushati_users u ON u.id=v.user_id
             WHERE v.cafeteria_id IN (SELECT value FROM json_each(?1)) AND v.left_at IS NOT NULL AND COALESCE(v.departure_logged_at,v.left_at)>?2 AND COALESCE(v.leave_reason,'') NOT IN ('signal_lost','closed_by_admin')
         ) ORDER BY heard ASC,kind ASC LIMIT ?3`,
      )
      .bind(JSON.stringify(cafeteriaIds), sinceIso, limit)
      .all<{id: string; cafeteria_id: string; user_id: string; full_name: string; kind: 'arrived' | 'left'; at: string}>()
  ).results;
  return rows.map((row) => ({id: `${row.id}:${row.kind}`, kind: row.kind, at: row.at, cafeteriaId: row.cafeteria_id, userId: row.user_id, name: row.full_name}));
}
