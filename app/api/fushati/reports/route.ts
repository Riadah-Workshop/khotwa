import {z} from 'zod';
import {getKhotwaAccess, getChatGPTUser} from '../../../chatgpt-auth';
import {cafeteriaGrants, db, keyDate, mustChange, response} from '../../../../lib/fushati/core';
import {grantAllows} from '../../../../lib/fushati/permissions';
import {defaultRange, rangeProblem, reportById, reportCatalog, runReport, toCsv, REPORTS} from '../../../../lib/fushati/reports';

// Cafeteria reports (read only).
//
//   GET ?op=catalog      the reports this user may open, and for each cafeteria which of them
//   GET ?op=run&report=<id>&cafeteriaId=<uuid|all>[&from=YYYY-MM-DD&to=YYYY-MM-DD][&format=csv][&lang=ar|en]
//
// Opening a report takes the "reports" permission in the cafeteria plus the permission for the kind of data in it
// (see lib/fushati/reports.ts). "all" means every cafeteria where the user has both; the cafeterias come from the
// signed-in user's own grants, never from the request. Reports are totals only: no student, parent or position.
export const dynamic = 'force-dynamic';

const id = z.string().uuid();
const fail = (code: string, message: string, status: number) => response({error: message, code}, status);

async function current() {
  const [access, user] = await Promise.all([getKhotwaAccess(), getChatGPTUser()]);
  return access && user ? {...access, userId: user.userId} : null;
}

export async function GET(req: Request) {
  const access = await current();
  if (!access) return fail('login', 'يرجى تسجيل الدخول', 401);
  if (access.role !== 'main_admin' && access.role !== 'fushati_admin' && access.role !== 'fushati_agent') return fail('forbidden', 'غير مسموح', 403);
  try {
    if (await mustChange(access)) return fail('password', 'غيّر كلمة المرور المؤقتة أولاً', 403);
    const search = new URL(req.url).searchParams;
    const op = search.get('op') || 'catalog';
    const grants = await cafeteriaGrants(access);
    const ids = [...grants.keys()];
    // The cafeterias he can use at all; an agent never reaches a disabled one.
    const cafeterias = ids.length
      ? (await db().prepare('SELECT id,name,alias,active FROM fushati_cafeterias WHERE id IN (SELECT value FROM json_each(?)) ORDER BY name').bind(JSON.stringify(ids)).all<{id: string; name: string; alias: string; active: number}>()).results
          .filter((cafe) => cafe.active || access.role !== 'fushati_agent')
      : [];
    const label = (cafe: {name: string; alias: string}) => cafe.alias || cafe.name;
    const mayOpen = (cafeteriaId: string, permission: Parameters<typeof grantAllows>[1]) => grantAllows(grants.get(cafeteriaId), 'reports') && grantAllows(grants.get(cafeteriaId), permission);

    if (op === 'catalog') {
      const today = keyDate().day;
      const available = cafeterias.map((cafe) => ({id: cafe.id, label: label(cafe), active: !!cafe.active, reports: REPORTS.filter((report) => mayOpen(cafe.id, report.needs)).map((report) => report.id)})).filter((cafe) => cafe.reports.length);
      const usable = new Set(available.flatMap((cafe) => cafe.reports));
      return response({reports: reportCatalog().filter((report) => usable.has(report.id)), cafeterias: available, today, ...defaultRange(today)});
    }

    if (op !== 'run') return fail('unknown', 'عملية غير متاحة', 400);
    const report = reportById(search.get('report') || '');
    if (!report) return fail('report', 'التقرير غير موجود', 404);
    const today = keyDate().day, range = defaultRange(today);
    const from = search.get('from') || range.from, to = search.get('to') || range.to;
    const problem = rangeProblem(from, to);
    if (problem) return fail('date', problem === 'long' ? 'الفترة أطول من سنة' : 'تاريخ التقرير غير صحيح', 400);
    const wanted = search.get('cafeteriaId') || 'all';
    let scope = cafeterias.filter((cafe) => mayOpen(cafe.id, report.needs));
    if (wanted !== 'all') {
      if (!id.safeParse(wanted).success) return fail('input', 'المقصف غير صحيح', 400);
      scope = scope.filter((cafe) => cafe.id === wanted);
    }
    // Not yours, not found and not permitted all answer alike.
    if (!scope.length) return fail('forbidden', 'التقرير غير متاح', 403);
    const result = await runReport(report, scope.map((cafe) => cafe.id), new Map(scope.map((cafe) => [cafe.id, label(cafe)])), from, to);
    if (search.get('format') === 'csv') {
      const lang = search.get('lang') === 'en' ? 'en' : 'ar';
      return new Response(toCsv(result, lang), {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="fushati-${report.id}${report.dated ? `-${from}-${to}` : ''}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
    }
    return response({...result, title: report.title, description: report.description, cafeterias: scope.map((cafe) => ({id: cafe.id, label: label(cafe)})), generatedAt: new Date().toISOString()});
  } catch {
    return fail('server', 'تعذر إنشاء التقرير. أعد المحاولة.', 500);
  }
}
