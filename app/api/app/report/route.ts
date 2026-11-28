import {env} from 'cloudflare:workers';
import {getChatGPTUser, getKhotwaAccess} from '../../../chatgpt-auth';
import {recordDevice, recordIssue} from '../../../../lib/app-diagnostics';
import {describeAgent, MAX_REPORT_BYTES, normalizeDevice, normalizeIssue} from '../../../../lib/app-report';
import {channelOf} from '../../../../lib/login-stamps';
export const dynamic = 'force-dynamic';

// The website and the apps tell the server what went wrong with them ({issue}) and whether the phone allows what the
// account needs ({device}). Any signed-in role may send it (the gateway lets it through even for the read-only manager);
// only the system administrator can read it back (/api/admin/diagnostics). Reports are small, cleaned (lib/app-report.ts)
// and counted, and a failed write is silent: this must never make the app worse.
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});

export async function POST(req: Request) {
  const [access, user] = await Promise.all([getKhotwaAccess(), getChatGPTUser()]);
  if (!access || !user) return json({error: 'Sign in first'}, 401);
  const text = await req.text();
  if (text.length > MAX_REPORT_BYTES) return json({error: 'Report too large'}, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({error: 'Invalid report'}, 400);
  }
  if (!body || typeof body !== 'object') return json({error: 'Invalid report'}, 400);
  const data = body as {issue?: unknown; device?: unknown};
  const issue = data.issue === undefined ? null : normalizeIssue(data.issue);
  const device = data.device === undefined ? null : normalizeDevice(data.device);
  if (!issue && !device) return json({error: 'Nothing to record'}, 400);
  if (!env.DB) return json({ok: true, issue: false, device: false});
  const userAgent = req.headers.get('user-agent');
  const tag = channelOf(userAgent);
  const who = {role: access.role, accountKey: user.userId, schoolId: access.schoolId, channel: tag.channel, appVersion: tag.version, platform: describeAgent(userAgent)};
  const [issueStored, deviceStored] = await Promise.all([issue ? recordIssue(env.DB, issue, who) : false, device ? recordDevice(env.DB, device, who) : false]);
  return json({ok: true, issue: issueStored, device: deviceStored});
}
