import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
import { importBundle } from '../scripts/lib/roadmap-import';
import type { Bundle } from '../scripts/lib/roadmap-bundle';
const url = process.env.TEST_DATABASE_URL;

const topic = `Import topic ${randomUUID().slice(0, 8)}`;
const bundle: Bundle = {
  format: 'silsila-roadmap-bundle',
  version: 1,
  builtAt: '2026-10-21T20:00:00Z',
  goal: {
    title: 'Offer from a product company',
    category: 'Career',
    targetDate: '2026-12-31',
  },
  roadmaps: [
    {
      title: 'DSA patterns (test)',
      description: 'Test roadmap',
      promptTemplate: 'Study {{topic}}: {{scope}} / {{scenario}}',
      scenarios: [{ id: 'learn', name: 'Learn', intro: 'Teach it' }],
      sections: [
        {
          name: 'Two Pointers',
          items: [
            {
              slug: 'pattern-two-pointers',
              title: 'Two Pointers: recognise it',
              kind: 'CONCEPT',
              priority: 1,
              scope: 'Sorted input',
              checkpoint: 'Template from memory',
              references: [{ label: 'NeetCode', url: 'https://neetcode.io/' }],
              notes: 'imported note',
              dsaTopic: topic,
            },
            {
              slug: 'core-15',
              title: '15. 3Sum',
              kind: 'QUESTION',
              priority: 1,
              estimateMinutes: 40,
              url: 'https://leetcode.com/problems/3sum/',
              problemUrl: 'https://leetcode.com/problems/3sum/',
            },
          ],
        },
      ],
    },
  ],
  dsa: {
    topics: [{ name: topic, description: 'Pairs', ordering: 2 }],
    problems: [
      {
        title: '3Sum',
        problemUrl: 'https://leetcode.com/problems/3sum/',
        difficulty: 'MEDIUM',
        topic,
        notes: 'LeetCode 15',
      },
    ],
  },
};

describe.skipIf(!url)('roadmap bundle import', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  const userId = `import-${randomUUID()}`;
  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com`, name: 'Test' },
    });
  });
  afterAll(async () => {
    await prisma.dsaProblem.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.dsaTopic.deleteMany({ where: { name: topic } });
    await prisma.$disconnect();
  });
  it('creates everything once, then updates without touching marks or notes', async () => {
    const first = await importBundle(prisma, bundle, { userId });
    expect(first.roadmaps[0]).toMatchObject({
      created: true,
      items: { created: 2, updated: 0, notesKept: 0 },
    });
    expect(first.topics).toEqual({ created: 1, updated: 0 });
    expect(first.problems).toEqual({ created: 1, updated: 0 });
    const roadmap = await prisma.roadmap.findFirstOrThrow({
      where: { userId, title: 'DSA patterns (test)' },
      include: { items: { orderBy: { ordering: 'asc' } }, goal: true },
    });
    // WI-064: the curriculum is never tied to a goal, even when the bundle names one.
    expect(roadmap.goal).toBeNull();
    expect(roadmap.curriculum).toBe(true);
    expect(await prisma.goal.count({ where: { userId } })).toBe(0);
    expect(roadmap.promptTemplate).toContain('{{scenario}}');
    expect(roadmap.scenarios).toEqual([
      { id: 'learn', name: 'Learn', intro: 'Teach it' },
    ]);
    const [pattern, problem] = roadmap.items;
    expect(pattern).toMatchObject({
      slug: 'pattern-two-pointers',
      notes: 'imported note',
      priority: 1,
      references: [{ label: 'NeetCode', url: 'https://neetcode.io/' }],
    });
    expect(pattern.dsaTopicId).not.toBeNull();
    expect(problem.dsaProblemId).not.toBeNull();
    expect(problem.estimateMinutes).toBe(40);
    const dsaProblem = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: problem.dsaProblemId! },
    });
    expect(dsaProblem).toMatchObject({
      userId,
      platform: 'LeetCode',
      difficulty: 'MEDIUM',
    });

    // The owner works: marks an item done, writes notes, records confidence on the problem.
    await prisma.roadmapItem.update({
      where: { id: pattern.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        notes: 'my own revision note',
        askedInInterview: true,
      },
    });
    await prisma.dsaProblem.update({
      where: { id: dsaProblem.id },
      data: { confidence: 'GREEN', notes: 'solved twice' },
    });

    // The bundle changes: new scope, new note text, one more item, a renamed problem title.
    const next: Bundle = JSON.parse(JSON.stringify(bundle));
    next.roadmaps[0].sections[0].items[0].scope =
      'Sorted input, pairs, palindromes';
    next.roadmaps[0].sections[0].items[0].notes =
      'replacement note that must not win';
    next.roadmaps[0].sections[0].items.push({
      slug: 'core-11',
      title: '11. Container With Most Water',
      kind: 'QUESTION',
      priority: 2,
    });
    next.dsa.problems[0].title = '3Sum (renamed)';
    const second = await importBundle(prisma, next, { userId });
    expect(second.roadmaps[0]).toMatchObject({
      created: false,
      items: { created: 1, updated: 2, notesKept: 1 },
    });
    expect(second.problems).toEqual({ created: 0, updated: 1 });
    const again = await prisma.roadmapItem.findUniqueOrThrow({
      where: { id: pattern.id },
    });
    expect(again).toMatchObject({
      status: 'DONE',
      askedInInterview: true,
      notes: 'my own revision note',
      scope: 'Sorted input, pairs, palindromes',
    });
    expect(again.completedAt).not.toBeNull();
    const problemAgain = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: dsaProblem.id },
    });
    expect(problemAgain).toMatchObject({
      title: '3Sum (renamed)',
      confidence: 'GREEN',
      notes: 'solved twice',
    });
    expect(await prisma.roadmap.count({ where: { userId } })).toBe(1);
    expect(
      await prisma.roadmapItem.count({ where: { roadmapId: roadmap.id } }),
    ).toBe(3);
  });
  it('refuses a bundle with a broken link or a bad format', async () => {
    await expect(
      importBundle(prisma, { ...bundle, version: 2 as 1 }, { userId }),
    ).rejects.toThrow('version 1');
    const broken: Bundle = JSON.parse(JSON.stringify(bundle));
    broken.roadmaps[0].sections[0].items[1].problemUrl =
      'https://leetcode.com/problems/nope/';
    await expect(importBundle(prisma, broken, { userId })).rejects.toThrow(
      'unknown problem',
    );
  });
});
