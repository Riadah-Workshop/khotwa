import {env} from 'cloudflare:workers';
import {z, ZodError} from 'zod';
import {getKhotwaAccess, getChatGPTUser} from '../../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
import {audit, cafeteriaGrants, db, mustChange, now, response} from '../../../../lib/fushati/core';
import {grantAdministers, grantAllows} from '../../../../lib/fushati/permissions';
import {arrive, closeByAdmin, closeIfUnconfirmed, depart, eventsSince, openVisit, visitsFor, type CafeteriaPoint} from '../../../../lib/fushati/presence';
import {mailPresenceEvent} from '../../../../lib/fushati/presence-mail';
import {MAX_ARRIVAL_RADIUS_M, MIN_ARRIVAL_RADIUS_M, roundCoordinate} from '../../../../lib/fushati/location';

// Where the cafeterias are, and when each agent arrived and left.
//
//   GET  ?op=status     an agent's phone: the map points of his cafeterias and whether he is inside one. Nothing else:
//                       an agent never sees attendance, his own or anybody's.
//   GET  ?op=map        administrators: their cafeterias, who is inside now and the arrival/departure log
//   GET  ?op=feed       administrators: arrivals and departures since a given time (the alert bar polls this)
//   POST check-in / check-out            an agent's phone, by itself, when it notices he reached or left the cafeteria
//   POST set-location                    the system administrator: the cafeteria's map point and arrival radius
//   POST force-checkout                  an administrator ends a stay nobody ended
//   POST set-email-alerts                a cafeteria administrator: e-mail me on every arrival and departure
//
// The agent's position is looked at once, on arrival, to refuse a claim from somewhere else, and is never stored.
// The school is never taken from the request. Every cafeteria used here comes from the signed-in user's own grants.
export const dynamic = 'force-dynamic';

const id = z.string().uuid();
const position = z.object({lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100000).transform((value) => Math.min(value, 5000))});
const reportedAt = z.string().max(40).optional();
const bodyModel = z.object({op: z.string().min(1).max(45), data: z.unknown()});

const fail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => response({error: message, code, ...extra}, status);
const DAY_MS = 86_400_000;

async function current() {
  const [access, user] = await Promise.all([getKhotwaAccess(), getChatGPTUser()]);
  return access && user ? {...access, userId: user.userId} : null;
}

type Cafeteria = CafeteriaPoint & {name: string; alias: string; active: number; school_name: string};

