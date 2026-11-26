// Arrival, departure and live position of cafeteria agents (database side).
//
// An agent's position is stored only between arrival and departure, in the open row of fushati_visits.
// Who may see it is decided by the route (the presence_view permission on that cafeteria); nothing here checks
// access, so every function takes ids that the caller has already authorised.
import {db, now} from './core';
import {agentContactPhone} from './identifiers';
import {
  PING_MIN_INTERVAL_MS,
  SIGNAL_LOST_MS,
  distanceMeters,
  durationMinutes,
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
  last_lat: number;
  last_lng: number;
  last_accuracy_m: number;
  last_seen_at: string;
  left_at: string | null;
  leave_reason: string | null;
};

export const hasPoint = (cafeteria: CafeteriaPoint): cafeteria is CafeteriaPoint & {latitude: number; longitude: number} =>
  typeof cafeteria.latitude === 'number' && typeof cafeteria.longitude === 'number';

/** The agent's current stay, if he is checked in. */
export async function openVisit(userId: string): Promise<VisitRow | null> {
  return db().prepare('SELECT * FROM fushati_visits WHERE user_id=? AND left_at IS NULL').bind(userId).first<VisitRow>();
}

/**
 * A stay whose phone has been silent for too long is over: close it at the last report. Closing at the last report
 * (not now) keeps a dead battery from turning into a ten-hour shift. Returns the stay if it is still open.
 */
export async function closeIfLost(visit: VisitRow | null, nowMs = Date.now()): Promise<VisitRow | null> {
  if (!visit || visit.left_at) return visit;
  if (nowMs - Date.parse(visit.last_seen_at) <= SIGNAL_LOST_MS) return visit;
  await db().prepare("UPDATE fushati_visits SET left_at=last_seen_at,leave_reason='signal_lost' WHERE id=? AND left_at IS NULL").bind(visit.id).run();
  return null;
}

export type CheckInResult =
  | {ok: true; visitId: string; already: boolean; arrivedAt: string}
  | {ok: false; code: 'no_location' | 'too_far'; distanceM: number; radiusM: number};

/** Record an arrival if the reported position is at the cafeteria. */
export async function checkIn(userId: string, cafeteria: CafeteriaPoint, position: Position): Promise<CheckInResult> {
  const stamp = now();
  const open = await closeIfLost(await openVisit(userId), Date.parse(stamp));
  if (!hasPoint(cafeteria)) return {ok: false, code: 'no_location', distanceM: 0, radiusM: cafeteria.arrival_radius_m};
  const distanceM = Math.round(distanceMeters(position, {lat: cafeteria.latitude, lng: cafeteria.longitude}));
  if (!isAtSpot(distanceM, cafeteria.arrival_radius_m, position.accuracyM)) {
    return {ok: false, code: 'too_far', distanceM, radiusM: cafeteria.arrival_radius_m};
  }
  if (open && open.cafeteria_id === cafeteria.id) {
    await refresh(open.id, position, stamp);
    return {ok: true, visitId: open.id, already: true, arrivedAt: open.arrived_at};
  }
  const visitId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  // Arriving at another cafeteria ends the stay at the previous one in the same transaction.
  if (open) statements.push(db().prepare("UPDATE fushati_visits SET left_at=?,leave_reason='moved' WHERE id=? AND left_at IS NULL").bind(stamp, open.id));
  statements.push(
    db()
      .prepare(
        'INSERT INTO fushati_visits(id,user_id,cafeteria_id,day_key,arrived_at,arrive_lat,arrive_lng,arrive_accuracy_m,arrive_distance_m,last_lat,last_lng,last_accuracy_m,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        visitId, userId, cafeteria.id, dayKey(stamp), stamp,
        position.lat, position.lng, Math.round(position.accuracyM), distanceM,
        position.lat, position.lng, Math.round(position.accuracyM), stamp,
      ),
  );
  try {
    await db().batch(statements);
  } catch (error) {
    // Two check-ins raced: the unique index let one through. The other agent request is the same stay.
    if (!/UNIQUE constraint/i.test(String(error instanceof Error ? error.message : error))) throw error;
    const winner = await openVisit(userId);
    if (winner && winner.cafeteria_id === cafeteria.id) return {ok: true, visitId: winner.id, already: true, arrivedAt: winner.arrived_at};
    throw error;
  }
  return {ok: true, visitId, already: false, arrivedAt: stamp};
}

