import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  pruneRecords,
  RETENTION_DAYS,
} from '../src/features/notifications/retention';

const url = process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;
describe.skipIf(!url)('retention of system records (WI-134)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const userId = `retention-${randomUUID()}`;
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('removes only old system rows and keeps the owner-facing ones', async () => {
    const now = new Date('2026-11-02T15:00:00Z');
    const ago = (days: number) => new Date(+now - days * DAY);
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
        name: 'Retention',
        timezone: 'America/Toronto',
      },
    });
    const session = (id: string, expiresAt: Date, revokedAt: Date | null) =>
      prisma.session.create({
        data: {
          id,
          userId,
          tokenHash: randomUUID(),
          createdAt: ago(60),
          expiresAt,
          lastSeenAt: ago(40),
          revokedAt,
        },
      });
    await session('s-expired', ago(RETENTION_DAYS.sessions + 1), null);
    await session('s-revoked', ago(-10), ago(RETENTION_DAYS.sessions + 1));
    await session('s-recent', ago(5), null);
    await session('s-live', ago(-20), null);
    const reminder = (
      id: string,
      type: 'DAILY_PROGRESS' | 'JOB_FOLLOW_UP',
      due: Date,
      readAt: Date | null,
    ) =>
      prisma.notificationLog.create({
        data: {
          id,
          userId,
          type,
          title: 'Reminder',
          body: 'Reminder',
          scheduledFor: due,
          dedupeKey: `${userId}:${id}`,
          readAt,
        },
      });
    const old = ago(RETENTION_DAYS.reminders + 1);
    await reminder('n-old-read', 'DAILY_PROGRESS', old, old);
    await reminder('n-old-unread', 'DAILY_PROGRESS', old, null);
    await reminder('n-old-follow-up', 'JOB_FOLLOW_UP', old, old);
    await reminder('n-recent-read', 'DAILY_PROGRESS', ago(3), ago(2));
    const usage = (id: string, createdAt: Date) =>
      prisma.aiUsage.create({
        data: {
          id,
          userId,
          feature: 'GRILL_ITEM',
          model: 'm',
          provider: 'p',
          costMicros: 0,
          createdAt,
        },
      });
    await usage('u-old', ago(RETENTION_DAYS.aiUsage + 1));
    await usage('u-recent', ago(20));

    expect(await pruneRecords(now, userId)).toEqual({
      sessions: 2,
      reminders: 1,
      aiUsage: 1,
    });
    const ids = async (rows: Promise<{ id: string }[]>) =>
      (await rows).map((r) => r.id).sort();
    expect(
      await ids(
        prisma.session.findMany({ where: { userId }, select: { id: true } }),
      ),
    ).toEqual(['s-live', 's-recent']);
    expect(
      await ids(
        prisma.notificationLog.findMany({
          where: { userId },
          select: { id: true },
        }),
      ),
    ).toEqual(['n-old-follow-up', 'n-old-unread', 'n-recent-read']);
    expect(
      await ids(
        prisma.aiUsage.findMany({ where: { userId }, select: { id: true } }),
      ),
    ).toEqual(['u-recent']);
    // A second run finds nothing more.
    expect(await pruneRecords(now, userId)).toEqual({
      sessions: 0,
      reminders: 0,
      aiUsage: 0,
    });
  });
});
