import 'server-only';
import { after } from 'next/server';
import type { ScheduleUser } from '@/features/schedule/service';
import { defaultDeps, getConnection, syncCalendar } from './service';

/**
 * Best-effort sync after the response is sent. The local change is already committed; if Google
 * is unreachable the block simply stays pending for the next run (cron or Sync now).
 */
export function syncSoon(user: ScheduleUser, opts: { full?: boolean } = {}) {
  after(async () => {
    try {
      const deps = defaultDeps();
      const conn = deps && (await getConnection(user.id));
      if (deps && conn?.status === 'CONNECTED')
        await syncCalendar(user, deps, opts);
    } catch (error) {
      console.error(
        '[calendar] background sync failed',
        error instanceof Error ? error.name : 'unknown',
      );
    }
  });
}
