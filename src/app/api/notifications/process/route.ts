import { processNotifications } from '@/features/notifications/service';
import { deliverPending } from '@/features/push/service';
import { recordRun } from '@/server/jobs';
export const runtime = 'nodejs';

/** Scheduler entry point (Bearer CRON_SECRET via proxy): eligibility → NotificationLog → push. */
export async function POST() {
  try {
    return Response.json(
      await recordRun('notifications', async () => {
        const { candidates } = await processNotifications();
        // Push is a delivery channel only; its failures never remove inbox records.
        const push = await deliverPending();
        console.info(
          `[notifications] processed ${JSON.stringify({ candidates, ...push })}`,
        );
        return { candidates, ...push };
      }),
    );
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
