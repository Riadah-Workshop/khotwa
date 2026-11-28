// Everything about places, for the cafeteria map and for arrival/departure of agents. Pure functions with no
// imports, no database and no DOM, so the server (to accept or refuse an arrival), the agent's phone (to notice
// arrival and departure), the map component and the tests all use exactly the same rules.
//
// Part 1: map and distance maths.  Part 2: when an agent counts as "at the cafeteria", "still there" and "gone".
//
// The phone decides by itself and reports only two things: "arrived" and "left". Its position is checked once on
// arrival (to refuse a claim from somewhere else) and never stored.

export type LatLng = {lat: number; lng: number};

export const EARTH_RADIUS_M = 6371008.8;
export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 19;
/** Web Mercator cannot show the poles. */
const MAX_MERCATOR_LAT = 85.0511287798;
/** Riyadh: where the map opens when there is nothing to show yet. */
export const DEFAULT_CENTER: LatLng = {lat: 24.7136, lng: 46.6753};

export const isLatitude = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
export const isLongitude = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
export const isLatLng = (value: unknown): value is LatLng => !!value && typeof value === 'object' && isLatitude((value as LatLng).lat) && isLongitude((value as LatLng).lng);

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;
export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Position on the whole-world image at this zoom, in pixels from its top-left corner. */
export function project(point: LatLng, zoom: number): {x: number; y: number} {
  const size = worldSize(zoom);
  const lat = Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, point.lat));
  const sin = Math.sin(toRadians(lat));
  return {
    x: ((point.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** The inverse of project(). */
export function unproject(x: number, y: number, zoom: number): LatLng {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / size) * 360 - 180};
}

/** How many metres one screen pixel covers at this latitude and zoom. */
export const metersPerPixel = (lat: number, zoom: number) => (2 * Math.PI * EARTH_RADIUS_M * Math.cos(toRadians(lat))) / worldSize(zoom);

/**
 * The centre and zoom that show every point inside a viewport of width x height pixels, with padding.
 * No points: the default centre at country scale. One point: street scale.
 */
export function fitBounds(points: LatLng[], width: number, height: number, padding = 48, maxZoom = 17): {center: LatLng; zoom: number} {
  if (!points.length) return {center: DEFAULT_CENTER, zoom: 5};
  if (points.length === 1) return {center: points[0], zoom: Math.min(16, maxZoom)};
  const flat = points.map((p) => project(p, 0));
  const minX = Math.min(...flat.map((p) => p.x)), maxX = Math.max(...flat.map((p) => p.x));
  const minY = Math.min(...flat.map((p) => p.y)), maxY = Math.max(...flat.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 1e-9), spanY = Math.max(maxY - minY, 1e-9);
  const room = {x: Math.max(width - padding * 2, 32), y: Math.max(height - padding * 2, 32)};
  // Zoom z multiplies the zero-zoom span by 2^z; take the largest whole zoom that still fits.
  const fit = Math.floor(Math.log2(Math.min(room.x / spanX, room.y / spanY)));
  const zoom = Math.min(maxZoom, clampZoom(fit));
  const center = unproject(((minX + maxX) / 2) * 2 ** zoom, ((minY + maxY) / 2) * 2 ** zoom, zoom);
  return {center, zoom};
}

/** Rounded for storage and display: six decimals is about 11 centimetres. */
export const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

// ---- Part 2: presence rules ------------------------------------------------------------------------------

export const DEFAULT_ARRIVAL_RADIUS_M = 150;
export const MIN_ARRIVAL_RADIUS_M = 30;
export const MAX_ARRIVAL_RADIUS_M = 1000;
/** A phone position less precise than this (for example a position guessed from the network) is not used to decide anything. */
export const MAX_USABLE_ACCURACY_M = 150;
/** How far beyond the arrival radius an agent must be before he counts as having left. Stops flicker at the edge. */
export const DEPARTURE_MARGIN_M = 50;
/**
 * A stay that has had no departure for this long is "not confirmed": the phone was off, the app was closed, or the
 * signal was lost, so nobody knows when the agent left. It is closed (without inventing a time) at his next arrival.
 */
export const STAY_MAX_MS = 16 * 3_600_000;
/** An arrival or departure that the phone reports with its own (earlier) time is accepted up to this far back. */
export const LATE_REPORT_MAX_MS = 12 * 3_600_000;
/** ...and never from the future (a few minutes of clock difference between the phone and the server are allowed). */
export const CLOCK_SKEW_MS = 5 * 60_000;

/** Old stays (before positions stopped being stored) keep the coordinates of the agent's phone this long. The times of the stay are kept. */
export const POSITION_RETENTION_DAYS = 30;
/** Consecutive reports clearly outside the area before the phone records the departure. */
export const OUTSIDE_FIXES_TO_LEAVE = 2;

export type Fix = LatLng & {accuracyM: number};
export type Spot = LatLng & {id: string; radiusM: number};

/** How much of the phone's reported uncertainty is allowed to count in the agent's favour. */
export const allowance = (accuracyM: number) => Math.min(Math.max(Number.isFinite(accuracyM) ? accuracyM : 0, 0), 100);

/** The position's uncertainty circle reaches into the arrival circle. */
export const isAtSpot = (distanceM: number, radiusM: number, accuracyM: number) => distanceM - allowance(accuracyM) <= radiusM;

/** The position is clearly beyond the arrival circle, with a margin, even after allowing for uncertainty. */
export const hasLeftSpot = (distanceM: number, radiusM: number, accuracyM: number) => distanceM - allowance(accuracyM) > radiusM + DEPARTURE_MARGIN_M;

export type VisitState = 'inside' | 'unconfirmed' | 'ended';

/**
 * inside: arrived and no departure yet. unconfirmed: no departure for so long (STAY_MAX_MS since the last
 * confirmation) that nobody knows whether he is still there. ended: the phone (or an administrator) recorded the departure.
 */
export function visitState(lastSeenAt: string, leftAt: string | null, nowMs: number): VisitState {
  if (leftAt) return 'ended';
  const age = nowMs - Date.parse(lastSeenAt);
  if (!Number.isFinite(age)) return 'unconfirmed';
  return age <= STAY_MAX_MS ? 'inside' : 'unconfirmed';
}

/**
 * The time to record for an arrival or a departure. A phone that was offline may report it late, with the time the
 * operating system saw it; that time is used when it is not in the future and not older than LATE_REPORT_MAX_MS,
 * otherwise the time the server received it is used.
 */
export function eventTime(reportedAt: string | null | undefined, nowMs: number): number {
  const reported = reportedAt ? Date.parse(reportedAt) : NaN;
  if (!Number.isFinite(reported)) return nowMs;
  if (reported > nowMs + CLOCK_SKEW_MS || reported < nowMs - LATE_REPORT_MAX_MS) return nowMs;
  return Math.min(reported, nowMs);
}

/** The nearest spot and how far it is, or null when there are none. */
export function nearestSpot(fix: LatLng, spots: Spot[]): {spot: Spot; distanceM: number} | null {
  let best: {spot: Spot; distanceM: number} | null = null;
  for (const spot of spots) {
    if (!isLatLng(spot)) continue;
    const distanceM = distanceMeters(fix, spot);
    if (!best || distanceM < best.distanceM) best = {spot, distanceM};
  }
  return best;
}

export type TrackerAction = {type: 'none'} | {type: 'check-in'; cafeteriaId: string} | {type: 'stay'} | {type: 'check-out'};

/**
 * What the agent's phone should do with a new position.
 *  - not checked in and inside a cafeteria's arrival circle: check in there
 *  - checked in: nothing to send ('stay'); after OUTSIDE_FIXES_TO_LEAVE reports in a row clearly outside, check out
 *  - an imprecise position decides nothing
 * `outsideCount` is how many reports in a row were clearly outside; the caller keeps it between calls.
 */
export function decideFix(visitCafeteriaId: string | null, outsideCount: number, fix: Fix, spots: Spot[]): {action: TrackerAction; outsideCount: number} {
  const usable = Number.isFinite(fix.accuracyM) && fix.accuracyM <= MAX_USABLE_ACCURACY_M;
  if (!visitCafeteriaId) {
    if (!usable) return {action: {type: 'none'}, outsideCount: 0};
    const inside = spots
      .filter((spot) => isAtSpot(distanceMeters(fix, spot), spot.radiusM, fix.accuracyM))
      .sort((a, b) => distanceMeters(fix, a) - distanceMeters(fix, b))[0];
    return inside ? {action: {type: 'check-in', cafeteriaId: inside.id}, outsideCount: 0} : {action: {type: 'none'}, outsideCount: 0};
  }
  const here = spots.find((spot) => spot.id === visitCafeteriaId);
  if (!here || !usable) return {action: {type: 'stay'}, outsideCount};
  if (!hasLeftSpot(distanceMeters(fix, here), here.radiusM, fix.accuracyM)) return {action: {type: 'stay'}, outsideCount: 0};
  const count = outsideCount + 1;
  return count >= OUTSIDE_FIXES_TO_LEAVE ? {action: {type: 'check-out'}, outsideCount: 0} : {action: {type: 'stay'}, outsideCount: count};
}

/** How long a stay lasted, in whole minutes (a stay still open counts up to `untilMs`). */
export function durationMinutes(arrivedAt: string, endedAt: string | null, untilMs: number): number {
  const end = endedAt ? Date.parse(endedAt) : untilMs;
  const minutes = Math.round((end - Date.parse(arrivedAt)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}
