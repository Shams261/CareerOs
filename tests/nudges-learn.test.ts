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
import {
  learnDue,
  learnedLine,
  learnPart,
  type LineFact,
} from '../src/features/nudges/learn';
import {
  learnNudgeTimes,
  resumePart,
} from '../src/features/nudges/learn-service';
import { saveNudgeSetting } from '../src/features/nudges/service';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const quiet = { start: '22:00', end: '07:30' };
const at = (d: string, t: string) => localInstant(d, t, zone);
const days = [
  '2026-10-12',
  '2026-10-14',
  '2026-10-19',
  '2026-10-21',
  '2026-10-26',
];
const line = (
  d: string,
  start: string | null,
  feedback: LineFact['feedback'] = null,
  time = '08:00',
): LineFact => ({
  at: at(d, time),
  feedback,
  startedAt: start ? at(d, start) : null,
});

describe('reminders that learn (WI-109, pure)', () => {
  it('moves a time one step toward when study usually starts after the line', () => {
    const lines = days.map((d) => line(d, '09:10'));
    expect(learnPart('morning', '08:00', lines, zone, quiet)).toEqual({
      kind: 'move',
      part: 'morning',
      from: '08:00',
      to: '08:15',
    });
    // Starts before the line pull it earlier.
    expect(
      learnPart(
        'evening',
        '20:00',
        days.map((d) => line(d, '19:00', null, '20:00')),
        zone,
        quiet,
      ),
    ).toEqual({ kind: 'move', part: 'evening', from: '20:00', to: '19:45' });
  });
  it('keeps the time with too few starts, a start within half an hour, or one far away', () => {
    expect(
      learnPart(
        'morning',
        '08:00',
        days.slice(0, 3).map((d) => line(d, '09:10')),
        zone,
        quiet,
      ),
    ).toBeNull();
    expect(
      learnPart(
        'morning',
        '08:00',
        days.map((d) => line(d, '08:20')),
        zone,
        quiet,
      ),
    ).toBeNull();
    // A start four hours later is not this line's start.
    expect(
      learnPart(
        'morning',
        '08:00',
        days.map((d) => line(d, '13:00')),
        zone,
        quiet,
      ),
    ).toBeNull();
  });
  it('stays inside the part’s window and out of quiet hours', () => {
    const late = days.map((d) => line(d, '13:00', null, '10:55'));
    expect(learnPart('morning', '11:00', late, zone, quiet)).toBeNull();
    const early = days.map((d) => line(d, '06:40', null, '07:35'));
    expect(
      learnPart(
        'morning',
        '07:35',
        early.map((l) => ({ ...l, startedAt: l.at })),
        zone,
        quiet,
      ),
    ).toBeNull();
  });
  it('turns a part off after three “Too many” in a row', () => {
    const lines = [
      line('2026-10-24', null, 'HELPFUL'),
      line('2026-10-25', null, 'TOO_MANY'),
      line('2026-10-26', null, 'TOO_MANY'),
      line('2026-10-27', null, 'TOO_MANY'),
    ];
    const change = learnPart('evening', '19:30', lines, zone, quiet)!;
    expect(change).toEqual({ kind: 'pause', part: 'evening' });
    expect(learnedLine(change)).toBe('Evening paused by your feedback');
    expect(
      learnedLine({ kind: 'move', part: 'midday', from: '13:00', to: '13:15' }),
    ).toBe('Afternoon 13:00 → 13:15, from when you start');
  });
  it('runs once a week', () => {
    const now = at('2026-10-27', '10:00');
    expect(learnDue(null, now)).toBe(true);
    expect(learnDue(new Date(+now - 6 * 86_400_000), now)).toBe(false);
    expect(learnDue(new Date(+now - 7 * 86_400_000), now)).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('reminders that learn (WI-109, PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `learn-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'L', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());
  const settings = {
    morningEnabled: true,
    morningTime: '08:00',
    eveningEnabled: true,
    eveningTime: '19:30',
    days: 127,
    onlyStudyDays: false,
    quietStart: '22:00',
    quietEnd: '07:30',
    studyCategories: ['DSA'],
  };
  const log = (
    type: 'STUDY_MORNING' | 'STUDY_EVENING',
    d: string,
    time: string,
    feedback: string | null = null,
  ) =>
    prisma.notificationLog.create({
      data: {
        userId: user.id,
        type,
        title: 't',
        body: 'b',
        scheduledFor: at(d, time),
        dedupeKey: `${user.id}:${type}:study:${d}`,
        feedback: feedback as never,
      },
    });

  it('moves the morning toward the starts, pauses the evening, once a week, and Resume brings it back', async () => {
    await saveNudgeSetting(user, settings);
    for (const d of days) {
      await log('STUDY_MORNING', d, '08:00');
      await prisma.actualSession.create({
        data: {
          userId: user.id,
          category: 'DSA',
          startedAt: at(d, '09:10'),
          endedAt: at(d, '09:50'),
        },
      });
    }
    for (const d of ['2026-10-24', '2026-10-25', '2026-10-26'])
      await log('STUDY_EVENING', d, '19:30', 'TOO_MANY');
    const now = at('2026-10-27', '10:00');
    expect(await learnNudgeTimes(now)).toBeGreaterThanOrEqual(2);
    let row = await prisma.studyNudgeSetting.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row).toMatchObject({
      morningTime: '08:15',
      eveningEnabled: false,
      pausedByFeedback: ['evening'],
      learnedNote:
        'Morning 08:00 → 08:15, from when you start · Evening paused by your feedback',
    });
    // Not again within the week.
    await learnNudgeTimes(at('2026-10-30', '10:00'));
    row = await prisma.studyNudgeSetting.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row.morningTime).toBe('08:15');
    await resumePart(user, 'evening', at('2026-10-30', '10:00'));
    row = await prisma.studyNudgeSetting.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row).toMatchObject({ eveningEnabled: true, pausedByFeedback: [] });
    // The old "Too many" answers no longer count a week later.
    await learnNudgeTimes(at('2026-11-06', '10:00'));
    row = await prisma.studyNudgeSetting.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row.eveningEnabled).toBe(true);
  });

  it('leaves the times alone when the owner turned learning off', async () => {
    await saveNudgeSetting(user, { ...settings, learnTimes: false });
    for (const d of days) {
      await log('STUDY_MORNING', d, '08:00');
      await prisma.actualSession.create({
        data: {
          userId: user.id,
          category: 'DSA',
          startedAt: at(d, '09:10'),
          endedAt: at(d, '09:50'),
        },
      });
    }
    await learnNudgeTimes(at('2026-10-27', '10:00'));
    const row = await prisma.studyNudgeSetting.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(row.morningTime).toBe('08:00');
    expect(row.learnedAt).toBeNull();
  });
});
