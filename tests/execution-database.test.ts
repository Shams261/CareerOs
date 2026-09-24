import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { generatePlan } from '../src/features/schedule/service';
import {
  saveBlock,
  saveRoutine,
  PreviewRequired,
} from '../src/features/schedule/editing';
import { execute, logSession } from '../src/features/execution/service';
import { processNotifications } from '../src/features/notifications/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('daily execution persistence', () => {
  const prisma = new PrismaClient({
    adapter: createPgAdapter(url!),
  });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `execution-${randomUUID()}`;
    user = await prisma.user.create({
      data: {
        id,
        email: `${id}@example.com`,
        name: 'Test',
        timezone: 'America/Toronto',
      },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());
  async function block(day = '2026-09-23', title = 'DSA') {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
      create: { userId: user.id, date: new Date(day) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category: 'DSA',
        plannedStart: new Date(`${day}T11:30Z`),
        plannedEnd: new Date(`${day}T13:00Z`),
      },
    });
  }
  const now = new Date('2026-09-23T12:00Z');
  it('starts once even with concurrent calls and completes without altering the plan', async () => {
    const b = await block();
    await Promise.all([
      execute(user, b.id, 'start', '', now),
      execute(user, b.id, 'start', '', now),
    ]);
    expect(
      await prisma.actualSession.count({ where: { userId: user.id } }),
    ).toBe(1);
    await execute(user, b.id, 'complete', '', new Date(+now + 69 * 60000));
    const result = await prisma.timeBlock.findUniqueOrThrow({
      where: { id: b.id },
      include: { sessions: true },
    });
    expect(result.status).toBe('COMPLETED');
    expect(result.plannedStart).toEqual(b.plannedStart);
    expect(result.plannedEnd).toEqual(b.plannedEnd);
    expect(+result.sessions[0].endedAt! - +result.sessions[0].startedAt).toBe(
      69 * 60000,
    );
  });
  it('allows only one running session across different blocks', async () => {
    const a = await block(),
      b = await block('2026-09-24');
    const results = await Promise.allSettled([
      execute(user, a.id, 'start', '', now),
      execute(user, b.id, 'start', '', now),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.actualSession.count({
        where: { userId: user.id, endedAt: null },
      }),
    ).toBe(1);
    await expect(
      prisma.actualSession.create({
        data: { userId: user.id, category: 'DSA', startedAt: now },
      }),
    ).rejects.toThrow();
  });
  it('stops and resumes into separate actual sessions', async () => {
    const b = await block();
    await execute(user, b.id, 'start', '', now);
    await execute(user, b.id, 'stop', '', new Date(+now + 60000));
    await execute(user, b.id, 'start', '', new Date(+now + 120000));
    await execute(user, b.id, 'complete', '', new Date(+now + 180000));
    expect(await prisma.actualSession.count({ where: { taskId: b.id } })).toBe(
      2,
    );
  });
  it('prevents skipping a running session and stores a reason after stopping', async () => {
    const b = await block();
    await execute(user, b.id, 'start', '', now);
    await expect(
      execute(user, b.id, 'skip', 'Work ran late', now),
    ).rejects.toThrow('Stop');
    await execute(user, b.id, 'stop', '', new Date(+now + 60000));
    await execute(user, b.id, 'skip', 'Work ran late', new Date(+now + 120000));
    expect(
      await prisma.timeBlock.findUnique({ where: { id: b.id } }),
    ).toMatchObject({ status: 'SKIPPED', skipReason: 'Work ran late' });
  });
  it('cancels without deleting recorded history', async () => {
    const b = await block();
    await logSession(
      user,
      {
        id: b.id,
        day: '2026-09-23',
        endDay: '2026-09-23',
        startLocal: '06:00',
        endLocal: '06:30',
        notes: 'Done earlier',
      },
      now,
    );
    await execute(user, b.id, 'cancel', '', now);
    expect(await prisma.actualSession.count({ where: { taskId: b.id } })).toBe(
      1,
    );
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: b.id } }))
        .status,
    ).toBe('CANCELLED');
  });
  it('validates manual sessions, future times and overlapping intervals', async () => {
    const b = await block();
    const input = {
      id: b.id,
      day: '2026-09-23',
      endDay: '2026-09-23',
      startLocal: '06:00',
      endLocal: '07:00',
      notes: '',
    };
    await logSession(user, input, now);
    await expect(logSession(user, input, now)).rejects.toThrow('overlaps');
    await expect(
      logSession(
        user,
        { ...input, startLocal: '07:30', endLocal: '07:00' },
        now,
      ),
    ).rejects.toThrow('End');
    await expect(
      logSession(
        user,
        { ...input, startLocal: '12:00', endLocal: '13:00' },
        now,
      ),
    ).rejects.toThrow('future');
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: b.id } }))
        .status,
    ).toBe('PLANNED');
  });
  it('warns about a planned overlap but permits an explicit override', async () => {
    await block();
    const input = {
      title: 'Call',
      category: 'PERSONAL',
      day: '2026-09-23',
      endDay: '2026-09-23',
      startLocal: '08:00',
      endLocal: '09:00',
      priority: 2,
    };
    await expect(saveBlock(user, input, false)).rejects.toThrow('Overlap');
    await saveBlock(user, input, true);
    expect(
      await prisma.timeBlock.count({
        where: { dailyPlan: { userId: user.id } },
      }),
    ).toBe(2);
  });
  it('keeps a moved occurrence unique and leaves its recurring routine unchanged', async () => {
    const r = await prisma.routineBlock.create({
      data: {
        userId: user.id,
        weekdays: [3],
        title: 'Study',
        category: 'DSA',
        startLocal: '07:30',
        endLocal: '09:00',
      },
    });
    const plan = await generatePlan(user, '2026-09-23');
    const b = await prisma.timeBlock.findFirstOrThrow({
      where: { dailyPlanId: plan.id },
    });
    await saveBlock(
      user,
      {
        id: b.id,
        title: b.title,
        category: b.category,
        day: '2026-09-24',
        endDay: '2026-09-24',
        startLocal: '20:30',
        endLocal: '21:30',
        priority: 2,
      },
      false,
      b.updatedAt.toISOString(),
    );
    await generatePlan(user, '2026-09-23');
    await generatePlan(user, '2026-09-24');
    expect(await prisma.timeBlock.count({ where: { routineKey: r.id } })).toBe(
      1,
    );
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: b.id } }))
        .occurrenceDate,
    ).toEqual(new Date('2026-09-23'));
    expect(
      await prisma.routineBlock.findUnique({ where: { id: r.id } }),
    ).toMatchObject({ startLocal: '07:30', weekdays: [3] });
  });
  it('does not add newly changed routines to already generated snapshots', async () => {
    const plan = await generatePlan(user, '2026-09-23');
    await prisma.routineBlock.create({
      data: {
        userId: user.id,
        weekdays: [3],
        title: 'New',
        category: 'DSA',
        startLocal: '07:30',
        endLocal: '09:00',
      },
    });
    await generatePlan(user, '2026-09-23');
    expect(
      await prisma.timeBlock.count({ where: { dailyPlanId: plan.id } }),
    ).toBe(0);
  });
  it('previews propagation and preserves custom overrides and completed work', async () => {
    const r = await prisma.routineBlock.create({
      data: {
        userId: user.id,
        weekdays: [3, 4, 5],
        title: 'Study',
        category: 'DSA',
        startLocal: '07:30',
        endLocal: '09:00',
      },
    });
    for (const day of ['2026-09-23', '2026-09-24', '2026-09-25'])
      await generatePlan(user, day);
    await prisma.timeBlock.updateMany({
      where: { routineKey: r.id, occurrenceDate: new Date('2026-09-24') },
      data: { isOverride: true, title: 'Custom day' },
    });
    await prisma.timeBlock.updateMany({
      where: { routineKey: r.id, occurrenceDate: new Date('2026-09-25') },
      data: { status: 'COMPLETED', completedAt: new Date('2026-09-25T14:00Z') },
    });
    const input = {
        ...r,
        title: 'Updated study',
        goalId: '',
        startLocal: '08:00',
        description: '',
      },
      options = { sync: true, version: r.updatedAt.toISOString() },
      before = new Date('2026-09-20T12:00Z');
    let preview: PreviewRequired | undefined;
    try {
      await saveRoutine(user, input, options, before);
    } catch (error) {
      if (error instanceof PreviewRequired) preview = error;
      else throw error;
    }
    expect(preview?.lines).toHaveLength(1);
    expect(
      (await prisma.routineBlock.findUniqueOrThrow({ where: { id: r.id } }))
        .title,
    ).toBe('Study');
    await saveRoutine(
      user,
      input,
      { ...options, token: preview!.token },
      before,
    );
    const blocks = await prisma.timeBlock.findMany({
      where: { routineKey: r.id },
      orderBy: { occurrenceDate: 'asc' },
    });
    expect(blocks.map((b) => b.title)).toEqual([
      'Updated study',
      'Custom day',
      'Study',
    ]);
  });
  it('rejects a stale block edit', async () => {
    const b = await block();
    await execute(user, b.id, 'skip', '', now);
    await expect(
      saveBlock(
        user,
        {
          id: b.id,
          title: 'Edit',
          category: 'DSA',
          day: '2026-09-23',
          endDay: '2026-09-23',
          startLocal: '09:00',
          endLocal: '10:00',
          priority: 2,
        },
        false,
        b.updatedAt.toISOString(),
      ),
    ).rejects.toThrow('another tab');
  });
  it('suppresses overdue reminders after manual progress and dedupes concurrent processing', async () => {
    const b = await block();
    await prisma.notificationPreference.create({
      data: { userId: user.id, type: 'OVERDUE_TASK' },
    });
    const after = new Date('2026-09-23T14:00Z');
    await Promise.all([
      processNotifications(after),
      processNotifications(after),
    ]);
    expect(
      await prisma.notificationLog.count({ where: { userId: user.id } }),
    ).toBe(1);
    await logSession(
      user,
      {
        id: b.id,
        day: '2026-09-23',
        endDay: '2026-09-23',
        startLocal: '07:40',
        endLocal: '08:55',
        notes: '',
      },
      after,
    );
    await processNotifications(after);
    expect(
      await prisma.notificationLog.count({
        where: { userId: user.id, readAt: null },
      }),
    ).toBe(0);
  });
  it('denies edits or sessions against another owner’s block', async () => {
    const b = await block();
    await expect(
      execute({ id: 'wrong-owner', timezone: user.timezone }, b.id, 'start'),
    ).rejects.toThrow('no longer exists');
  });
  it('pauses, re-enables, and deletes a template without destroying dated blocks', async () => {
    const input = {
      title: 'Flexible routine',
      category: 'CUSTOM',
      weekdays: [3],
      startLocal: '05:00',
      endLocal: '06:00',
      enabled: true,
      priority: 2,
      description: '',
      goalId: '',
    };
    await saveRoutine(user, input, { sync: false });
    let routine = await prisma.routineBlock.findFirstOrThrow({
      where: { userId: user.id },
    });
    await generatePlan(user, '2026-09-23');
    await saveRoutine(
      user,
      { ...input, id: routine.id, enabled: false },
      { sync: false, version: routine.updatedAt.toISOString() },
    );
    routine = await prisma.routineBlock.findUniqueOrThrow({
      where: { id: routine.id },
    });
    expect(routine.enabled).toBe(false);
    await saveRoutine(
      user,
      { ...input, id: routine.id },
      { sync: false, version: routine.updatedAt.toISOString() },
    );
    routine = await prisma.routineBlock.findUniqueOrThrow({
      where: { id: routine.id },
    });
    expect(routine.enabled).toBe(true);
    const options = {
      sync: false,
      remove: true,
      version: routine.updatedAt.toISOString(),
    };
    let token = '';
    try {
      await saveRoutine(user, { ...input, id: routine.id }, options);
    } catch (error) {
      if (error instanceof PreviewRequired) token = error.token;
      else throw error;
    }
    expect(token).not.toBe('');
    await saveRoutine(
      user,
      { ...input, id: routine.id },
      { ...options, token },
    );
    expect(
      await prisma.routineBlock.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(
      await prisma.timeBlock.count({ where: { routineKey: routine.id } }),
    ).toBe(1);
  });
  it('requires a new preview when an affected block changes before confirmation', async () => {
    const routine = await prisma.routineBlock.create({
      data: {
        userId: user.id,
        weekdays: [3],
        title: 'Preview test',
        category: 'DSA',
        startLocal: '07:30',
        endLocal: '09:00',
      },
    });
    await generatePlan(user, '2030-02-06');
    const input = {
      id: routine.id,
      title: 'New title',
      category: 'DSA',
      weekdays: [3],
      startLocal: '08:00',
      endLocal: '09:00',
      enabled: true,
      priority: 2,
      description: '',
      goalId: '',
    };
    const options = { sync: true, version: routine.updatedAt.toISOString() };
    let token = '';
    try {
      await saveRoutine(user, input, options);
    } catch (error) {
      if (error instanceof PreviewRequired) token = error.token;
      else throw error;
    }
    await prisma.timeBlock.updateMany({
      where: { routineKey: routine.id },
      data: { isOverride: true, title: 'Changed after preview' },
    });
    await expect(
      saveRoutine(user, input, { ...options, token }),
    ).rejects.toBeInstanceOf(PreviewRequired);
    expect(
      (
        await prisma.routineBlock.findUniqueOrThrow({
          where: { id: routine.id },
        })
      ).title,
    ).toBe('Preview test');
  });
});
