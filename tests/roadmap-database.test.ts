import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addItems,
  applyItemOp,
  chainDays,
  goalsOverview,
  roadmapDetail,
  saveGoal,
  saveItem,
  saveRoadmap,
} from '../src/features/roadmap/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('roadmap and goals persistence', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `roadmap-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `roadmap-${randomUUID()}`, timezone: 'America/Toronto' },
    now = new Date('2026-10-21T18:00:00Z'); // Wednesday 14:00 Toronto
  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Test',
          timezone: u.timezone,
        },
      });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  it('creates a goal, a roadmap and items from pasted lines, then tracks them', async () => {
    const goal = await saveGoal(user, {
      title: 'Offer from a product company',
      category: 'Career',
      targetDate: '2027-01-15',
    });
    const roadmap = await saveRoadmap(user, {
      title: 'Technical interview roadmap',
      goalId: goal.id,
    });
    expect(
      await addItems(user, {
        roadmapId: roadmap.id,
        section: 'System design',
        lines: 'Consistent hashing\n? Design a URL shortener',
      }),
    ).toBe(2);
    expect(
      await addItems(user, {
        roadmapId: roadmap.id,
        section: 'System design',
        lines: 'CAP theorem',
      }),
    ).toBe(1);
    let detail = (await roadmapDetail(user, roadmap.id))!;
    const items = detail.sections.get('System design')!;
    expect(items.map((i) => [i.title, i.kind, i.ordering])).toEqual([
      ['Consistent hashing', 'CONCEPT', 0],
      ['Design a URL shortener', 'QUESTION', 1],
      ['CAP theorem', 'CONCEPT', 2],
    ]);
    await applyItemOp(user, { id: items[0].id, op: 'start' });
    await applyItemOp(user, { id: items[1].id, op: 'done' });
    await applyItemOp(user, { id: items[1].id, op: 'asked' });
    detail = (await roadmapDetail(user, roadmap.id))!;
    expect(detail.progress).toEqual({
      total: 3,
      done: 1,
      inProgress: 1,
      asked: 1,
    });
    const done = detail.items.find((i) => i.id === items[1].id)!;
    expect(done.completedAt).not.toBeNull();
    await applyItemOp(user, { id: items[1].id, op: 'reopen' });
    expect(
      (
        await prisma.roadmapItem.findUniqueOrThrow({
          where: { id: items[1].id },
        })
      ).completedAt,
    ).toBeNull();
    const overview = await goalsOverview(user, now);
    expect(overview.find((g) => g.id === goal.id)?.roadmap).toEqual({
      total: 3,
      done: 0,
      inProgress: 2,
      asked: 1,
    });
  });
  it("links an item to the owner's learning topic only", async () => {
    const roadmap = await prisma.roadmap.findFirstOrThrow({
      where: { userId: user.id },
    });
    const item = await prisma.roadmapItem.findFirstOrThrow({
      where: { roadmapId: roadmap.id },
    });
    const subject = await prisma.learningSubject.create({
      data: { userId: other.id, name: 'Theirs', status: 'ACTIVE' },
    });
    const foreign = await prisma.learningTopic.create({
      data: { userId: other.id, subjectId: subject.id, title: 'Not yours' },
    });
    await expect(
      saveItem(user, {
        id: item.id,
        title: item.title,
        section: item.section,
        kind: item.kind,
        link: `learning:${foreign.id}`,
      }),
    ).rejects.toThrow('from your workspace');
    await expect(
      applyItemOp(other, { id: item.id, op: 'done' }),
    ).rejects.toThrow('no longer exists');
  });
  it('marks the chain from recorded sessions and reviews only', async () => {
    const day = (offset: number) =>
      new Date(+now + offset * 86400000).toISOString().slice(0, 10);
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'DSA',
        startedAt: new Date(+now - 2 * 86400000),
        endedAt: new Date(+now - 2 * 86400000 + 1800000),
      },
    });
    await prisma.dailyPlan.create({
      data: {
        userId: user.id,
        date: new Date(day(-1)),
        reviewedAt: now,
      },
    });
    const chain = await chainDays(user, now, 14);
    expect(chain).toHaveLength(14);
    expect(chain.at(-1)).toMatchObject({ day: day(0), today: true });
    expect(chain.find((d) => d.day === day(-2))).toMatchObject({
      worked: true,
      reviewed: false,
    });
    expect(chain.find((d) => d.day === day(-1))).toMatchObject({
      worked: false,
      reviewed: true,
    });
    expect(chain.filter((d) => d.worked || d.reviewed)).toHaveLength(2);
  });
});
