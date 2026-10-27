import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { weekPlan } from '../src/features/roadmap/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('this week on the roadmap (WI-048)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `week-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `week-${randomUUID()}`, timezone: 'America/Toronto' };
  // Wednesday 2026-10-28 10:00 Toronto; the week is Mon Oct 26 – Sun Nov 1.
  const now = new Date('2026-10-28T14:00:00Z');

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Week test',
          timezone: u.timezone,
        },
      });
    await prisma.goal.create({
      data: {
        userId: user.id,
        title: 'Offer from a product company',
        category: 'Career',
        targetDate: new Date('2026-12-15'),
      },
    });
    const dsa = await prisma.roadmap.create({
      data: { userId: user.id, title: 'DSA patterns' },
    });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Arrays & Hashing' },
      create: { name: 'Arrays & Hashing' },
      update: {},
    });
    const problem = (title: string, userId = user.id) =>
      prisma.dsaProblem.create({
        data: {
          userId,
          title,
          platform: 'LeetCode',
          problemUrl: `https://leetcode.com/problems/${randomUUID()}/`,
          difficulty: 'EASY',
          topicId: topic.id,
        },
      });
    const twoSum = await problem('Two Sum');
    const anagram = await problem('Valid Anagram');
    let ordering = 0;
    const add = (data: Record<string, unknown>) =>
      prisma.roadmapItem.create({
        data: {
          userId: user.id,
          roadmapId: dsa.id,
          section: 'Arrays & Hashing',
          title: `Item ${ordering}`,
          ordering: ordering++,
          ...data,
        },
      });
    await add({ title: '1. Two Sum', priority: 1, dsaProblemId: twoSum.id });
    await add({
      title: '242. Valid Anagram',
      priority: 1,
      dsaProblemId: anagram.id,
    });
    await add({
      section: 'Code review and bug squash drills',
      slug: 'drill-bug-families-off-by-one',
      title: 'Bug families: off-by-one',
      status: 'DONE',
      completedAt: new Date('2026-10-27T15:00:00Z'),
    });
    await add({
      section: 'Practical coding for product companies',
      slug: 'practical-rate-limiter',
      title: 'Rate limiter',
      priority: 1,
    });
    // Attempts: two on Two Sum this week (one problem), one on Anagram last week.
    const attempt = (problemId: string, at: string) =>
      prisma.dsaAttempt.create({
        data: {
          userId: user.id,
          problemId,
          requestId: randomUUID(),
          attemptedAt: new Date(at),
          confidenceAfter: 'YELLOW',
          solvedIndependently: 'PARTIAL',
        },
      });
    await attempt(twoSum.id, '2026-10-26T15:00:00Z');
    await attempt(twoSum.id, '2026-10-27T15:00:00Z');
    await attempt(anagram.id, '2026-10-24T15:00:00Z');
    // An AI-assisted round in a week, a test-named one, and one beyond two weeks.
    const app = (company: string) =>
      prisma.jobApplication.create({
        data: {
          userId: user.id,
          company,
          role: 'Engineer',
          stage: 'TECHNICAL',
        },
      });
    const round = (applicationId: string, type: string, at: string) =>
      prisma.interviewRound.create({
        data: {
          userId: user.id,
          applicationId,
          title: type,
          type: type as 'AI_ASSISTED',
          scheduledStart: new Date(at),
          timezone: 'America/Toronto',
        },
      });
    await round(
      (await app('Northwind')).id,
      'AI_ASSISTED',
      '2026-11-04T19:00:00Z',
    );
    await round(
      (await app('TEST Co')).id,
      'ASSESSMENT',
      '2026-11-03T19:00:00Z',
    );
    await round(
      (await app('Fabrikam')).id,
      'CODE_REVIEW',
      '2026-11-20T19:00:00Z',
    );
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });

  it('reads the week from the owner’s own records', async () => {
    const plan = await weekPlan(user, now);
    expect(plan.ready).toBe(
      'Offer from a product company · 7 weeks left · 3 P0 items left',
    );
    expect(
      plan.rows.map((r) => ({
        format: r.format,
        count: `${r.done}/${r.target}`,
        next: r.next?.title ?? null,
        interview: r.interview?.company ?? null,
      })),
    ).toEqual([
      // Northwind's AI-assisted round leads; the test record and Fabrikam (past two weeks) do not.
      {
        format: 'AI_ASSISTED',
        count: '0/1',
        next: 'Rate limiter',
        interview: 'Northwind',
      },
      { format: 'CODING', count: '1/3', next: '1. Two Sum', interview: null },
      { format: 'CODE_REVIEW', count: '0/1', next: null, interview: null },
      { format: 'DEBUGGING', count: '1/1', next: null, interview: null },
      {
        format: 'PRACTICAL',
        count: '0/1',
        next: 'Rate limiter',
        interview: null,
      },
      { format: 'SYSTEM_DESIGN', count: '0/1', next: null, interview: null },
      { format: 'BEHAVIORAL', count: '0/2', next: null, interview: null },
    ]);
  });

  it('starts empty for an owner without material', async () => {
    const plan = await weekPlan(other, now);
    expect(plan.ready).toBe('0 P0 items left');
    expect(plan.rows.every((r) => r.done === 0 && !r.next)).toBe(true);
  });
});
