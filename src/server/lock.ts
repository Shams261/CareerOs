import 'server-only';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

/** The owner as every service sees it: the id and the IANA zone that sets local days. */
export type ScheduleUser = { id: string; timezone: string };
export type Tx = Prisma.TransactionClient;

/**
 * One transaction holding a row lock on the owner's `User` row (`FOR UPDATE`), so multi-row
 * writes for one owner never interleave (ADR-004). Remote calls never run inside it.
 */
export async function locked<T>(
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      return work(tx);
    },
    { timeout: 20000 },
  );
}
