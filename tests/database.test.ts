import { afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { generatePlan } from '../src/features/schedule/service';
import { processNotifications } from '../src/features/notifications/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL persistence and idempotency', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  client.value = prisma;
  const userId = `test-${randomUUID()}`;
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
  it('generates routines once and preserves completed work', async () => {
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
        name: 'Integration test',
        timezone: 'America/Toronto',
      },
    });
    await prisma.routineBlock.create({
      data: {
        userId,
        weekdays: [3],
        startLocal: '07:30',
        endLocal: '09:00',
        category: 'Custom category',
        title: 'Practice',
      },
    });
    const plan = await generatePlan(user, '2026-09-23');
    const block = await prisma.timeBlock.findFirstOrThrow({
      where: { dailyPlanId: plan.id },
    });
    await prisma.timeBlock.update({
      where: { id: block.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await generatePlan(user, '2026-09-23');
    expect(
      await prisma.timeBlock.count({ where: { dailyPlanId: plan.id } }),
    ).toBe(1);
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: block.id } }))
        .status,
    ).toBe('COMPLETED');
  });
  it('prevents duplicate reminders under overlapping scheduler runs', async () => {
    await prisma.notificationPreference.create({
      data: {
        userId,
        type: 'DAILY_PROGRESS',
        preferredTime: '21:30',
        timezone: 'America/Toronto',
      },
    });
    const now = new Date('2026-09-24T02:00:00Z');
    await Promise.all([processNotifications(now), processNotifications(now)]);
    expect(await prisma.notificationLog.count({ where: { userId } })).toBe(1);
    await prisma.dailyPlan.update({
      where: { userId_date: { userId, date: new Date('2026-09-23') } },
      data: { reviewedAt: now },
    });
    await processNotifications(now);
    expect(await prisma.notificationLog.count({ where: { userId } })).toBe(1);
  });
  it('rejects invalid intervals at the database boundary', async () => {
    await expect(
      prisma.actualSession.create({
        data: {
          userId,
          category: 'DSA',
          startedAt: new Date('2026-01-02'),
          endedAt: new Date('2026-01-01'),
        },
      }),
    ).rejects.toThrow();
  });
});
