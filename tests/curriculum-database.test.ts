import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import type { Bundle } from '../src/features/curriculum/bundle';
import { copyCurriculum } from '../src/features/curriculum/copy';
import {
  ensureCurriculum,
  restoreCurriculum,
} from '../src/features/curriculum/service';
import { deleteRoadmap } from '../src/features/deletes/service';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('Default curriculum (WI-064)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const tag = randomUUID().slice(0, 8);
  const topic = `Two Pointers ${tag}`;
  const bundle: Bundle = {
    format: 'silsila-roadmap-bundle',
    version: 1,
    builtAt: '2026-10-22T08:46:08.994Z',
    // A bundle may still name a goal; the curriculum never creates or links one.
    goal: { title: 'Offer from a product company', category: 'Career' },
    roadmaps: [
      {
        title: `DSA patterns ${tag}`,
        sections: [
          {
            name: 'Two pointers',
            items: [
              {
                slug: 'pattern',
                title: 'The pattern',
                kind: 'CONCEPT',
                priority: 1,
                dsaTopic: topic,
              },
              {
                slug: 'core-15',
                title: '15. 3Sum',
                kind: 'QUESTION',
                priority: 1,
                problemUrl: `https://leetcode.com/problems/3sum-${tag}/`,
              },
            ],
          },
        ],
      },
      {
        title: `System design ${tag}`,
        sections: [
          {
            name: 'Basics',
            items: [
              {
                slug: 'caching',
                title: 'Caching',
                kind: 'CONCEPT',
                priority: 2,
              },
            ],
          },
        ],
      },
    ],
    dsa: {
      topics: [{ name: topic, ordering: 1 }],
      problems: [
        {
          title: '3Sum',
          problemUrl: `https://leetcode.com/problems/3sum-${tag}/`,
          difficulty: 'MEDIUM',
          topic,
        },
      ],
    },
  };
  const user = { id: `cur-${randomUUID()}`, timezone: 'America/Toronto' };
  const copy = () =>
    prisma.$transaction((tx) => copyCurriculum(tx, user.id, bundle));

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: user.id, email: `${user.id}@example.com`, name: 'C' },
    });
  });
  afterAll(async () => {
    await prisma.dsaProblem.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.dsaTopic.deleteMany({ where: { name: topic } });
    await prisma.curriculumBundle.deleteMany({ where: { id: 'default' } });
    await prisma.$disconnect();
  });

  it('copies everything once, as curriculum, with no goal', async () => {
    expect(await copy()).toMatchObject({
      topics: 1,
      problems: 1,
      roadmaps: 2,
      items: 3,
    });
    const roadmaps = await prisma.roadmap.findMany({
      where: { userId: user.id },
      include: { items: { orderBy: { ordering: 'asc' } } },
      orderBy: { ordering: 'asc' },
    });
    expect(roadmaps.map((r) => [r.curriculum, r.goalId])).toEqual([
      [true, null],
      [true, null],
    ]);
    expect(await prisma.goal.count({ where: { userId: user.id } })).toBe(0);
    const [pattern, problem] = roadmaps[0].items;
    expect(pattern.dsaTopicId).not.toBeNull();
    expect(problem.dsaProblemId).not.toBeNull();
    // A second copy finds everything in place.
    expect(await copy()).toEqual({
      topics: 0,
      problems: 0,
      roadmaps: 0,
      items: 0,
      unarchived: 0,
      unhidden: 0,
    });
  });

  it('brings back what is missing, archived or hidden, and keeps the owner’s marks', async () => {
    const design = await prisma.roadmap.findFirstOrThrow({
      where: { userId: user.id, title: `System design ${tag}` },
      include: { items: true },
    });
    await prisma.roadmapItem.update({
      where: { id: design.items[0].id },
      data: { status: 'DONE', completedAt: new Date(), notes: 'mine' },
    });
    const dsa = await prisma.roadmap.findFirstOrThrow({
      where: { userId: user.id, title: `DSA patterns ${tag}` },
      include: { items: true },
    });
    await prisma.roadmapItem.delete({
      where: { id: dsa.items.find((i) => i.slug === 'pattern')!.id },
    });
    await prisma.roadmap.update({
      where: { id: design.id },
      data: { archivedAt: new Date() },
    });
    await prisma.dsaProblem.updateMany({
      where: { userId: user.id },
      data: { hiddenAt: new Date() },
    });
    await prisma.curriculumBundle.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        builtAt: new Date(bundle.builtAt),
        payload: bundle as unknown as Prisma.InputJsonValue,
      },
      update: { payload: bundle as unknown as Prisma.InputJsonValue },
    });
    expect(await restoreCurriculum(user)).toMatchObject({
      items: 1,
      unarchived: 1,
      unhidden: 1,
    });
    const kept = await prisma.roadmapItem.findFirstOrThrow({
      where: { roadmapId: design.id, slug: 'caching' },
    });
    expect([kept.status, kept.notes]).toEqual(['DONE', 'mine']);
    // A workspace that already has the curriculum is not copied again on sign-in.
    expect(await ensureCurriculum(user.id)).toBeNull();
  });

  it('archives a default roadmap but never deletes it', async () => {
    const r = await prisma.roadmap.findFirstOrThrow({
      where: { userId: user.id, curriculum: true },
    });
    await expect(deleteRoadmap(user, r.id)).rejects.toThrow(
      /archived, not deleted/,
    );
  });

  it('copies the published curriculum into a new workspace on its first sign-in', async () => {
    const fresh = { id: `cur-${randomUUID()}`, timezone: 'America/Toronto' };
    await prisma.user.create({
      data: { id: fresh.id, email: `${fresh.id}@example.com`, name: 'F' },
    });
    try {
      expect(await ensureCurriculum(fresh.id)).toMatchObject({
        roadmaps: 2,
        items: 3,
        problems: 1,
      });
      expect(await ensureCurriculum(fresh.id)).toBeNull();
    } finally {
      await prisma.dsaProblem.deleteMany({ where: { userId: fresh.id } });
      await prisma.user.delete({ where: { id: fresh.id } });
    }
  });
});