async function refresh(visitId: string, position: Position, stamp: string) {
  await db()
    .prepare('UPDATE fushati_visits SET last_lat=?,last_lng=?,last_accuracy_m=?,last_seen_at=? WHERE id=? AND left_at IS NULL')
    .bind(position.lat, position.lng, Math.round(position.accuracyM), stamp, visitId)
    .run();
}

/** Save the latest position of a checked-in agent. */
export async function recordPing(userId: string, position: Position): Promise<{checkedIn: false} | {checkedIn: true; visit: VisitRow}> {
  const stamp = now();
  const open = await closeIfLost(await openVisit(userId), Date.parse(stamp));
  if (!open) return {checkedIn: false};
  // Phones report every few seconds while moving; one stored position per interval is plenty.
  if (Date.parse(stamp) - Date.parse(open.last_seen_at) >= PING_MIN_INTERVAL_MS) await refresh(open.id, position, stamp);
  return {checkedIn: true, visit: open};
}

/** Record a departure. `position` (if the phone sent one) decides whether it is recorded as "left the area". */
export async function checkOut(userId: string, position: Position | null): Promise<{checkedOut: boolean; leftAt?: string; reason?: string}> {
  const stamp = now();
  const open = await closeIfLost(await openVisit(userId), Date.parse(stamp));
  if (!open) return {checkedOut: false};
  let reason = 'manual';
  if (position) {
    const cafeteria = await db().prepare('SELECT id,latitude,longitude,arrival_radius_m FROM fushati_cafeterias WHERE id=?').bind(open.cafeteria_id).first<CafeteriaPoint>();
    if (cafeteria && hasPoint(cafeteria) && hasLeftSpot(distanceMeters(position, {lat: cafeteria.latitude, lng: cafeteria.longitude}), cafeteria.arrival_radius_m, position.accuracyM)) reason = 'left_area';
  }
  await db()
    .prepare('UPDATE fushati_visits SET left_at=?,leave_reason=?,last_lat=?,last_lng=?,last_accuracy_m=?,last_seen_at=? WHERE id=? AND left_at IS NULL')
    .bind(stamp, reason, position?.lat ?? open.last_lat, position?.lng ?? open.last_lng, Math.round(position?.accuracyM ?? open.last_accuracy_m), stamp, open.id)
    .run();
  return {checkedOut: true, leftAt: stamp, reason};
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
  leftAt: string | null;
  leaveReason: string | null;
  state: VisitState;
  durationMin: number;
  arriveDistanceM: number;
  lastSeenAt: string;
  /** Only for a stay that is still open: where the agent's phone last reported. Past stays carry no position. */
  position: {lat: number; lng: number; accuracyM: number} | null;
};

type VisitWithUser = VisitRow & {full_name: string; phone: string; login_identifier: string};

/** Visits for the map and the log. A stay that went quiet for too long is shown as ended at its last report. */
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
    const endedAt = row.left_at ?? (state === 'lost' ? row.last_seen_at : null);
    const open = state === 'live' || state === 'stale';
    return {
      id: row.id,
      cafeteriaId: row.cafeteria_id,
      userId: row.user_id,
      name: row.full_name,
      phone: agentContactPhone(row),
      arrivedAt: row.arrived_at,
      leftAt: endedAt,
      leaveReason: row.left_at ? row.leave_reason : state === 'lost' ? 'signal_lost' : null,
      state,
      durationMin: durationMinutes(row.arrived_at, endedAt, nowMs),
      arriveDistanceM: row.arrive_distance_m,
      lastSeenAt: row.last_seen_at,
      position: open ? {lat: row.last_lat, lng: row.last_lng, accuracyM: row.last_accuracy_m} : null,
    };
  });
}
