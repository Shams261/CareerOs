import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { deleteBlock } from '../src/features/deletes/service';
import { restore } from '../src/features/undo/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'One record per block, one Delete (WI-068, WI-070)',
  () => {
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
          completedAt:
            status === 'COMPLETED' ? at('2026-10-28T22:25:00Z') : null,
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

    it('deletes a paused-and-resumed block with every part of its time, and Undo puts all of it back', async () => {
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
      const gone = await deleteBlock(user, b.id);
      expect(gone.sessions).toHaveLength(2);
      expect(
        await prisma.actualSession.count({ where: { taskId: b.id } }),
      ).toBe(0);
      const deleted = await prisma.timeBlock.findUniqueOrThrow({
        where: { id: b.id },
      });
      expect(deleted).toMatchObject({
        status: 'CANCELLED',
        skipReason: 'Deleted',
      });

      await restore(user, 'restore-block', {
        id: b.id,
        completedAt: gone.completedAt?.toISOString() ?? null,
        sessions: gone.sessions,
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

    it('refuses a running block and another owner’s block', async () => {
      const running = await block(user.id, 'PLANNED');
      await session(user.id, running.id, '2026-10-28T22:00:00Z', null);
      await expect(deleteBlock(user, running.id)).rejects.toThrow(
        'Pause the running session before deleting its block.',
      );
      await prisma.actualSession.updateMany({
        where: { taskId: running.id },
        data: { endedAt: at('2026-10-28T22:05:00Z') },
      });
      const theirs = await block(other.id, 'COMPLETED');
      await session(
        other.id,
        theirs.id,
        '2026-10-28T22:00:00Z',
        '2026-10-28T22:05:00Z',
      );
      await expect(deleteBlock(user, theirs.id)).rejects.toThrow(
        'This block is no longer on your plan.',
      );
      expect(
        await prisma.actualSession.count({ where: { taskId: theirs.id } }),
      ).toBe(1);
    });
  },
);
