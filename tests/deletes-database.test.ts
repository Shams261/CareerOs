import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  deleteApplication,
  deleteBlock,
  deleteGoal,
  deletePrepItem,
  deleteRoadmap,
  deleteSession,
  removeProblem,
} from '../src/features/deletes/service';
import { restore } from '../src/features/undo/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Deletes on every record (WI-060)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `del-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `del-${randomUUID()}`, timezone: 'America/Toronto' };
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Delete test',
          timezone: u.timezone,
        },
      });
  });
  afterAll(async () => {
    for (const u of [user, other])
      await prisma.user.delete({ where: { id: u.id } });
    await prisma.$disconnect();
  });

  const plan = async (userId: string, day: string) =>
    prisma.dailyPlan.upsert({
      where: { userId_date: { userId, date: new Date(day) } },
      create: { userId, date: new Date(day) },
      update: {},
    });

  it('deletes an application with its rounds and history, and cancels its interview block', async () => {
    const app = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'Northwind Labs', role: 'Engineer' },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'Coding',
        type: 'CODING',
        scheduledStart: at('2026-10-30T18:00:00Z'),
        scheduledEnd: at('2026-10-30T19:00:00Z'),
        timezone: 'America/Toronto',
      },
    });
    await prisma.interviewPrepItem.create({
      data: {
        userId: user.id,
        roundId: round.id,
        title: 'Two pointers',
        kind: 'PREP',
      },
    });
    const day = await plan(user.id, '2026-10-30');
    const block = await prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title: 'Northwind Labs — Coding',
        category: 'INTERVIEW',
        plannedStart: round.scheduledStart,
        plannedEnd: round.scheduledEnd!,
        interviewRoundId: round.id,
      },
    });
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'INTERVIEW',
        title: 'Interview tomorrow',
        body: 'x',
        scheduledFor: at('2026-10-29T18:00:00Z'),
        dedupeKey: `INTERVIEW:${round.id}:24h`,
      },
    });
    await expect(deleteApplication(other, app.id)).rejects.toThrow(
      /no longer exists/,
    );
    expect(await deleteApplication(user, app.id)).toBe('Northwind Labs');
    expect(await prisma.jobApplication.count({ where: { id: app.id } })).toBe(
      0,
    );
    expect(await prisma.interviewRound.count({ where: { id: round.id } })).toBe(
      0,
    );
    expect(
      await prisma.interviewPrepItem.count({ where: { roundId: round.id } }),
    ).toBe(0);
    expect(
      await prisma.notificationLog.count({ where: { userId: user.id } }),
    ).toBe(0);
    // The block stays only so the sync removes its Google event.
    expect(
      await prisma.timeBlock.findUniqueOrThrow({ where: { id: block.id } }),
    ).toMatchObject({ status: 'CANCELLED', skipReason: 'Deleted' });
  });

  it('deletes a block added for one day with Undo, and refuses a routine block', async () => {
    const day = await plan(user.id, '2026-10-31');
    const added = await prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title: 'Graphs: BFS',
        category: 'DSA',
        plannedStart: at('2026-10-31T13:00:00Z'),
        plannedEnd: at('2026-10-31T14:00:00Z'),
      },
    });
    const routine = await prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title: 'DSA practice',
        category: 'DSA',
        routineKey: `r-${randomUUID()}`,
        occurrenceDate: new Date('2026-10-31'),
        plannedStart: at('2026-10-31T11:00:00Z'),
        plannedEnd: at('2026-10-31T12:00:00Z'),
      },
    });
    // A block with recorded time keeps it until its sessions are deleted.
    const recorded = await prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title: 'Done already',
        category: 'DSA',
        status: 'COMPLETED',
        completedAt: at('2026-10-31T16:00:00Z'),
        plannedStart: at('2026-10-31T15:00:00Z'),
        plannedEnd: at('2026-10-31T16:00:00Z'),
        sessions: {
          create: {
            userId: user.id,
            category: 'DSA',
            startedAt: at('2026-10-31T15:00:00Z'),
            endedAt: at('2026-10-31T16:00:00Z'),
          },
        },
      },
    });
    await expect(deleteBlock(user, recorded.id)).rejects.toThrow(
      /recorded time/,
    );
    expect(await deleteBlock(user, added.id)).toBe('Graphs: BFS');
    await expect(deleteBlock(user, routine.id)).rejects.toThrow(/cancelled/);
    await restore(user, 'block-reset', { id: added.id });
    expect(
      await prisma.timeBlock.findUniqueOrThrow({ where: { id: added.id } }),
    ).toMatchObject({ status: 'PLANNED', skipReason: null });
  });

  it('deletes a prep item and a logged session, and Undo puts each back', async () => {
    const app = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'Fabrikam', role: 'Engineer' },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'Design',
        type: 'SYSTEM_DESIGN',
        scheduledStart: at('2026-11-02T18:00:00Z'),
        timezone: 'America/Toronto',
      },
    });
    const item = await prisma.interviewPrepItem.create({
      data: {
        userId: user.id,
        roundId: round.id,
        title: 'Caching',
        kind: 'GAP',
      },
    });
    const removed = await deletePrepItem(user, item.id);
    await restore(user, 'restore-prep-item', {
      roundId: removed.roundId,
      kind: removed.kind,
      title: removed.title,
    });
    expect(
      await prisma.interviewPrepItem.findMany({
        where: { roundId: round.id },
        select: { title: true, kind: true },
      }),
    ).toEqual([{ title: 'Caching', kind: 'GAP' }]);

    const session = await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: at('2026-10-27T11:00:00Z'),
        endedAt: at('2026-10-27T11:45:00Z'),
      },
    });
    const gone = await deleteSession(user, session.id);
    expect(
      await prisma.actualSession.count({ where: { id: session.id } }),
    ).toBe(0);
    await restore(user, 'restore-session', {
      category: gone.category,
      startedAt: gone.startedAt.toISOString(),
      endedAt: gone.endedAt!.toISOString(),
    });
    expect(
      await prisma.actualSession.count({
        where: { userId: user.id, startedAt: gone.startedAt },
      }),
    ).toBe(1);
  });

  it('hides an imported problem and deletes one the owner added', async () => {
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Two Pointers' },
      create: { name: 'Two Pointers' },
      update: {},
    });
    const problem = (title: string) =>
      prisma.dsaProblem.create({
        data: {
          userId: user.id,
          title,
          platform: 'LeetCode',
          problemUrl: `https://leetcode.com/problems/${randomUUID()}/`,
          difficulty: 'EASY',
          topicId: topic.id,
        },
      });
    const imported = await problem('3Sum');
    const mine = await problem('My own problem');
    const roadmap = await prisma.roadmap.create({
      data: { userId: user.id, title: 'DSA patterns' },
    });
    await prisma.roadmapItem.create({
      data: {
        userId: user.id,
        roadmapId: roadmap.id,
        section: 'Two Pointers',
        title: '3Sum',
        slug: 'p-3sum',
        dsaProblemId: imported.id,
      },
    });
    expect(await removeProblem(user, imported.id)).toEqual({
      title: '3Sum',
      hidden: true,
    });
    expect(
      (
        await prisma.dsaProblem.findUniqueOrThrow({
          where: { id: imported.id },
        })
      ).hiddenAt,
    ).not.toBeNull();
    expect(await removeProblem(user, mine.id)).toEqual({
      title: 'My own problem',
      hidden: false,
    });
    expect(await prisma.dsaProblem.count({ where: { id: mine.id } })).toBe(0);

    // A roadmap goes with its items; a goal goes and leaves the roadmap unlinked.
    const goal = await prisma.goal.create({
      data: { userId: user.id, title: 'Offer', category: 'Career' },
    });
    await prisma.roadmap.update({
      where: { id: roadmap.id },
      data: { goalId: goal.id },
    });
    expect(await deleteGoal(user, goal.id)).toBe('Offer');
    expect(
      (await prisma.roadmap.findUniqueOrThrow({ where: { id: roadmap.id } }))
        .goalId,
    ).toBeNull();
    expect(await deleteRoadmap(user, roadmap.id)).toBe('DSA patterns');
    expect(
      await prisma.roadmapItem.count({ where: { roadmapId: roadmap.id } }),
    ).toBe(0);
    // The hidden problem stays, unlinked, for the next import.
    expect(await prisma.dsaProblem.count({ where: { id: imported.id } })).toBe(
      1,
    );
  });
});
