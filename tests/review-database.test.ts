import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addPriority,
  carryForward,
  movePriority,
  nextWeekContext,
  prepareNextWeek,
  removePriority,
  reviewHistory,
  saveReview,
  saveWeeklyReminder,
  setPriorityDone,
  weekReview,
} from '../src/features/review/service';
import { processNotifications } from '../src/features/notifications/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const at = (day: string, time: string) => localInstant(day, time, zone);
const WEEK = '2026-09-21';
const NOW = at('2026-09-26', '12:00');

describe.skipIf(!url)('weekly review loop (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `wk-${randomUUID()}`, timezone: zone },
    other = { id: `wk-${randomUUID()}`, timezone: zone };
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [user, other].map((u) => ({
        ...u,
        name: 'W',
        email: `${u.id}@example.com`,
      })),
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  const block = async (
    day: string,
    start: string,
    end: string,
    category: string,
    status = 'PLANNED',
    userId = user.id,
  ) => {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId, date: new Date(day) } },
      create: { userId, date: new Date(day) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: category,
        category,
        status: status as 'PLANNED',
        plannedStart: at(day, start),
        plannedEnd: at(day, end),
        ...(status === 'COMPLETED' ? { completedAt: at(day, end) } : {}),
      },
    });
  };

  it('keeps one written review per owner-week; completion stays editable', async () => {
    const [a, b] = await Promise.all([
      saveReview(user, { weekStart: WEEK, biggestWin: 'Shipped WI-006' }, NOW),
      saveReview(
        user,
        { weekStart: WEEK, biggestBlocker: 'Late evenings' },
        NOW,
      ),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.weeklyReview.count({ where: { userId: user.id } }),
    ).toBe(1);
    const done = await saveReview(
      user,
      { weekStart: WEEK, biggestWin: 'Shipped WI-006', intent: 'complete' },
      NOW,
    );
    expect(done.completedAt).toEqual(NOW);
    const edited = await saveReview(
      user,
      {
        weekStart: WEEK,
        biggestWin: 'Shipped WI-006 and WI-007',
        intent: 'complete',
      },
      new Date(+NOW + 3600000),
    );
    expect(edited).toMatchObject({
      biggestWin: 'Shipped WI-006 and WI-007',
      completedAt: NOW,
    });
    await expect(
      saveReview(user, { weekStart: '2026-09-22' }, NOW),
    ).rejects.toThrow();
    await expect(
      prisma.weeklyReview.create({
        data: { userId: user.id, weekStart: new Date('2026-09-23') },
      }),
    ).rejects.toThrow();
    await saveReview(other, { weekStart: WEEK, biggestWin: 'Other' }, NOW);
    expect(
      (
        await prisma.weeklyReview.findFirstOrThrow({
          where: { userId: user.id },
        })
      ).biggestWin,
    ).toBe('Shipped WI-006 and WI-007');
    expect(
      (await reviewHistory(user.id)).map((h) =>
        h.weekStart.toISOString().slice(0, 10),
      ),
    ).toEqual([WEEK]);
  });

  it('limits priorities to five with a dense, owner-scoped order', async () => {
    const week = '2026-09-28';
    const titles = [
      'Sliding Window',
      'Generics',
      'Applications',
      'SD mock',
      'Gym',
    ];
    for (const t of titles)
      await addPriority(user, {
        weekStart: week,
        title: t,
        target: t === 'Gym' ? 4 : '',
        targetUnit: t === 'Gym' ? 'sessions' : '',
      });
    await expect(
      addPriority(user, { weekStart: week, title: 'Sixth' }),
    ).rejects.toThrow('5 priorities');
    await expect(
      addPriority(user, { weekStart: week, title: 'x', goalId: 'not-mine' }),
    ).rejects.toThrow();
    const list = () =>
      prisma.weeklyPriority.findMany({
        where: { review: { userId: user.id, weekStart: new Date(week) } },
        orderBy: { ordering: 'asc' },
      });
    const items = await list();
    expect(items.find((p) => p.title === 'Gym')).toMatchObject({
      target: 4,
      targetUnit: 'sessions',
    });
    await movePriority(user, items[2].id, 'up');
    await movePriority(user, items[0].id, 'up'); // already first: no-op
    expect((await list()).map((p) => p.title)).toEqual([
      'Sliding Window',
      'Applications',
      'Generics',
      'SD mock',
      'Gym',
    ]);
    await removePriority(user, items[1].id);
    expect((await list()).map((p) => p.ordering)).toEqual([0, 1, 2, 3]);
    await setPriorityDone(user, items[0].id, true, NOW);
    await setPriorityDone(user, items[0].id, true, new Date(+NOW + 1000));
    expect((await list())[0].completedAt).toEqual(NOW);
    await expect(setPriorityDone(other, items[0].id, false)).rejects.toThrow(
      'not found',
    );
    await expect(removePriority(other, items[0].id)).rejects.toThrow(
      'not found',
    );
    // Next week's review shows these as that week's commitments.
    expect((await weekReview(user, week, NOW)).commitments).toHaveLength(0);
    expect(
      (await weekReview(user, '2026-10-05', NOW)).commitments.map(
        (p) => p.title,
      ),
    ).toEqual(['Sliding Window', 'Applications', 'SD mock', 'Gym']);
  });

  it('derives the week live from source data across modules', async () => {
    await block('2026-09-21', '07:30', '09:00', 'DSA', 'COMPLETED');
    await block('2026-09-21', '19:30', '20:30', 'GYM', 'COMPLETED');
    await block('2026-09-22', '19:30', '20:30', 'GYM', 'SKIPPED');
    await block('2026-09-23', '21:00', '22:00', 'TECHNICAL');
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: at('2026-09-21', '07:30'),
        endedAt: at('2026-09-21', '09:00'),
      },
    });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'WI-007 Arrays' },
      create: { name: 'WI-007 Arrays' },
      update: {},
    });
    const problem = await prisma.dsaProblem.create({
      data: {
        userId: user.id,
        title: 'Two Sum',
        platform: 'LC',
        problemUrl: 'https://example.com',
        difficulty: 'EASY',
        topicId: topic.id,
        confidence: 'YELLOW',
        attemptsCount: 2,
        nextRevisionAt: new Date('2026-09-20'),
      },
    });
    for (const [before, after, day] of [
      [null, 'RED', '2026-09-21'],
      ['RED', 'YELLOW', '2026-09-23'],
    ] as const)
      await prisma.dsaAttempt.create({
        data: {
          userId: user.id,
          problemId: problem.id,
          requestId: randomUUID(),
          attemptedAt: at(day, '08:00'),
          confidenceBefore: before,
          confidenceAfter: after,
          solvedIndependently: 'PARTIAL',
        },
      });
    const app = await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Acme',
        role: 'Eng',
        stage: 'TECHNICAL',
        appliedAt: new Date('2026-09-22'),
        actionOwner: 'COMPANY',
        nextActionDate: new Date('2026-09-20'),
      },
    });
    await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'Coding',
        type: 'CODING',
        scheduledStart: at('2026-09-24', '14:00'),
        timezone: zone,
        status: 'COMPLETED',
        completedAt: at('2026-09-24', '15:00'),
        toImprove: 'Implementation under time pressure',
      },
    });
    const w = await weekReview(user, WEEK, NOW);
    expect(w.schedule.totals).toMatchObject({
      planned: 4,
      completed: 2,
      skipped: 1,
      unrecorded: 1,
    });
    expect(w.schedule.focus).toEqual({ planned: 150, actual: 90 });
    expect(w.schedule.routines.find((r) => r.label === 'Gym')).toMatchObject({
      planned: 2,
      completed: 1,
    });
    expect(w.dsa).toMatchObject({
      attempts: 2,
      newProblems: 1,
      redToYellow: 1,
      overdue: 1,
    });
    expect(w.jobs).toMatchObject({
      submitted: 1,
      technical: 1,
      completed: 1,
      waiting: 1,
    });
    expect(w.reflections).toEqual([
      expect.objectContaining({
        company: 'Acme',
        toImprove: 'Implementation under time pressure',
      }),
    ]);
    const carry = await carryForward(user, NOW);
    expect(carry.dsa.map((p) => p.title)).toEqual(['Two Sum']);
    expect(carry.jobs.map((a) => a.company)).toEqual(['Acme']);
    // LIVE metrics: a session logged later changes the past week's facts.
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'TECHNICAL',
        startedAt: at('2026-09-23', '21:00'),
        endedAt: at('2026-09-23', '21:45'),
      },
    });
    expect((await weekReview(user, WEEK, NOW)).schedule.focus.actual).toBe(135);
  });

  it('prepares next week once from routines, without touching Google', async () => {
    await prisma.routineBlock.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        title: 'DSA',
        category: 'DSA',
        weekdays: [1, 2, 3, 4, 5],
        startLocal: '07:30',
        endLocal: '09:00',
      },
    });
    await prisma.calendarConnection.create({
      data: {
        userId: user.id,
        status: 'CONNECTED',
        calendarId: 'cal',
        syncToken: 'tok-1',
      },
    });
    const next = '2026-10-12';
    const before = await nextWeekContext(user, next, NOW);
    expect(before.generatedDays).toBe(0);
    expect(before.days[0].items.map((i) => i.title)).toContain('DSA');
    expect(
      await prisma.dailyPlan.count({
        where: { userId: user.id, date: { gte: new Date(next) } },
      }),
    ).toBe(0);
    const first = await prepareNextWeek(user, next);
    expect(first).toEqual({ generated: 7, blocks: 5 });
    const again = await prepareNextWeek(user, next);
    expect(again).toEqual({ generated: 0, blocks: 5 });
    const blocks = await prisma.timeBlock.findMany({
      where: { dailyPlan: { userId: user.id, date: { gte: new Date(next) } } },
    });
    expect(
      blocks.every(
        (b) =>
          b.calendarSyncStatus === 'NOT_SYNCED' && !b.externalCalendarEventId,
      ),
    ).toBe(true);
    expect(
      await prisma.calendarConnection.findUniqueOrThrow({
        where: { userId: user.id },
      }),
    ).toMatchObject({ syncToken: 'tok-1', lastSyncAttemptAt: null });
    expect((await nextWeekContext(user, next, NOW)).generatedDays).toBe(7);
    await expect(prepareNextWeek(user, '2026-10-13')).rejects.toThrow('Monday');
  });

  it('shows next-week interviews with prep and follow-ups as context only', async () => {
    const app = await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Amazon',
        role: 'SDE',
        stage: 'TECHNICAL',
        nextAction: 'Follow up',
        nextActionDate: new Date('2026-10-01'),
        actionOwner: 'ME',
      },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'System Design',
        type: 'SYSTEM_DESIGN',
        scheduledStart: at('2026-09-29', '14:00'),
        timezone: zone,
      },
    });
    await prisma.interviewPrepItem.createMany({
      data: [
        {
          userId: user.id,
          roundId: round.id,
          title: 'Caching',
          completed: true,
        },
        { userId: user.id, roundId: round.id, title: 'Rate limiting' },
      ],
    });
    const ctx = await nextWeekContext(user, '2026-09-28', NOW);
    expect(ctx.jobs.interviews).toEqual([
      expect.objectContaining({
        company: 'Amazon',
        title: 'System Design',
        prepDone: 1,
        prepTotal: 2,
      }),
    ]);
    expect(ctx.jobs.followUps.map((a) => a.company)).toEqual(['Amazon']);
    expect(
      await prisma.timeBlock.count({ where: { interviewRoundId: round.id } }),
    ).toBe(0);
  });

  it('sends one weekly reminder on Sunday and none once the review is complete', async () => {
    const u = { id: `wk-${randomUUID()}`, timezone: zone };
    await prisma.user.create({
      data: { ...u, name: 'R', email: `${u.id}@example.com` },
    });
    try {
      await saveWeeklyReminder(u, { enabled: true, preferredTime: '18:00' });
      const count = () =>
        prisma.notificationLog.count({
          where: { userId: u.id, type: 'WEEKLY_REVIEW' },
        });
      await processNotifications(at('2026-09-26', '19:00')); // Saturday
      await processNotifications(at('2026-09-27', '17:00')); // Sunday, before time
      expect(await count()).toBe(0);
      await Promise.all([
        processNotifications(at('2026-09-27', '19:00')),
        processNotifications(at('2026-09-27', '19:00')),
      ]);
      await processNotifications(at('2026-09-27', '21:00'));
      expect(await count()).toBe(1);
      expect(
        (
          await prisma.notificationLog.findFirstOrThrow({
            where: { userId: u.id },
          })
        ).title,
      ).toBe('Your weekly CareerOS review is ready.');
      await saveReview(
        u,
        { weekStart: '2026-09-28', intent: 'complete' },
        at('2026-10-04', '10:00'),
      );
      await processNotifications(at('2026-10-04', '19:00'));
      expect(await count()).toBe(1);
      await saveWeeklyReminder(u, { enabled: false, preferredTime: '18:00' });
      await processNotifications(at('2026-10-11', '19:00'));
      expect(await count()).toBe(1);
    } finally {
      await prisma.user.delete({ where: { id: u.id } });
    }
  });
});
