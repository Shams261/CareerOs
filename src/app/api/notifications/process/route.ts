import { processNotifications } from '@/features/notifications/service';
import { deliverPending } from '@/features/push/service';
import { recordRun } from '@/server/jobs';
import { dailyProviderCheck } from '@/features/ai/service';
import { pruneMemories } from '@/features/agent/memory-service';
import { dailyRetention } from '@/features/notifications/retention';
import { writeRumiLines } from '@/features/agent/lines';
import { learnNudgeTimes } from '@/features/nudges/learn-service';
export const runtime = 'nodejs';

const DAILY: [string, () => Promise<unknown>][] = [
  // Grill Me's provider check (ADR-022), at most once a day.
  ['study', () => dailyProviderCheck()],
  // Lines past their day go (WI-100).
  ['agent', () => pruneMemories()],
  // Once a week per owner, the line times follow when study starts (WI-109).
  ['nudges', () => learnNudgeTimes()],
  // System records past their retention go (WI-134).
  ['retention', () => dailyRetention()],
];

/** Scheduler entry point (Bearer CRON_SECRET via proxy): eligibility → NotificationLog → push. */
export async function POST() {
  try {
    const result = await recordRun(
      'notifications',
      async () => {
        const { candidates } = await processNotifications();
        // Rumi's line on one queued row (WI-101): outside every owner lock, before push.
        const lines = await writeRumiLines();
        // Push is a delivery channel only; its failures never remove inbox records.
        const push = await deliverPending();
        console.info(
          `[notifications] processed ${JSON.stringify({ candidates, ...push })}`,
        );
        return { candidates, ...push, lines: lines.written };
      },
      { clearsSnapshots: false },
    );
    // The daily work rides on this request and never affects reminders. Each runs on its own
    // (WI-145), so one that throws no longer stops the ones after it.
    for (const [name, work] of DAILY) {
      try {
        await work();
      } catch (error) {
        console.error(
          `[${name}] daily run failed`,
          error instanceof Error ? error.name : 'Error',
        );
      }
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
