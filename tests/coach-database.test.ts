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
  closeNudges,
  saveNudgeSetting,
  todaysNudge,
} from '../src/features/nudges/service';
import { pushPayload } from '../src/features/push/domain';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday; fictional plan
const at = (time: string, d = day) => localInstant(d, time, zone);
const off = {
  morningEnabled: false,
  morningTime: '08:00',
  eveningEnabled: false,
  eveningTime: '19:30',
  days: 127,
  onlyStudyDays: true,
  quietStart: '22:00',
  quietEnd: '07:30',
  studyCategories: ['DSA', 'Technical'],
};

describe.skipIf(!url)('coach notifications (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `coach-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Coach', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  async function block(
    title: string,
    from: string,
    to: string,
    d = day,
    category = 'DSA',
  ) {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(d) } },
      create: { userId: user.id, date: new Date(d) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category,
        plannedStart: at(from, d),
        plannedEnd: at(to, d),
      },
    });
  }
  const rows = (type: 'STUDY_MORNING' | 'STUDY_EVENING' | 'STUDY_BLOCK') =>
    prisma.notificationLog.findMany({
      where: { userId: user.id, type },
      orderBy: { createdAt: 'asc' },
    });

  it('nudges once when a study block has started with nothing begun', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    await block('Gym', '17:50', '19:00', day, 'GYM');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await processNotifications(at('18:10'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(0);
    await processNotifications(at('18:16'));
    await processNotifications(at('18:30'));
    const sent = await rows('STUDY_BLOCK');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      title: 'Block started',
      body: '18:00–19:30 Two pointers practice started 16 minutes ago and no session has begun yet. 74 minutes of it are left.',
      metadata: { blockId: dsa.id },
    });
    // The lock screen only ever gets the general line.
    expect(JSON.parse(pushPayload(sent[0])).body).toBe(
      'A study block has started. Open Silsila to begin or move it.',
    );
    expect(pushPayload(sent[0])).not.toContain('Two pointers');
    expect(JSON.parse(pushPayload(sent[0])).url).toBe('/today#study-nudge');
    // One a day: a later study block that also starts unbegun is left alone.
    await block('Graphs', '20:00', '21:00');
    await processNotifications(at('20:20'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(1);
    // Today shows it as the block card; closing the day's nudges answers it.
    expect(await todaysNudge(user, day)).toMatchObject({
      kind: 'block',
      blockId: dsa.id,
    });
    await closeNudges(prisma, user.id, day);
    expect(await todaysNudge(user, day)).toBeNull();
  });

  it('stays silent once a session is running or recorded for the block', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: dsa.id,
        category: 'DSA',
        startedAt: at('18:05'),
      },
    });
    await processNotifications(at('18:20'));
    expect(await rows('STUDY_BLOCK')).toHaveLength(0);
  });

  it('speaks for study blocks instead of the older upcoming and overdue reminders', async () => {
    const dsa = await block('Two pointers practice', '18:00', '19:30');
    const gym = await block('Gym', '18:00', '19:00', day, 'GYM');
    await saveNudgeSetting(user, { ...off, blockStartEnabled: true });
    await prisma.notificationPreference.createMany({
      data: [
        {
          userId: user.id,
          type: 'UPCOMING_BLOCK',
          offsetMinutes: 10,
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
    await processNotifications(at('17:55'));
    await processNotifications(at('19:20'));
    const all = await prisma.notificationLog.findMany({
      where: { userId: user.id },
    });
    expect(
      all.filter((r) => r.dedupeKey.includes(dsa.id)).map((r) => r.type),
    ).toEqual(['STUDY_BLOCK']);
    // Other blocks keep their reminders.
    expect(
      all
        .filter((r) => r.dedupeKey.includes(gym.id))
        .map((r) => r.type)
        .sort(),
    ).toEqual(['OVERDUE_TASK', 'UPCOMING_BLOCK']);
  });

  it('fills the morning plan and the evening check-in with the day’s facts', async () => {
    await block('Coding', '18:00', '21:00', '2026-10-26');
    await block('Two pointers practice', '18:00', '19:00');
    await block('DSA warm-up', '07:30', '08:15', '2026-10-28');
    await saveNudgeSetting(user, {
      ...off,
      morningEnabled: true,
      eveningEnabled: true,
    });
    await processNotifications(at('08:05'));
    const [morning] = await rows('STUDY_MORNING');
    expect(morning.body).toMatch(
      /^Today: 18:00–19:00 Two pointers practice\. Yesterday 18:00–21:00 Coding had no session recorded\. /,
    );
    await processNotifications(at('19:45'));
    const [evening] = await rows('STUDY_EVENING');
    expect(evening.body).toMatch(
      /Left today: 18:00–19:00 Two pointers practice\. Tomorrow starts with 07:30–08:15 DSA warm-up\.$/,
    );
    expect(pushPayload(evening)).not.toContain('Two pointers');
  });
});
