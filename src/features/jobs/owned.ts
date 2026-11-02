import 'server-only';
import type { Prisma } from '@/generated/prisma/client';

/** Owner checks and request replay shared by every jobs write (WI-132, split from service.ts). */
export type Tx = Prisma.TransactionClient;

export const DUPLICATE_TOKEN = 'confirm-duplicate';

export async function ownedApplication(tx: Tx, userId: string, id: string) {
  const app = await tx.jobApplication.findFirst({ where: { id, userId } });
  if (!app) throw new Error('Application not found in your workspace.');
  return app;
}

export async function ownedRound(tx: Tx, userId: string, id: string) {
  const round = await tx.interviewRound.findFirst({
    where: { id, userId, application: { userId } },
    include: { application: true },
  });
  if (!round) throw new Error('Interview not found in your workspace.');
  return round;
}

/**
 * Replays an already-applied submission. A requestId reused for another application is rejected
 * instead of silently writing a second event.
 */
export async function replayed(
  tx: Tx,
  userId: string,
  requestId: string,
  applicationId?: string,
) {
  const prior = await tx.jobActivity.findUnique({
    where: { userId_requestId: { userId, requestId } },
  });
  if (prior && applicationId && prior.applicationId !== applicationId)
    throw new Error(
      'This submission was already saved. Reload before trying again.',
    );
  return prior;
}
