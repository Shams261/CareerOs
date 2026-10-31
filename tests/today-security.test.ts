import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  execute,
  logSession,
  stopUnlinkedSession,
} from '../src/features/execution/service';
import { saveBlock } from '../src/features/schedule/editing';
import { deleteBlock, deleteSession } from '../src/features/deletes/service';
import { noteOp } from '../src/features/notes/service';
import { closeDay } from '../src/features/close-day/service';
import { letGoDay } from '../src/features/today/let-go';
import { restore } from '../src/features/undo/service';
import { localInstant } from '../src/lib/time';
const url = process.env.TEST_DATABASE_URL;

/**
 * Owner scoping of Today (from the check of 2026-10-31): every block, session, note and close
 * names the signed-in owner, so another owner's records are refused by every action and by
 * every undo; a goal must be the owner's.
 */
describe.skipIf(!url)('today owner scoping', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const zone = 'America/Toronto';
  const a = { id: `ts-a-${randomUUID()}`, timezone: zone },
    b = { id: `ts-b-${randomUUID()}`, timezone: zone };
  const DAY = '2026-09-22';
  const now = localInstant('2026-09-22', '15:00', zone);
  let blockB = '',
    doneB = '',
    sessionB = '',
    openB = '',
    noteB = '',
    goalB = '',
    versionB = '';
  beforeAll(async () => {
    for (const u of [a, b])
      await prisma.user.create({
        data: { ...u, name: 'T', email: `${u.id}@example.com` },
      });
    const plan = await prisma.dailyPlan.create({
      data: { userId: b.id, date: new Date(DAY) },
    });
    const planned = await prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: 'B practice',
        category: 'DSA',
        plannedStart: localInstant(DAY, '09:00', zone),
        plannedEnd: localInstant(DAY, '10:00', zone),
      },
    });
    blockB = planned.id;
    versionB = planned.updatedAt.toISOString();
    const done = await prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: 'B reading',
        category: 'Technical',
        status: 'COMPLETED',
        completedAt: localInstant(DAY, '12:00', zone),
        plannedStart: localInstant(DAY, '11:00', zone),
        plannedEnd: localInstant(DAY, '12:00', zone),
      },
    });
    doneB = done.id;
    sessionB = (
      await prisma.actualSession.create({
        data: {
          userId: b.id,
          taskId: done.id,
          category: 'Technical',
          startedAt: localInstant(DAY, '11:00', zone),
          endedAt: localInstant(DAY, '11:50', zone),
        },
      })
    ).id;
    openB = (
      await prisma.actualSession.create({
        data: {
          userId: b.id,
          category: 'Other',
          startedAt: localInstant(DAY, '14:00', zone),
        },
      })
    ).id;
    noteB = (
      await prisma.quickNote.create({ data: { userId: b.id, body: 'B note' } })
    ).id;
    goalB = (
      await prisma.goal.create({
        data: { userId: b.id, title: 'B goal', category: 'DSA' },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  });
  const unchanged = async () => {
    const [p, d, s, o, n] = await Promise.all([
      prisma.timeBlock.findUnique({ where: { id: blockB } }),
      prisma.timeBlock.findUnique({ where: { id: doneB } }),
      prisma.actualSession.findUnique({ where: { id: sessionB } }),
      prisma.actualSession.findUnique({ where: { id: openB } }),
      prisma.quickNote.findUnique({ where: { id: noteB } }),
    ]);
    expect(p?.status).toBe('PLANNED');
    expect(p?.title).toBe('B practice');
    expect(d?.status).toBe('COMPLETED');
    expect(s).not.toBeNull();
    expect(o?.endedAt).toBeNull();
    expect(n?.doneAt).toBeNull();
    expect(await prisma.actualSession.count({ where: { userId: a.id } })).toBe(
      0,
    );
  };

  it("refuses every execution on another owner's block", async () => {
    for (const action of [
      'start',
      'complete',
      'skip',
      'cancel',
      'reset',
      'stop',
    ] as const)
      await expect(execute(a, blockB, action, '', now)).rejects.toThrow(
        /no longer exists/,
      );
    await expect(
      logSession(
        a,
        {
          id: doneB,
          day: DAY,
          endDay: DAY,
          startLocal: '13:00',
          endLocal: '13:30',
        },
        now,
      ),
    ).rejects.toThrow(/no longer exists/);
    await expect(stopUnlinkedSession(a, openB, now)).rejects.toThrow(
      /no longer running/,
    );
    await unchanged();
  });

  it("refuses editing, deleting and restoring another owner's block, session and note", async () => {
    const edit = {
      id: blockB,
      title: 'Taken over',
      category: 'DSA',
      priority: 2,
      day: DAY,
      endDay: DAY,
      startLocal: '09:00',
      endLocal: '10:00',
    };
    await expect(saveBlock(a, edit, false, versionB)).rejects.toThrow(
      /no longer exists/,
    );
    await expect(
      saveBlock(a, { ...edit, id: undefined, goalId: goalB }, false),
    ).rejects.toThrow(/goal from your workspace/);
    await expect(deleteBlock(a, blockB)).rejects.toThrow(/no longer on your/);
    await expect(deleteSession(a, sessionB)).rejects.toThrow(
      /no longer exists/,
    );
    await expect(noteOp(a, { id: noteB, op: 'done' })).rejects.toThrow(
      /no longer exists/,
    );
    await expect(noteOp(a, { id: noteB, op: 'remove' })).rejects.toThrow(
      /no longer exists/,
    );
    await expect(
      restore(a, 'restore-block', { id: blockB, sessions: [] }),
    ).rejects.toThrow(/no longer exists/);
    // An undo payload comes from the browser: a session put back names a block, and a block
    // that is not the owner's drops the link; the session is the owner's own and unlinked.
    await restore(a, 'restore-session', {
      taskId: doneB,
      category: 'Technical',
      startedAt: localInstant(DAY, '13:00', zone).toISOString(),
      endedAt: localInstant(DAY, '13:30', zone).toISOString(),
    });
    const restored = await prisma.actualSession.findMany({
      where: { userId: a.id },
    });
    expect(restored).toHaveLength(1);
    expect(restored[0].taskId).toBeNull();
    expect(await prisma.actualSession.count({ where: { taskId: doneB } })).toBe(
      1,
    );
    await prisma.actualSession.deleteMany({ where: { userId: a.id } });
    await unchanged();
  });

  it("closes and lets go only the owner's own day", async () => {
    // A's close of that day names B's block: B's block is not touched and nothing of A's exists.
    const counts = await closeDay(
      a,
      [
        ['day', DAY],
        ['note', 'Closed by A'],
        [`choice-${blockB}`, 'letgo'],
        [`version-${blockB}`, versionB],
      ],
      now,
    );
    expect(counts).toEqual({ tomorrow: 0, letgo: 0, done: 0 });
    expect(
      await letGoDay(a, DAY, localInstant('2026-09-23', '15:00', zone)),
    ).toEqual([]);
    const own = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId: a.id, date: new Date(DAY) } },
      include: { checkIn: true },
    });
    expect(own?.reviewedAt).not.toBeNull();
    expect(own?.checkIn?.notes).toBe('Closed by A');
    await unchanged();
  });
});
