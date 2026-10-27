import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { setupState } from '../src/features/setup/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Make Silsila yours from the records (WI-050)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `setup-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `setup-${randomUUID()}`, timezone: 'America/Toronto' };
  const done = async (u = user) =>
    (await setupState(u)).filter((s) => s.done).map((s) => s.key);

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Setup test',
          timezone: u.timezone,
        },
      });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });

  it('ticks each step from the owner’s own rows only', async () => {
    expect(await done()).toEqual([]);
    // Not yet: a goal without a date, a disabled routine, a test application, a revoked device.
    await prisma.goal.create({
      data: { userId: user.id, title: 'Offer', category: 'Career' },
    });
    await prisma.routineBlock.create({
      data: {
        userId: user.id,
        title: 'DSA',
        category: 'DSA',
        weekdays: [1],
        startLocal: '07:00',
        endLocal: '08:00',
        enabled: false,
      },
    });
    await prisma.jobApplication.create({
      data: { userId: user.id, company: 'TEST Co', role: 'Engineer' },
    });
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example/${randomUUID()}`,
        p256dh: 'k',
        auth: 'a',
        revokedAt: new Date(),
      },
    });
    expect(await done()).toEqual([]);
    // Then the real ones, and another owner's rows count for nothing here.
    await prisma.goal.updateMany({
      where: { userId: user.id },
      data: { targetDate: new Date('2026-12-15') },
    });
    await prisma.routineBlock.updateMany({
      where: { userId: user.id },
      data: { enabled: true },
    });
    await prisma.studyNudgeSetting.create({ data: { userId: user.id } });
    await prisma.calendarConnection.create({
      data: { userId: user.id, status: 'CONNECTED' },
    });
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: `https://push.example/${randomUUID()}`,
        p256dh: 'k',
        auth: 'a',
      },
    });
    await prisma.jobApplication.create({
      data: { userId: user.id, company: 'Northwind', role: 'Engineer' },
    });
    expect(await done()).toEqual([
      'goal',
      'routines',
      'kinds',
      'calendar',
      'push',
      'jobs',
    ]);
    expect(await done(other)).toEqual([]);
  });
});
