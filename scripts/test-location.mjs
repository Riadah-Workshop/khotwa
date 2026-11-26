// The cafeteria map and arrival rules (lib/fushati/location.ts) and the phone-number helpers.
// Pure functions: no database. The server and the agent's phone both use these, so the thresholds are pinned here.
// Run: node --experimental-strip-types scripts/test-location.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_CENTER, DEPARTURE_MARGIN_M, LIVE_WINDOW_MS, MAX_USABLE_ACCURACY_M, OUTSIDE_FIXES_TO_LEAVE, SIGNAL_LOST_MS,
  allowance, decideFix, distanceMeters, durationMinutes, fitBounds, hasLeftSpot, isAtSpot, isLatLng, isLatitude, isLongitude,
  metersPerPixel, nearestSpot, project, roundCoordinate, unproject, visitState,
} from '../lib/fushati/location.ts';
import {agentContactPhone, normalizeAgentIdentifier, normalizeContactPhone} from '../lib/fushati/identifiers.ts';

const riyadh = {lat: 24.7136, lng: 46.6753};
const jeddah = {lat: 21.4858, lng: 39.1925};
/** A point this many metres north of `from`. */
const north = (from, metres) => ({lat: from.lat + metres / 111195, lng: from.lng});
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };

// ---- distances -------------------------------------------------------------------------------------------------
ok(Math.abs(distanceMeters({lat: 0, lng: 0}, {lat: 1, lng: 0}) - 111195) < 200, 'one degree of latitude is about 111 km');
eq(Math.round(distanceMeters(riyadh, riyadh)), 0, 'a point is 0 m from itself');
const riyadhJeddah = distanceMeters(riyadh, jeddah);
ok(riyadhJeddah > 840_000 && riyadhJeddah < 860_000, `Riyadh to Jeddah is about 850 km, got ${Math.round(riyadhJeddah)}`);
ok(Math.abs(distanceMeters(riyadh, north(riyadh, 100)) - 100) < 1, '100 m north is 100 m away');
eq(distanceMeters(riyadh, jeddah), distanceMeters(jeddah, riyadh), 'distance is symmetric');

// ---- coordinates -----------------------------------------------------------------------------------------------
ok(isLatitude(90) && isLatitude(-90) && !isLatitude(90.0001) && !isLatitude(NaN) && !isLatitude('24'), 'latitude bounds');
ok(isLongitude(180) && isLongitude(-180) && !isLongitude(181) && !isLongitude(Infinity), 'longitude bounds');
ok(isLatLng(riyadh) && !isLatLng({lat: 24, lng: 'x'}) && !isLatLng(null), 'isLatLng');
eq(roundCoordinate(24.71360049999), 24.713600, 'six decimals');

// ---- map projection --------------------------------------------------------------------------------------------
for (const zoom of [2, 7, 12, 16, 19]) {
  const p = project(riyadh, zoom), back = unproject(p.x, p.y, zoom);
  ok(Math.abs(back.lat - riyadh.lat) < 1e-9 && Math.abs(back.lng - riyadh.lng) < 1e-9, `project/unproject round trip at zoom ${zoom}`);
}
ok(Math.abs(project({lat: 0, lng: 0}, 0).x - 128) < 1e-9 && Math.abs(project({lat: 0, lng: 0}, 0).y - 128) < 1e-9, 'the equator at the prime meridian is the middle of the world image');
ok(Math.abs(metersPerPixel(0, 0) - 156543.03) < 400, 'about 156 km per pixel at zoom 0 (the app uses the mean Earth radius; the difference is 0.1%)');
ok(metersPerPixel(24.7, 16) < metersPerPixel(0, 16), 'a pixel covers less ground away from the equator');
// An agent-sized circle (150 m) should be a visible size at street zoom.
ok(150 / metersPerPixel(24.7, 17) > 20, 'a 150 m arrival circle is visible at street zoom');

