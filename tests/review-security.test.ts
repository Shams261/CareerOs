import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addPriority,
  completeReview,
  movePriority,
  prepareNextWeek,
  removePriority,
  saveReview,
  setPriorityDone,
  weekReview,
} from '../src/features/review/service';
import { restore } from '../src/features/undo/service';
const url = process.env.TEST_DATABASE_URL;

/**
 * Owner scoping of the Weekly review (from the check of 2026-10-31): a priority, a goal and a
 * written review belong to the signed-in owner only; a week is a Monday; five priorities at most.
 */
describe.skipIf(!url)('weekly review owner scoping', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const zone = 'America/Toronto';
  const a = { id: `rs-a-${randomUUID()}`, timezone: zone },
    b = { id: `rs-b-${randomUUID()}`, timezone: zone };
  const WEEK = '2026-09-21';
  const now = new Date('2026-09-26T16:00:00Z');
  let priorityB = '',
    goalB = '';
  beforeAll(async () => {
    for (const u of [a, b])
      await prisma.user.create({
        data: { ...u, name: 'R', email: `${u.id}@example.com` },
      });
    priorityB = (
      await addPriority(b, { weekStart: WEEK, title: 'B’s priority' })
    ).id;
    goalB = (
      await prisma.goal.create({
        data: {
          userId: b.id,
          title: 'B’s goal',
          category: 'DSA',
        },
      })
    ).id;
    await saveReview(b, { weekStart: WEEK, biggestWin: 'B’s win' }, now);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  });

  it('refuses another owner’s priority on every change', async () => {
    for (const run of [
      () => movePriority(a, priorityB, 'up'),
      () => movePriority(a, priorityB, 'down'),
      () => setPriorityDone(a, priorityB, true, now),
      () => removePriority(a, priorityB),
    ])
      await expect(run()).rejects.toThrow(/not found in your workspace/);
    const still = await prisma.weeklyPriority.findUnique({
      where: { id: priorityB },
    });
    expect(still?.completedAt).toBeNull();
  });

  it('refuses a goal from another workspace on a new priority', async () => {
    await expect(
      addPriority(a, { weekStart: WEEK, title: 'Mine', goalId: goalB }),
    ).rejects.toThrow(/goal from your workspace/);
  });

  it('never shows another owner’s review or priorities', async () => {
    const mine = await weekReview(a, WEEK, now);
    expect(mine.review).toBeNull();
    expect(mine.commitments).toEqual([]);
  });

  it('keeps a week to Monday and five priorities', async () => {
    await expect(
      saveReview(a, { weekStart: '2026-09-22', biggestWin: 'x' }, now),
    ).rejects.toThrow(/Monday/);
    await expect(completeReview(a, '2026-09-22', now)).rejects.toThrow(
      /Monday/,
    );
    await expect(prepareNextWeek(a, '2026-09-22')).rejects.toThrow(/Monday/);
    await expect(
      addPriority(a, { weekStart: '2026-09-22', title: 'x' }),
    ).rejects.toThrow(/Monday/);
    for (let i = 1; i <= 5; i++)
      await addPriority(a, { weekStart: WEEK, title: `P${i}` });
    await expect(
      addPriority(a, { weekStart: WEEK, title: 'P6' }),
    ).rejects.toThrow(/Keep it to 5/);
    await expect(
      saveReview(a, { weekStart: WEEK, biggestWin: 'x'.repeat(1001) }, now),
    ).rejects.toThrow();
  });

  it('undo of a removed priority restores it for the owner only', async () => {
    const mine = await addPriority(a, { weekStart: '2026-09-28', title: 'U' });
    const removed = await removePriority(a, mine.id);
    const payload = {
      weekStart: removed.weekStart,
      title: removed.title,
      category: removed.category,
      goalId: goalB, // a foreign goal smuggled into the undo payload
      target: removed.target,
      targetUnit: removed.targetUnit,
    };
    await expect(restore(a, 'restore-priority', payload)).rejects.toThrow();
    await restore(a, 'restore-priority', { ...payload, goalId: null });
    const rows = await prisma.weeklyPriority.findMany({
      where: { userId: a.id, title: 'U' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].goalId).toBeNull();
    // Another owner's undo payload for my priority does nothing to my rows.
    await expect(
      restore(b, 'remove-priority', { id: rows[0].id }),
    ).rejects.toThrow();
  });
});
