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
import { closeDay, previewSlots } from '../src/features/close-day/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday; fictional plan
const target = '2026-10-28';
const at = (time: string, d = day) => localInstant(d, time, zone);
const now = at('22:00');

describe.skipIf(!url)('Close the Day (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `close-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Close', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  async function planOn(d: string) {
    return prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(d) } },
      create: { userId: user.id, date: new Date(d) },
      update: {},
    });
  }
  async function block(
    title: string,
    start: string,
    end: string,
    d = day,
    extra: { interviewRoundId?: string } = {},
  ) {
    const plan = await planOn(d);
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category: 'DSA',
        plannedStart: at(start, d),
        plannedEnd: at(end, d),
        ...extra,
      },
    });
  }
  const form = (
    fields: Record<string, string>,
    rows: { id: string; updatedAt: Date; choice: string; slot?: Date }[],
  ) => {
    const out: [string, string][] = Object.entries({
      day,
      note: '',
      ...fields,
    });
    for (const r of rows) {
      out.push([`choice-${r.id}`, r.choice]);
      out.push([`version-${r.id}`, r.updatedAt.toISOString()]);
      if (r.slot) out.push([`slot-${r.id}`, r.slot.toISOString()]);
    }
    return out;
  };
  const state = async () =>
    prisma.timeBlock.findMany({
      where: { dailyPlan: { userId: user.id } },
      include: { dailyPlan: true },
      orderBy: { plannedStart: 'asc' },
    });

  it('moves, lets go and marks done in one close, keeping an earlier rating', async () => {
    const a = await block('Two pointers practice', '18:00', '19:00');
    const b = await block('Sliding window drill', '19:30', '20:00');
    const c = await block('System design reading', '20:15', '21:00');
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: c.id,
        category: 'DSA',
        startedAt: at('20:20'),
        endedAt: at('20:50'),
      },
    });
    const plan = await planOn(day);
    await prisma.dailyCheckIn.create({
      data: {
        userId: user.id,
        dailyPlanId: plan.id,
        rating: 4,
        notes: '',
        completedAt: at('12:00'),
      },
    });
    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'DAILY_PROGRESS',
        title: 'Ready to review your day?',
        body: 'Ready to review your day?',
        scheduledFor: at('21:30'),
        dedupeKey: `${user.id}:DAILY_PROGRESS:day:${day}`,
      },
    });
    const { slots } = await previewSlots(
      user,
      await prisma.timeBlock.findMany({
        where: { id: { in: [a.id, b.id, c.id] } },
        include: { sessions: true },
      }),
      day,
      now,
    );
    const counts = await closeDay(
      user,
      form({ note: 'Two pointers clicked' }, [
        { ...a, choice: 'tomorrow', slot: slots.get(a.id)!.start },
        { ...b, choice: 'letgo' },
        { ...c, choice: 'done' },
      ]),
      now,
    );
    expect(counts).toEqual({ tomorrow: 1, letgo: 1, done: 1 });
    const rows = await state();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.id)).toMatchObject({
      status: 'PLANNED',
      plannedStart: at('18:00', target),
      plannedEnd: at('19:00', target),
    });
    expect(byId.get(a.id)!.dailyPlan.date).toEqual(new Date(target));
    expect(byId.get(b.id)).toMatchObject({
      status: 'SKIPPED',
      skipReason: 'Let go',
    });
    expect(byId.get(c.id)?.status).toBe('COMPLETED');
    const closed = await prisma.dailyPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { checkIn: true },
    });
    expect(closed.reviewedAt).toEqual(now);
    expect(closed.checkIn).toMatchObject({
      notes: 'Two pointers clicked',
      rating: 4,
    });
    const reminder = await prisma.notificationLog.findFirstOrThrow({
      where: { userId: user.id, type: 'DAILY_PROGRESS' },
    });
    expect(reminder.readAt).toEqual(now);
  });

  it('writes nothing when the previewed slot was taken meanwhile', async () => {
    const a = await block('Two pointers practice', '18:00', '19:00');
    const c = await block('System design reading', '20:15', '21:00');
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: c.id,
        category: 'DSA',
        startedAt: at('20:20'),
        endedAt: at('20:50'),
      },
    });
    await block('Late arrival', '18:30', '19:30', target);
    await expect(
      closeDay(
        user,
        form({}, [
          { ...a, choice: 'tomorrow', slot: at('18:00', target) },
          { ...c, choice: 'done' },
        ]),
        now,
      ),
    ).rejects.toThrow(/no longer free for Two pointers practice/);
    const rows = await state();
    expect(rows.find((r) => r.id === a.id)?.plannedStart).toEqual(at('18:00'));
    expect(rows.find((r) => r.id === c.id)?.status).toBe('PLANNED');
    expect((await planOn(day)).reviewedAt, 'the day stays open').toBeNull();
  });

  it('needs a choice for every block and refuses a stale form', async () => {
    const a = await block('Two pointers practice', '18:00', '19:00');
    const b = await block('Sliding window drill', '19:30', '20:00');
    await expect(
      closeDay(user, form({}, [{ ...a, choice: 'letgo' }]), now),
    ).rejects.toThrow(/Choose what happens to Sliding window drill/);
    await prisma.timeBlock.update({
      where: { id: b.id },
      data: { title: 'Sliding window, renamed' },
    });
    await expect(
      closeDay(
        user,
        form({}, [
          { ...a, choice: 'letgo' },
          { ...b, choice: 'letgo' },
        ]),
        now,
      ),
    ).rejects.toThrow(/changed since this opened/);
    expect((await state()).every((r) => r.status === 'PLANNED')).toBe(true);
  });

  it('never moves an interview and never closes over a running session', async () => {
    const app = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'Northwind Labs', role: 'Engineer' },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'Pair programming',
        scheduledStart: at('15:00'),
        timezone: zone,
      },
    });
    const i = await block(
      'Northwind Labs — Pair programming',
      '15:00',
      '16:00',
      day,
      {
        interviewRoundId: round.id,
      },
    );
    const { slots } = await previewSlots(
      user,
      [{ ...i, sessions: [] }],
      day,
      now,
    );
    expect(slots.has(i.id)).toBe(false);
    await expect(
      closeDay(
        user,
        form({}, [{ ...i, choice: 'tomorrow', slot: at('15:00', target) }]),
        now,
      ),
    ).rejects.toThrow(/Choose what happens/);
    const other = await block('Evening reading', '21:00', '21:30');
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: other.id,
        category: 'DSA',
        startedAt: at('21:05'),
      },
    });
    await expect(
      closeDay(user, form({}, [{ ...i, choice: 'letgo' }]), now),
    ).rejects.toThrow(/Pause the running session/);
    expect(
      (
        await prisma.interviewRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).scheduledStart,
    ).toEqual(at('15:00'));
  });

  it('closes a day with nothing planned', async () => {
    expect(await closeDay(user, form({ note: 'Rested' }, []), now)).toEqual({
      tomorrow: 0,
      letgo: 0,
      done: 0,
    });
    expect((await planOn(day)).reviewedAt).toEqual(now);
  });
});