// ---- fit to markers --------------------------------------------------------------------------------------------
{
  const none = fitBounds([], 800, 500);
  eq(none.zoom, 5, 'no markers: country scale');
  eq(none.center.lat, DEFAULT_CENTER.lat, 'no markers: centred on Riyadh');
  const one = fitBounds([riyadh], 800, 500);
  ok(one.zoom >= 15 && one.zoom <= 17 && one.center.lat === riyadh.lat, 'one marker: street scale, centred on it');
  const many = fitBounds([riyadh, jeddah, north(riyadh, 5000)], 800, 500);
  const centre = project(many.center, many.zoom);
  for (const point of [riyadh, jeddah]) {
    const p = project(point, many.zoom);
    ok(Math.abs(p.x - centre.x) <= 400 && Math.abs(p.y - centre.y) <= 250, 'every marker is inside the viewport');
  }
  const tight = fitBounds([riyadh, north(riyadh, 200)], 800, 500);
  ok(tight.zoom > many.zoom, 'markers close together are shown more closely');
  ok(fitBounds([riyadh, north(riyadh, 0.0001)], 800, 500).zoom <= 17, 'two almost identical markers do not zoom past street level');
}

// ---- arrival and departure thresholds --------------------------------------------------------------------------
eq(allowance(30), 30, 'a precise position keeps its accuracy allowance');
eq(allowance(500), 100, 'the allowance is capped at 100 m');
eq(allowance(-5), 0, 'a negative accuracy is treated as 0');
eq(allowance(NaN), 0, 'an unknown accuracy is treated as 0');
ok(isAtSpot(150, 150, 0), 'exactly on the radius counts as at the cafeteria');
ok(!isAtSpot(151, 150, 0), 'a metre outside does not');
ok(isAtSpot(180, 150, 30), 'the phone is 30 m unsure, so 180 m away can still be inside');
ok(!isAtSpot(181, 150, 30), '...but not 181 m');
ok(isAtSpot(250, 150, 5000) && !isAtSpot(251, 150, 5000), 'however unsure the phone is, only 100 m of doubt is allowed');
ok(!hasLeftSpot(150 + DEPARTURE_MARGIN_M, 150, 0), 'just beyond the radius is not "left" yet');
ok(hasLeftSpot(150 + DEPARTURE_MARGIN_M + 1, 150, 0), 'beyond the radius and the margin is "left"');
ok(!hasLeftSpot(260, 150, 80), 'an unsure phone is not declared gone');

// ---- stay state ------------------------------------------------------------------------------------------------
{
  const at = Date.parse('2026-11-26T08:00:00.000Z');
  const seen = (ms) => new Date(at - ms).toISOString();
  eq(visitState(seen(0), null, at), 'live', 'just reported');
  eq(visitState(seen(LIVE_WINDOW_MS), null, at), 'live', 'at the edge of the live window');
  eq(visitState(seen(LIVE_WINDOW_MS + 1000), null, at), 'stale', 'quiet for a few minutes');
  eq(visitState(seen(SIGNAL_LOST_MS), null, at), 'stale', 'at the edge of signal lost');
  eq(visitState(seen(SIGNAL_LOST_MS + 1000), null, at), 'lost', 'quiet for too long');
  eq(visitState(seen(0), '2026-11-26T08:00:00.000Z', at), 'ended', 'checked out');
  eq(visitState('not a date', null, at), 'lost', 'a corrupt timestamp is never "live"');
  eq(durationMinutes('2026-11-26T05:00:00.000Z', '2026-11-26T06:30:00.000Z', at), 90, 'duration of a finished stay');
  eq(durationMinutes('2026-11-26T07:30:00.000Z', null, at), 30, 'an open stay counts up to now');
  eq(durationMinutes('2026-11-26T09:00:00.000Z', null, at), 0, 'never negative');
}

