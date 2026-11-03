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
  const r = { synced: 0, failed: 0, busy: 0 };
  try {
    await recordRun('calendar-sync', async () => {
      for (const c of connections) {
        const out = await syncCalendar(c.user, deps);
        if (out.ok) r.synced++;
        else if (out.code === 'busy') r.busy++;
        else r.failed++;
      }
      // WI-145: a run where every connection failed is a failed run, so a broken connection
      // turns the job stale on /api/health instead of reading as fresh forever.
      if (r.failed && !r.synced && !r.busy) throw new SyncFailed();
      return r;
    });
  } catch (error) {
    if (!(error instanceof SyncFailed)) throw error;
  }
  // Still 200: the scheduler retries on its own clock, and the run is recorded either way.
  return Response.json(r);
}

class SyncFailed extends Error {
  name = 'SyncFailed';
}
