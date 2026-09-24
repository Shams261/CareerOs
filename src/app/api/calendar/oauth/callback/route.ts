import { cookies } from 'next/headers';
import { owner } from '@/server/db';
import {
  CalendarError,
  completeOAuth,
  defaultDeps,
} from '@/features/calendar/service';
import { syncSoon } from '@/features/calendar/background';
import { OAUTH_COOKIE } from '@/features/calendar/domain';
export const runtime = 'nodejs';

/** Google redirects here with ?code&state (or ?error). Tokens never reach the browser. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (query: string) =>
    Response.redirect(new URL(`/calendar?${query}`, url), 303);
  const deps = defaultDeps();
  if (!deps) return back('google=error&reason=not_configured');
  const jar = await cookies();
  const cookie = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  const user = await owner();
  try {
    await completeOAuth(
      user,
      {
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
        error: url.searchParams.get('error'),
        cookie,
      },
      deps,
    );
  } catch (error) {
    const reason =
      error instanceof CalendarError ? error.code : 'exchange_failed';
    console.warn('[calendar] oauth callback rejected', reason);
    return back(`google=error&reason=${reason}`);
  }
  syncSoon(user, { full: true });
  return back('google=connected');
}
