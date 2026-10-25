import { z } from 'zod';
import { owner } from '@/server/db';
import { markNotificationOpened } from '@/features/notifications/service';
export const runtime = 'nodejs';

const input = z.object({ id: z.string().min(1).max(64) });

/**
 * Called by the service worker when a notification is clicked (R3). Behind the session like
 * every private API; the owner comes from the cookie, never from the body.
 */
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: 'invalid' }, { status: 400 });
  const user = await owner();
  await markNotificationOpened(user.id, parsed.data.id);
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
