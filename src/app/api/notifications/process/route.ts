import { processNotifications } from '@/features/notifications/service';
import { deliverPending } from '@/features/push/service';
import { recordRun } from '@/server/jobs';
import { dailyProviderCheck } from '@/features/ai/service';
export const runtime = 'nodejs';

/** Scheduler entry point (Bearer CRON_SECRET via proxy): eligibility → NotificationLog → push. */
export async function POST() {
  try {
    const result = await recordRun('notifications', async () => {
      const { candidates } = await processNotifications();
      // Push is a delivery channel only; its failures never remove inbox records.
      const push = await deliverPending();
      console.info(
        `[notifications] processed ${JSON.stringify({ candidates, ...push })}`,
      );
      return { candidates, ...push };
    });
    // Grill Me's provider check (ADR-022) runs at most once a day and never affects reminders.
    try {
      await dailyProviderCheck();
    } catch (error) {
      console.error(
        '[study] provider check failed',
        error instanceof Error ? error.name : 'Error',
      );
    }
    return Response.json(result);
  } catch (error) {
    console.error(
      'Notification processing failed',
      error instanceof Error ? error.name : 'Unknown error',
    );
    return Response.json(
      { error: 'Notification processing failed; retry safely.' },
      { status: 500 },
    );
  }
}
