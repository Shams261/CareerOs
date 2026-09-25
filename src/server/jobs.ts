import 'server-only';
import { db } from './db';
import type { Prisma } from '@/generated/prisma/client';

/** Records start/success/failure of a scheduled job; the summary holds counts only. */
export async function recordRun<T extends Prisma.InputJsonValue>(
  name: string,
  work: () => Promise<T>,
) {
  const started = new Date();
  await db().jobRun.upsert({
    where: { name },
    create: { name, lastStartedAt: started },
    update: { lastStartedAt: started },
  });
  try {
    const summary = await work();
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
