import {env} from 'cloudflare:workers';
import {z, ZodError} from 'zod';
import {getKhotwaAccess, getChatGPTUser} from '../../../chatgpt-auth';
import {trustedBrowserOrigin} from '../../../../lib/request-origin';
import {audit, cafeteriaGrants, db, mustChange, now, response} from '../../../../lib/fushati/core';
import {grantAdministers, grantAllows} from '../../../../lib/fushati/permissions';
import {checkIn, checkOut, closeByAdmin, closeIfLost, openVisit, recordPing, visitsFor, type CafeteriaPoint} from '../../../../lib/fushati/presence';
import {MAX_ARRIVAL_RADIUS_M, MIN_ARRIVAL_RADIUS_M, roundCoordinate} from '../../../../lib/fushati/location';

// Where the cafeterias are, where the agents are (only while they are checked in), and when they came and left.
//
//   GET  ?op=map        administrators and supervisors with "presence_view": their cafeterias, who is there, the recent log
//   GET  ?op=status     an agent: his cafeterias' map points and whether he is checked in
//   POST check-in / ping / check-out     an agent's phone
//   POST set-location                    the system administrator: the cafeteria's map point and arrival radius
//   POST force-checkout                  an administrator ends a stay the agent forgot to end
//
// The school is never taken from the request. Every cafeteria used here comes from the signed-in user's own grants.
export const dynamic = 'force-dynamic';

const id = z.string().uuid();
const position = z.object({lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100000).transform((value) => Math.min(value, 5000))});
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
      const visit = await closeIfLost(await openVisit(access.userId), nowMs);
      const recent = (await db().prepare('SELECT v.id,v.cafeteria_id,v.arrived_at,v.left_at,v.leave_reason FROM fushati_visits v WHERE v.user_id=? ORDER BY v.arrived_at DESC LIMIT 10').bind(access.userId).all<{id: string; cafeteria_id: string; arrived_at: string; left_at: string | null; leave_reason: string | null}>()).results;
      return response({
        now: stamp,
        cafeterias: cafeterias.map((c) => ({id: c.id, name: c.name, alias: c.alias, latitude: c.latitude, longitude: c.longitude, radiusM: c.arrival_radius_m})),
        visit: visit ? {id: visit.id, cafeteriaId: visit.cafeteria_id, arrivedAt: visit.arrived_at, lastSeenAt: visit.last_seen_at} : null,
        recent: recent.map((r) => ({id: r.id, cafeteriaId: r.cafeteria_id, arrivedAt: r.arrived_at, leftAt: r.left_at, leaveReason: r.leave_reason})),
      });
    }

    if (op === 'map') {
      const visible = [...grants].filter(() => true).map(([cafeteriaId]) => cafeteriaId);
      const days = Math.min(31, Math.max(1, Number(search.get('days')) || 7));
      const rows = visible.length
        ? (await db().prepare('SELECT c.id,c.name,c.alias,c.active,c.latitude,c.longitude,c.arrival_radius_m,s.name AS school_name FROM fushati_cafeterias c JOIN khotwa_schools s ON s.id=c.school_id WHERE s.active=1 AND c.id IN (SELECT value FROM json_each(?))' + (access.role === 'fushati_agent' ? ' AND c.active=1' : '') + ' ORDER BY s.name,c.name').bind(JSON.stringify(visible)).all<Cafeteria>()).results
        : [];
      const visits = await visitsFor((await db().prepare('SELECT id FROM fushati_cafeterias').all<{id: string}>()).results.map((r) => r.id), new Date(nowMs - days * DAY_MS).toISOString(), nowMs);
      return response({
        now: stamp,
        canSetLocation: access.role === 'main_admin',
        cafeterias: rows.map((c) => ({id: c.id, name: c.name, alias: c.alias, schoolName: c.school_name, active: c.active === 1, latitude: c.latitude, longitude: c.longitude, radiusM: c.arrival_radius_m, canManage: grantAdministers(grants.get(c.id))})),
        visits,
      });
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

    // ---- the agent's phone ---------------------------------------------------------------------------------
    if (op === 'check-in' || op === 'ping' || op === 'check-out') {
      
      if (op === 'check-in') {
        const v = z.object({cafeteriaId: id}).extend(position.shape).parse(data);
        // Any assignment is enough: arriving at the counter does not depend on what the agent may do there.
        
        const cafeteria = await db().prepare('SELECT id,latitude,longitude,arrival_radius_m,active FROM fushati_cafeterias WHERE id=?').bind(v.cafeteriaId).first<CafeteriaPoint & {active: number}>();
        if (!cafeteria || !cafeteria.active) return fail('cafeteria', 'المقصف غير متاح', 403);
        const result = await checkIn(access.userId, cafeteria, {lat: v.lat, lng: v.lng, accuracyM: v.accuracyM});
        if (!result.ok && result.code === 'no_location') return fail('no_location', 'لم يحدد مدير النظام موقع هذا المقصف بعد', 409);
        if (!result.ok) return fail('too_far', 'لم تصل إلى المقصف بعد', 422, {distanceM: result.distanceM, radiusM: result.radiusM});
        return response({ok: true, visitId: result.visitId, arrivedAt: result.arrivedAt, already: result.already});
      }
      if (op === 'ping') {
        const v = position.parse(data);
        const result = await recordPing(access.userId, v);
        return result.checkedIn ? response({ok: true, checkedIn: true}) : fail('not_checked_in', 'لست مسجلاً في أي مقصف', 409);
      }
      const v = position.partial().parse(data ?? {});
      const where = v.lat !== undefined && v.lng !== undefined && v.accuracyM !== undefined ? {lat: v.lat, lng: v.lng, accuracyM: v.accuracyM} : null;
      const result = await checkOut(access.userId, where);
      return response({ok: true, checkedIn: false, ...result});
    }

    // ---- administrators ------------------------------------------------------------------------------------
    if (op === 'set-location') {
      if (access.role === 'fushati_agent') return fail('forbidden', 'x', 403);
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
      if (!visit) return fail('visit', 'السجل غير موجود', 404);
      const closed = await closeByAdmin(visit.id);
      if (closed) await audit(access.userId, op, 'visit', visit.id);
      return response({ok: true, closed});
    }
    return fail('unknown', 'عملية غير متاحة', 400);
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return fail('invalid', 'المدخلات غير صحيحة', 400);
  console.error('fushati_presence_failed', error instanceof Error ? error.name : 'unknown');
  return fail('unavailable', 'تعذرت العملية؛ تحقق من اتصال قاعدة البيانات وتطبيق الترحيل 0030', 503);
}
