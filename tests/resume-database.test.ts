import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { clearBlockTime } from '../src/features/deletes/service';
import { restore } from '../src/features/undo/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('One record per block (WI-068)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `res-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `res-${randomUUID()}`, timezone: 'America/Toronto' };
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Resume test',
          timezone: u.timezone,
        },
      });
  });
  afterAll(async () => {
    for (const u of [user, other])
      await prisma.user.delete({ where: { id: u.id } });
    await prisma.$disconnect();
  });

  const block = async (userId: string, status: 'PLANNED' | 'COMPLETED') => {
    const day = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId, date: new Date('2026-10-28') } },
      create: { userId, date: new Date('2026-10-28') },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: day.id,
        title: 'Graphs: BFS',
        category: 'DSA',
        plannedStart: at('2026-10-28T22:00:00Z'),
        plannedEnd: at('2026-10-28T22:30:00Z'),
        status,
        completedAt: status === 'COMPLETED' ? at('2026-10-28T22:25:00Z') : null,
      },
    });
  };
  const session = (
    userId: string,
    taskId: string,
    from: string,
    to: string | null,
  ) =>
    prisma.actualSession.create({
      data: {
        userId,
        taskId,
        category: 'DSA',
        startedAt: at(from),
        endedAt: to ? at(to) : null,
        notes: 'Learned: a queue keeps the level order',
      },
    });

  it('deletes every part of a paused-and-resumed block at once, and Undo puts them back', async () => {
    const b = await block(user.id, 'COMPLETED');
    await session(
      user.id,
      b.id,
      '2026-10-28T22:00:00Z',
      '2026-10-28T22:05:00Z',
    );
    await session(
      user.id,
      b.id,
      '2026-10-28T22:10:00Z',
      '2026-10-28T22:25:00Z',
    );
    const cleared = await clearBlockTime(user, b.id);
    expect(cleared.sessions).toHaveLength(2);
    expect(await prisma.actualSession.count({ where: { taskId: b.id } })).toBe(
      0,
    );
    // A done block with no time left on it is planned again.
    const planned = await prisma.timeBlock.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(planned.status).toBe('PLANNED');
    expect(planned.completedAt).toBeNull();

    await restore(user, 'restore-block-time', {
      taskId: b.id,
      completedAt: cleared.completedAt?.toISOString() ?? null,
      sessions: cleared.sessions,
    });
    const back = await prisma.actualSession.findMany({
      where: { taskId: b.id },
      orderBy: { startedAt: 'asc' },
    });
    expect(back.map((s) => s.startedAt.toISOString())).toEqual([
      '2026-10-28T22:00:00.000Z',
      '2026-10-28T22:10:00.000Z',
    ]);
    expect(back[0].notes).toBe('Learned: a queue keeps the level order');
    const done = await prisma.timeBlock.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt?.toISOString()).toBe('2026-10-28T22:25:00.000Z');
  });

  it('refuses a running block, a block without time and another owner’s block', async () => {
    const running = await block(user.id, 'PLANNED');
    await session(user.id, running.id, '2026-10-28T22:00:00Z', null);
    await expect(clearBlockTime(user, running.id)).rejects.toThrow(
      'Pause the running session before deleting its time.',
    );
    await prisma.actualSession.updateMany({
      where: { taskId: running.id },
      data: { endedAt: at('2026-10-28T22:05:00Z') },
    });
    const empty = await block(user.id, 'PLANNED');
    await expect(clearBlockTime(user, empty.id)).rejects.toThrow(
      'This block has no recorded time.',
    );
    const theirs = await block(other.id, 'COMPLETED');
    await session(
      other.id,
      theirs.id,
      '2026-10-28T22:00:00Z',
      '2026-10-28T22:05:00Z',
    );
    await expect(clearBlockTime(user, theirs.id)).rejects.toThrow(
      'This block no longer exists.',
    );
    expect(
      await prisma.actualSession.count({ where: { taskId: theirs.id } }),
    ).toBe(1);
  });
});
