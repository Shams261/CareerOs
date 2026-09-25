import { db } from '@/server/db';
import { defaultDeps, syncCalendar } from '@/features/calendar/service';
import { recordRun } from '@/server/jobs';
export const runtime = 'nodejs';

/** Scheduler entry point (Bearer CRON_SECRET, see proxy). Safe to run concurrently or twice. */
export async function POST() {
  const deps = defaultDeps();
  if (!deps) return Response.json({ skipped: 'not_configured' });
  const connections = await db().calendarConnection.findMany({
    where: { status: { in: ['CONNECTED', 'ERROR'] } },
    include: { user: { select: { id: true, timezone: true } } },
  });
  const results = await recordRun('calendar-sync', async () => {
    const r = { synced: 0, failed: 0, busy: 0 };
    for (const c of connections) {
      const out = await syncCalendar(c.user, deps);
      if (out.ok) r.synced++;
      else if (out.code === 'busy') r.busy++;
      else r.failed++;
    }
    return r;
  });
  return Response.json(results);
}
