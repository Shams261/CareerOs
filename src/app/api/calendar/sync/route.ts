import { db } from '@/server/db';
import { defaultDeps, syncCalendar } from '@/features/calendar/service';
export const runtime = 'nodejs';

/** Scheduler entry point (Bearer CRON_SECRET, see proxy). Safe to run concurrently or twice. */
export async function POST() {
  const deps = defaultDeps();
  if (!deps) return Response.json({ skipped: 'not_configured' });
  const connections = await db().calendarConnection.findMany({
    where: { status: { in: ['CONNECTED', 'ERROR'] } },
    include: { user: { select: { id: true, timezone: true } } },
  });
  const results = { synced: 0, failed: 0, busy: 0 };
  for (const c of connections) {
    const r = await syncCalendar(c.user, deps);
    if (r.ok) results.synced++;
    else if (r.code === 'busy') results.busy++;
    else results.failed++;
  }
  return Response.json(results);
}
