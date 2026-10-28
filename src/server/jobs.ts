import 'server-only';
import { forgetAll } from './memo';
import { db } from './db';
import type { Prisma } from '@/generated/prisma/client';

/** Records start/success/failure of a scheduled job; the summary holds counts only. */
export async function recordRun<T extends Prisma.InputJsonValue>(
  name: string,
  work: () => Promise<T>,
  /**
   * Whether the run may change what the snapshots hold (WI-061). The reminder job writes only
   * inbox rows, which no snapshot reads, so it keeps them warm between its one-minute runs.
   */
  { clearsSnapshots = true }: { clearsSnapshots?: boolean } = {},
) {
  const started = new Date();
  await db().jobRun.upsert({
    where: { name },
    create: { name, lastStartedAt: started },
    update: { lastStartedAt: started },
  });
  try {
    const summary = await work();
    // A scheduler run may have written blocks or sync state.
    if (clearsSnapshots) forgetAll();
    await db().jobRun.update({
      where: { name },
      data: {
        lastSucceededAt: new Date(),
        lastError: null,
        lastSummary: summary,
      },
    });
    return summary;
  } catch (error) {
    await db().jobRun.update({
      where: { name },
      data: {
        lastFailedAt: new Date(),
        lastError: error instanceof Error ? error.name : 'Error',
      },
    });
    throw error;
  }
}
