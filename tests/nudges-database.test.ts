import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { processNotifications } from '../src/features/notifications/service';
import {
  deliverPending,
  saveSubscription,
  type PushSender,
} from '../src/features/push/service';
import {
  closeNudges,
  markPresent,
  nudgeFeedback,
  nudgeKey,
  pauseNudges,
  saveNudgeSetting,
  setRestDay,
  todaysNudge,
} from '../src/features/nudges/service';
import { restore } from '../src/features/undo/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday; fictional plan
const at = (time: string, d = day) => localInstant(d, time, zone);
const cfg = {
  publicKey: 'p'.repeat(87),
  privateKey: 'k'.repeat(43),
  subject: 'mailto:owner@example.com',
};
const settings = {
  morningEnabled: true,
  morningTime: '08:00',
  eveningEnabled: true,
  eveningTime: '19:30',
  days: 127,
  onlyStudyDays: true,
  quietStart: '22:00',
  quietEnd: '07:30',
  studyCategories: ['DSA', 'Technical'],
};

describe.skipIf(!url)('study nudges (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `nudges-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Nudges', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  async function studyBlock(title = 'Two pointers practice', category = 'DSA') {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      create: { userId: user.id, date: new Date(day) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category,
        plannedStart: at('18:00'),
        plannedEnd: at('19:00'),
      },
    });
  }
  const nudges = () =>
    prisma.notificationLog.findMany({
      where: {
        userId: user.id,
        type: { in: ['STUDY_MORNING', 'STUDY_EVENING'] },
      },
      orderBy: { createdAt: 'asc' },
    });

  it('stays silent until the owner turns it on', async () => {
    await studyBlock();
    await processNotifications(at('08:05'));
    await processNotifications(at('19:45'));
    expect(await nudges()).toHaveLength(0);
  });

  it('sends one morning line and one evening check-in, each once, with a general lock-screen line', async () => {
    const b = await studyBlock();
    await saveNudgeSetting(user, settings);
    await processNotifications(at('08:05'));
    await processNotifications(at('08:06'));
    await processNotifications(at('19:45'));
    await processNotifications(at('19:50'));
    const rows = await nudges();
    expect(rows.map((r) => r.type)).toEqual(['STUDY_MORNING', 'STUDY_EVENING']);
    expect(rows[1].metadata).toEqual({ blockId: b.id });
    expect(rows.every((r) => !r.inAppOnly)).toBe(true);
    await saveSubscription(user, {
      endpoint: `https://push.example.com/send/${randomUUID()}`,
      keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
    });
    const bodies: string[] = [];
    const sender: PushSender = async (_t, p) => (bodies.push(p), 201);
    await deliverPending(at('19:50'), sender, cfg);
    const mine = bodies.filter((p) => !p.includes('Two pointers'));
    expect(bodies.some((p) => p.includes('Two pointers'))).toBe(false);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    const card = await todaysNudge(user, day);
    expect(card).toMatchObject({ kind: 'evening', blockId: b.id });
  });

  it('stays in the app while Silsila is open, and the push job leaves it alone', async () => {
    await studyBlock();
    await saveNudgeSetting(user, settings);
    await markPresent(user.id, new Date(+at('08:05') - 60_000));
    await processNotifications(at('08:05'));
    const [row] = await nudges();
    expect(row.inAppOnly).toBe(true);
    await saveSubscription(user, {
      endpoint: `https://push.example.com/send/${randomUUID()}`,
      keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
    });
    await deliverPending(at('08:06'), async () => 201, cfg);
    expect(
      await prisma.notificationLog.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ sentAt: null, pushAttempts: 0 });
  });

  it('skips the evening after a session, on a rest day, after closing the day, and for test-named blocks', async () => {
    const b = await studyBlock();
    await saveNudgeSetting(user, { ...settings, morningEnabled: false });
    // A session on the block.
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: b.id,
        category: 'DSA',
        startedAt: at('18:05'),
        endedAt: at('18:40'),
      },
    });
    await processNotifications(at('19:45'));
    expect(await nudges()).toHaveLength(0);
    await prisma.actualSession.deleteMany({ where: { userId: user.id } });
    // A rest day.
    await setRestDay(user, day, true, at('19:00'));
    await processNotifications(at('19:46'));
    expect(await nudges()).toHaveLength(0);
    // Undo the rest day: an ordinary day again, and the check-in can come.
    await restore(user, 'clear-rest-day', { day });
    // The day closed.
    await prisma.dailyPlan.update({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      data: { reviewedAt: at('19:40') },
    });
    await processNotifications(at('19:47'));
    expect(await nudges()).toHaveLength(0);
    await prisma.dailyPlan.update({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      data: { reviewedAt: null },
    });
    // Only a test-named block: nothing to check in about.
    await prisma.timeBlock.update({
      where: { id: b.id },
      data: { title: 'TEST block' },
    });
    await processNotifications(at('19:48'));
    expect(await nudges()).toHaveLength(0);
    await prisma.timeBlock.update({
      where: { id: b.id },
      data: { title: 'Two pointers practice' },
    });
    await processNotifications(at('19:49'));
    expect((await nudges()).map((r) => r.type)).toEqual(['STUDY_EVENING']);
  });

  it('pauses, and keeps the daily reminder and overdue reminders from doubling up', async () => {
    const b = await studyBlock();
    await saveNudgeSetting(user, { ...settings, morningEnabled: false });
    await pauseNudges(user, '2026-11-01');
    await processNotifications(at('19:45'));
    expect(await nudges()).toHaveLength(0);
    await pauseNudges(user, null);
    await prisma.notificationPreference.createMany({
      data: [
        {
          userId: user.id,
          type: 'DAILY_PROGRESS',
          preferredTime: '19:00',
          timezone: zone,
        },
        {
          userId: user.id,
          type: 'OVERDUE_TASK',
          offsetMinutes: 15,
          timezone: zone,
        },
      ],
    });
    await processNotifications(at('19:45'));
    const all = await prisma.notificationLog.findMany({
      where: { userId: user.id },
    });
    expect(all.find((r) => r.type === 'STUDY_EVENING')).toBeTruthy();
    expect(all.find((r) => r.type === 'DAILY_PROGRESS')?.inAppOnly).toBe(true);
    // The study block has no separate overdue reminder while the check-in is on.
    expect(
      all.filter(
        (r) => r.type === 'OVERDUE_TASK' && r.dedupeKey.includes(b.id),
      ),
    ).toHaveLength(0);
  });

  it('records feedback once and closes the card; only the owner can answer', async () => {
    await studyBlock();
    await saveNudgeSetting(user, settings);
    await processNotifications(at('08:05'));
    const [row] = await nudges();
    const other = await prisma.user.create({
      data: {
        id: `other-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'Other',
      },
    });
    await expect(
      nudgeFeedback({ ...other, timezone: zone }, row.id, 'HELPFUL'),
    ).rejects.toThrow();
    await prisma.user.delete({ where: { id: other.id } });
    await nudgeFeedback(user, row.id, 'TOO_MANY', at('08:10'));
    expect(
      await prisma.notificationLog.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ feedback: 'TOO_MANY', readAt: at('08:10') });
    expect(await todaysNudge(user, day)).toBeNull();
    expect(row.dedupeKey).toBe(nudgeKey(user.id, 'STUDY_MORNING', day));
  });

  it('closes the check-in once its block is moved, without inventing feedback or sending it again', async () => {
    await studyBlock();
    await saveNudgeSetting(user, { ...settings, morningEnabled: false });
    await processNotifications(at('19:45'));
    expect(await todaysNudge(user, day)).toMatchObject({ kind: 'evening' });
    await closeNudges(prisma, user.id, day, at('19:50'));
    expect(await todaysNudge(user, day)).toBeNull();
    await processNotifications(at('19:55'));
    const rows = await nudges();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ readAt: at('19:50'), feedback: null });
  });

  it('writes presence at most every two minutes', async () => {
    const t = at('09:00');
    await markPresent(user.id, t);
    await markPresent(user.id, new Date(+t + 60_000));
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .lastActiveAt,
    ).toEqual(t);
    await markPresent(user.id, new Date(+t + 180_000));
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .lastActiveAt,
    ).toEqual(new Date(+t + 180_000));
  });
});