// ---- what the phone does with each position --------------------------------------------------------------------
{
  const school = {id: 'A', ...riyadh, radiusM: 150};
  const other = {id: 'B', ...jeddah, radiusM: 150};
  const spots = [school, other];
  const fix = (point, accuracyM = 10) => ({...point, accuracyM});
  const act = (visit, outside, f) => decideFix(visit, outside, f, spots);

  eq(act(null, 0, fix(north(riyadh, 1000))).action.type, 'none', 'far from every cafeteria: nothing happens');
  const arrive = act(null, 0, fix(north(riyadh, 60)));
  ok(arrive.action.type === 'check-in' && arrive.action.cafeteriaId === 'A', 'inside the arrival circle: check in at that cafeteria');
  eq(act(null, 0, fix(riyadh, MAX_USABLE_ACCURACY_M + 1)).action.type, 'none', 'a position this vague (e.g. network guess) never checks anybody in');
  eq(act(null, 0, fix(north(riyadh, 170), 100)).action.type, 'check-in', 'a bit outside but unsure by 100 m: inside');
  // Two cafeterias whose circles overlap: the nearer one wins.
  const near = decideFix(null, 0, fix(north(riyadh, 10)), [{id: 'far', ...north(riyadh, 120), radiusM: 150}, {id: 'near', ...riyadh, radiusM: 150}]);
  ok(near.action.type === 'check-in' && near.action.cafeteriaId === 'near', 'overlapping circles: the nearest cafeteria');

  eq(act('A', 0, fix(north(riyadh, 40))).action.type, 'ping', 'checked in and inside: keep reporting');
  const first = act('A', 0, fix(north(riyadh, 400)));
  ok(first.action.type === 'ping' && first.outsideCount === 1, 'first report clearly outside: keep reporting, count it');
  ok(OUTSIDE_FIXES_TO_LEAVE === 2, 'two reports in a row are needed to leave');
  const second = act('A', first.outsideCount, fix(north(riyadh, 405)));
  eq(second.action.type, 'check-out', 'second report outside in a row: record the departure');
  eq(second.outsideCount, 0, 'the count restarts after departure');
  const back = act('A', 1, fix(north(riyadh, 80)));
  ok(back.action.type === 'ping' && back.outsideCount === 0, 'back inside before the second report: the count is cleared (a brief GPS jump is not a departure)');
  const vague = act('A', 1, fix(north(riyadh, 900), MAX_USABLE_ACCURACY_M + 50));
  ok(vague.action.type === 'ping' && vague.outsideCount === 1, 'a vague position is reported but does not count towards leaving');
  const edge = act('A', 1, fix(north(riyadh, 190)));
  ok(edge.action.type === 'ping' && edge.outsideCount === 0, 'between the radius and the margin: still there');
  eq(act('GONE', 0, fix(riyadh)).action.type, 'ping', 'a stay at a cafeteria the phone does not know is just reported');
  eq(decideFix('A', 0, fix(riyadh), []).action.type, 'ping', 'no known cafeterias while checked in: report');

  const nearestOne = nearestSpot(north(riyadh, 30), spots);
  ok(nearestOne && nearestOne.spot.id === 'A' && Math.round(nearestOne.distanceM) === 30, 'nearest cafeteria and its distance');
  eq(nearestSpot(riyadh, []), null, 'no cafeterias: no nearest');
}

// ---- phone numbers ---------------------------------------------------------------------------------------------
for (const [input, expected] of [
  ['0512345678', '+966512345678'], ['+966 51 234 5678', '+966512345678'], ['966512345678', '+966512345678'], ['00966512345678', '+966512345678'],
  ['512345678', '+966512345678'], ['٠٥١٢٣٤٥٦٧٨', '+966512345678'], ['(051) 234-5678', '+966512345678'],
  ['1012345678', ''], ['0412345678', ''], ['abc', ''], ['', ''], ['05123', ''], [null, ''], [undefined, ''],
]) eq(normalizeContactPhone(input), expected, `contact phone ${JSON.stringify(input)}`);
eq(agentContactPhone({phone: '+966511111111', login_identifier: 'phone:+966522222222'}), '+966511111111', 'a contact phone wins');
eq(agentContactPhone({phone: '', login_identifier: 'phone:+966522222222'}), '+966522222222', 'a phone login is the fallback');
eq(agentContactPhone({phone: '', login_identifier: 'iqama:1012345678'}), '', 'an ID number is never shown as a phone');
eq(agentContactPhone({}), '', 'nothing known');
eq(normalizeAgentIdentifier('0512345678'), 'phone:+966512345678', 'login identifiers are unchanged');

console.log(`Location rules passed: distances, projection, fit-to-markers, arrival/departure thresholds, stay states, the phone's decisions and phone numbers (${checks} checks).`);
