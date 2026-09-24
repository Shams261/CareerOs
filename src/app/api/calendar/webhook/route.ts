import { after } from 'next/server';
import { db } from '@/server/db';
import {
  defaultDeps,
  syncCalendar,
  verifyWebhook,
} from '@/features/calendar/service';
export const runtime = 'nodejs';

/**
 * Google push notifications (public; validated by channel ID, resource ID and token hash).
 * The notification is only a signal: the sync itself runs after the response, reading changes
 * with the stored sync token. Responses carry no user data.
 */
export async function POST(request: Request) {
  const h = request.headers;
  const result = await verifyWebhook({
    channelId: h.get('x-goog-channel-id'),
    resourceId: h.get('x-goog-resource-id'),
    token: h.get('x-goog-channel-token'),
    state: h.get('x-goog-resource-state'),
  });
  const userId = 'userId' in result ? result.userId : undefined;
  if (userId) {
    const deps = defaultDeps();
    after(async () => {
      const user = await db().user.findUnique({
        where: { id: userId },
        select: { id: true, timezone: true },
      });
      if (deps && user) await syncCalendar(user, deps).catch(() => {});
    });
  }
  return new Response(null, { status: result.status });
}