export async function GET(req: Request) {
  const access = await current();
  if (!access) return fail('login', 'يرجى تسجيل الدخول', 401);
  if (access.role !== 'main_admin' && access.role !== 'fushati_admin' && access.role !== 'fushati_agent') return fail('forbidden', 'غير مسموح', 403);
  try {
    if (await mustChange(access)) return fail('password', 'غيّر كلمة المرور المؤقتة أولاً', 403);
    const search = new URL(req.url).searchParams;
    const op = search.get('op') || 'map';
    const stamp = now(), nowMs = Date.parse(stamp);
    const grants = await cafeteriaGrants(access);

    if (op === 'status') {
      if (access.role !== 'fushati_agent') return fail('forbidden', 'للموظفين فقط', 403);
      const ids = [...grants.keys()];
      const cafeterias = ids.length
        ? (await db().prepare('SELECT c.id,c.name,c.alias,c.latitude,c.longitude,c.arrival_radius_m FROM fushati_cafeterias c WHERE c.active=1 AND c.id IN (SELECT value FROM json_each(?)) ORDER BY c.name').bind(JSON.stringify(ids)).all<{id: string; name: string; alias: string; latitude: number | null; longitude: number | null; arrival_radius_m: number}>()).results
        : [];
      const visit = await closeIfUnconfirmed(await openVisit(access.userId), nowMs);
      return response({
        now: stamp,
        cafeterias: cafeterias.map((c) => ({id: c.id, latitude: c.latitude, longitude: c.longitude, radiusM: c.arrival_radius_m})),
        insideCafeteriaId: visit ? visit.cafeteria_id : null,
      });
    }

    // Everything below is for administrators. An agent gets nothing, whatever he was once granted.
    if (access.role === 'fushati_agent') return fail('forbidden', 'للمديرين فقط', 403);
    const visible = [...grants].filter(([, grant]) => grantAllows(grant, 'presence_view')).map(([cafeteriaId]) => cafeteriaId);

    if (op === 'map') {
      const days = Math.min(31, Math.max(1, Number(search.get('days')) || 7));
      const rows = visible.length
        ? (await db().prepare('SELECT c.id,c.name,c.alias,c.active,c.latitude,c.longitude,c.arrival_radius_m,s.name AS school_name FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id WHERE s.active=1 AND c.id IN (SELECT value FROM json_each(?)) ORDER BY s.name,c.name').bind(JSON.stringify(visible)).all<Cafeteria>()).results
        : [];
      const visits = await visitsFor(rows.map((c) => c.id), new Date(nowMs - days * DAY_MS).toISOString(), nowMs);
      const mine = access.role === 'fushati_admin' ? await db().prepare('SELECT presence_email FROM fushati_users WHERE id=?').bind(access.userId).first<{presence_email: number}>() : null;
      return response({
        now: stamp,
        canSetLocation: access.role === 'main_admin',
        canEmail: access.role === 'fushati_admin',
        emailAlerts: mine?.presence_email === 1,
        cafeterias: rows.map((c) => ({id: c.id, name: c.name, alias: c.alias, schoolName: c.school_name, active: c.active === 1, latitude: c.latitude, longitude: c.longitude, radiusM: c.arrival_radius_m, canManage: grantAdministers(grants.get(c.id))})),
        visits,
      });
    }

    if (op === 'feed') {
      // No cursor yet: nothing to announce, just the time to start from. The alert bar never replays history.
      const since = search.get('since');
      const cursor = since && Number.isFinite(Date.parse(since)) ? new Date(Math.max(Date.parse(since), nowMs - DAY_MS)).toISOString() : null;
      const events = cursor ? await eventsSince(visible, cursor) : [];
      const names = new Map<string, string>();
      if (events.length) {
        const rows = (await db().prepare('SELECT id,name,alias FROM fushati_cafeterias WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...new Set(events.map((event) => event.cafeteriaId))])).all<{id: string; name: string; alias: string}>()).results;
        for (const row of rows) names.set(row.id, row.alias ? `${row.alias} (${row.name})` : row.name);
      }
      return response({now: stamp, events: events.map((event) => ({...event, cafeteria: names.get(event.cafeteriaId) ?? ''}))});
    }
    return fail('unknown', 'عملية غير متاحة', 400);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request) {
  const access = await current();
  if (!access) return fail('login', 'يرجى تسجيل الدخول', 401);
  if (!trustedBrowserOrigin(req, env.KHOTWA_PUBLIC_ORIGINS) || !req.headers.get('content-type')?.startsWith('application/json')) return fail('origin', 'طلب غير مسموح', 403);
  if (access.role !== 'main_admin' && access.role !== 'fushati_admin' && access.role !== 'fushati_agent') return fail('forbidden', 'غير مسموح', 403);
  try {
    const raw = await req.text();
    if (raw.length > 4000) return fail('size', 'الطلب أكبر من المسموح', 413);
    const {op, data} = bodyModel.parse(JSON.parse(raw));
    if (await mustChange(access)) return fail('password', 'غيّر كلمة المرور المؤقتة أولاً', 403);

    // ---- the agent's phone, by itself ----------------------------------------------------------------------
    if (op === 'check-in' || op === 'check-out') {
      if (access.role !== 'fushati_agent') return fail('forbidden', 'الحضور التلقائي لموظفي المقصف فقط', 403);
      if (op === 'check-in') {
        const v = z.object({cafeteriaId: id, at: reportedAt}).extend(position.shape).parse(data);
        // Any assignment is enough: arriving at the counter does not depend on what the agent may do there.
        if (!(await cafeteriaGrants(access)).has(v.cafeteriaId)) return fail('cafeteria', 'المقصف غير متاح', 403);
        const cafeteria = await db().prepare('SELECT id,latitude,longitude,arrival_radius_m,active FROM fushati_cafeterias WHERE id=?').bind(v.cafeteriaId).first<CafeteriaPoint & {active: number}>();
        if (!cafeteria || !cafeteria.active) return fail('cafeteria', 'المقصف غير متاح', 403);
        const result = await arrive(access.userId, cafeteria, {lat: v.lat, lng: v.lng, accuracyM: v.accuracyM}, v.at);
        if (!result.ok && result.code === 'no_location') return fail('no_location', 'لم يحدد مدير النظام موقع هذا المقصف بعد', 409);
        if (!result.ok) return fail('too_far', 'لم تصل إلى المقصف بعد', 422, {distanceM: result.distanceM, radiusM: result.radiusM});
        if (!result.already) {
          const agent = await db().prepare('SELECT full_name FROM fushati_users WHERE id=?').bind(access.userId).first<{full_name: string}>();
          if (result.movedFrom) await mailPresenceEvent('left', result.movedFrom, agent?.full_name ?? '', now());
          await mailPresenceEvent('arrived', cafeteria.id, agent?.full_name ?? '', result.arrivedAt);
        }
        return response({ok: true, already: result.already});
      }
      const v = position.partial().extend({at: reportedAt}).parse(data ?? {});
      const where = v.lat !== undefined && v.lng !== undefined && v.accuracyM !== undefined ? {lat: v.lat, lng: v.lng, accuracyM: v.accuracyM} : null;
      const result = await depart(access.userId, where, v.at);
      if (result.checkedOut) {
        const agent = await db().prepare('SELECT full_name FROM fushati_users WHERE id=?').bind(access.userId).first<{full_name: string}>();
        await mailPresenceEvent('left', result.cafeteriaId, agent?.full_name ?? '', result.leftAt);
      }
      return response({ok: true, checkedOut: result.checkedOut});
    }

    // ---- administrators ------------------------------------------------------------------------------------
    if (op === 'set-location') {
      if (access.role !== 'main_admin') return fail('forbidden', 'موقع المقصف يحدده مدير نظام خطوة فقط', 403);
      const v = z.object({id, latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(), radiusM: z.number().int().min(MIN_ARRIVAL_RADIUS_M).max(MAX_ARRIVAL_RADIUS_M).optional()}).parse(data);
      if ((v.latitude === null) !== (v.longitude === null)) return fail('invalid', 'أدخل خط العرض وخط الطول معاً', 400);
      const cafeteria = await db().prepare('SELECT id FROM fushati_cafeterias WHERE id=?').bind(v.id).first();
      if (!cafeteria) return fail('cafeteria', 'المقصف غير موجود', 404);
      await db().prepare('UPDATE fushati_cafeterias SET latitude=?,longitude=?,arrival_radius_m=COALESCE(?,arrival_radius_m) WHERE id=?')
        .bind(v.latitude === null ? null : roundCoordinate(v.latitude), v.longitude === null ? null : roundCoordinate(v.longitude), v.radiusM ?? null, v.id).run();
      await audit(access.userId, op, 'cafeteria', v.id);
      return response({ok: true});
    }
    if (op === 'force-checkout') {
      if (access.role === 'fushati_agent') return fail('forbidden', 'للمدير فقط', 403);
      const v = z.object({visitId: id}).parse(data);
      const visit = await db().prepare('SELECT id,cafeteria_id FROM fushati_visits WHERE id=?').bind(v.visitId).first<{id: string; cafeteria_id: string}>();
      // Unknown and not-yours look the same.
      if (!visit || !grantAdministers((await cafeteriaGrants(access)).get(visit.cafeteria_id))) return fail('visit', 'السجل غير موجود', 404);
      const closed = await closeByAdmin(visit.id);
      if (closed) await audit(access.userId, op, 'visit', visit.id);
      return response({ok: true, closed});
    }
    if (op === 'set-email-alerts') {
      if (access.role !== 'fushati_admin') return fail('forbidden', 'لمدير المقصف فقط', 403);
      const v = z.object({enabled: z.boolean()}).parse(data);
      await db().prepare('UPDATE fushati_users SET presence_email=? WHERE id=? AND role=\'fushati_admin\'').bind(v.enabled ? 1 : 0, access.userId).run();
      return response({ok: true, emailAlerts: v.enabled});
    }
    return fail('unknown', 'عملية غير متاحة', 400);
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return fail('invalid', 'المدخلات غير صحيحة', 400);
  console.error('fushati_presence_failed', error instanceof Error ? error.name : 'unknown');
  return fail('unavailable', 'تعذرت العملية؛ تحقق من اتصال قاعدة البيانات وتطبيق الترحيل 0033', 503);
}
