import {env} from 'cloudflare:workers';
import {getKhotwaAccess} from '../../../chatgpt-auth';
import {changeIssues, diagnosticsSnapshot, setRelease} from '../../../../lib/app-diagnostics';
import type {IssueOp} from '../../../../lib/app-diagnostics';
export const dynamic = 'force-dynamic';

// The Diagnostics tab of the system administrator: how the server is, what the website and the apps reported, which phones
// cannot do what their account needs, which app versions are in use, and who signed in lately. Nobody else may read it.
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const ISSUE_OPS = new Set(['resolve-issue', 'reopen-issue', 'delete-issue', 'clear-solved']);

type Bindings = {DB?: D1Database; BUCKET?: unknown; KHOTWA_FROM_EMAIL?: string; KHOTWA_SMTP_USER?: string; KHOTWA_SMTP_PASSWORD?: string; RESEND_API_KEY?: string; KHOTWA_PUBLIC_ORIGINS?: string};

export async function GET(req: Request) {
  if ((await getKhotwaAccess())?.role !== 'main_admin') return json({error: 'Admin only'}, 403);
  const config = env as unknown as Bindings;
  if (!config.DB) return json({error: 'Database unavailable'}, 503);
  const environment = {
    mail: Boolean(config.KHOTWA_FROM_EMAIL && ((config.KHOTWA_SMTP_USER && config.KHOTWA_SMTP_PASSWORD) || config.RESEND_API_KEY)),
    origins: Boolean(config.KHOTWA_PUBLIC_ORIGINS),
    storage: Boolean(config.BUCKET),
  };
  return json(await diagnosticsSnapshot(config.DB, environment, {showSolved: new URL(req.url).searchParams.get('solved') === '1'}));
}

export async function POST(req: Request) {
  if ((await getKhotwaAccess())?.role !== 'main_admin') return json({error: 'Admin only'}, 403);
  const db = (env as unknown as Bindings).DB;
  if (!db) return json({error: 'Database unavailable'}, 503);
  let body: {op?: unknown; data?: Record<string, unknown>};
  try {
    body = await req.json();
  } catch {
    return json({error: 'Invalid request'}, 400);
  }
  const op = String(body.op || '');
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  try {
    if (ISSUE_OPS.has(op)) return json({ok: true, changed: await changeIssues(db, op as IssueOp, data.fingerprint)});
    if (op === 'set-release') {
      const result = await setRelease(db, {platform: data.platform, latest: data.latest, minimum: data.minimum, storeUrl: data.storeUrl, notesAr: data.notesAr, notesEn: data.notesEn});
      return result.ok ? json({ok: true, release: result.release}) : json({error: result.code}, 400);
    }
    return json({error: 'Unknown operation'}, 400);
  } catch {
    return json({error: 'Unable to save. Check database migrations.'}, 503);
  }
}
