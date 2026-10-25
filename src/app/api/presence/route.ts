import { owner } from '@/server/db';
import { markPresent } from '@/features/nudges/service';
export const runtime = 'nodejs';

/**
 * The presence beat (WI-028): a visible Silsila page calls this every two minutes so a study
 * nudge raised meanwhile shows in the app instead of on the lock screen. Behind the session.
 */
export async function POST() {
  const user = await owner();
  await markPresent(user.id);
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
