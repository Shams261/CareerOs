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
import { lookBack } from '../src/features/look-back/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const at = (d: string, t: string) => localInstant(d, t, zone);

describe.skipIf(!url)('Look Back (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  beforeEach(async () => {
    const id = `look-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Look', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  afterAll(() => prisma.$disconnect());

  it('is empty before the first session', async () => {
    expect(await lookBack(user, at('2026-10-22', '12:00'))).toBeNull();
  });

  it('never makes a moment or a month fact from test-named records', async () => {
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: at('2026-10-01', '09:00'),
        endedAt: at('2026-10-01', '10:00'),
      },
    });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Arrays & Hashing' },
      create: { name: 'Arrays & Hashing' },
      update: {},
    });
    const problem = (title: string) =>
      prisma.dsaProblem.create({
        data: {
          userId: user.id,
          title,
          platform: 'LeetCode',
          problemUrl: 'https://leetcode.com/problems/x/',
          difficulty: 'EASY',
          topicId: topic.id,
        },
      });
    const fake = await problem('UAT Test – Problem 01');
    const real = await problem('Two Sum');
    const attempt = (problemId: string, d: string) =>
      prisma.dsaAttempt.create({
        data: {
          userId: user.id,
          problemId,
          requestId: randomUUID(),
          attemptedAt: at(d, '11:00'),
          confidenceAfter: 'GREEN',
          solvedIndependently: 'YES',
        },
      });
    await attempt(fake.id, '2026-10-02');
    await attempt(real.id, '2026-10-05');
    const app = await prisma.jobApplication.create({
      data: { userId: user.id, company: 'TEST company', role: 'Engineer' },
    });
    await prisma.interviewRound.create({
      data: {
        userId: user.id,
        applicationId: app.id,
        title: 'Coding',
        type: 'CODING',
        scheduledStart: at('2026-10-06', '15:00'),
        timezone: zone,
      },
    });
    const data = (await lookBack(user, at('2026-10-22', '12:00')))!;
    const own = data.moments.find((m) => m.key === 'first-own-solve');
    expect(own?.line).toMatch(/^Two Sum/);
    expect(data.moments.some((m) => m.key === 'first-interview')).toBe(false);
    expect(data.month.lines).toContain('1 practice attempt, 1 on your own');
    expect(data.month.lines.some((l) => /interview/.test(l))).toBe(false);
    expect(
      data.grid.weeks.flat().find((c) => c.day === '2026-10-01')?.sessions,
    ).toBe(1);
  });
});
