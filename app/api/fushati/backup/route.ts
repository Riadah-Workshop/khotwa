import {getKhotwaAccess, getChatGPTUser} from '../../../chatgpt-auth';
import {audit, response} from '../../../../lib/fushati/core';
import {exportCafeteriaData} from '../../../../lib/fushati/backup';

// A copy of all cafeteria data. System administrator only: it holds every cafeteria's money records, bank details,
// parents' phone numbers and staff. Password hashes, card secrets and agent coordinates are left out (lib/fushati/backup.ts).
export const dynamic = 'force-dynamic';

export async function GET() {
  const [access, user] = await Promise.all([getKhotwaAccess(), getChatGPTUser()]);
  if (!access || !user) return response({error: 'يرجى تسجيل الدخول', code: 'login'}, 401);
  if (access.role !== 'main_admin') return response({error: 'غير مسموح', code: 'forbidden'}, 403);
  try {
    const data = await exportCafeteriaData();
    await audit(user.userId, 'backup-export', 'platform', 'cafeteria', JSON.stringify(data.counts).slice(0, 400));
    return new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="khotwa-cafeteria-backup.json"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
  } catch {
    return response({error: 'تعذر إنشاء النسخة الاحتياطية. حاول مجدداً.', code: 'server'}, 500);
  }
}
