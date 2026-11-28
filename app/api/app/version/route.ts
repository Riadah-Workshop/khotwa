import {env} from 'cloudflare:workers';
import {getRelease, versionAnswer} from '../../../../lib/app-diagnostics';
import {channelOf} from '../../../../lib/login-stamps';
export const dynamic = 'force-dynamic';

// The app asks, before anybody signs in, "I am version X on Android: is there something newer?". Nothing in the answer is
// secret (the newest and the oldest-still-allowed version, the store address, a short note), so this one is public.
// The website has no version and always gets "current".
const json = (value: unknown) => Response.json(value, {headers: {'Cache-Control': 'no-store'}});

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const tag = channelOf(req.headers.get('user-agent'));
  const platform = tag.channel !== 'web' ? tag.channel : params.get('platform') || '';
  const version = tag.version || params.get('version') || '';
  if ((platform !== 'android' && platform !== 'ios') || !env.DB) return json(versionAnswer(platform, version, null));
  return json(versionAnswer(platform, version, await getRelease(env.DB, platform)));
}
