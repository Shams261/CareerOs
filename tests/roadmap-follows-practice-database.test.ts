import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  recordAttempt,
  saveProblem,
  saveTopic,
} from '../src/features/dsa/service';
import {
  addItems,
  applyItemOp,
  saveItem,
  saveRoadmap,
} from '../src/features/roadmap/service';
import { followPractice } from '../src/features/roadmap/follow';
import { practiceStatus } from '../src/features/roadmap/domain';

describe('practiceStatus', () => {
  it('reads Not started, In progress and Done from attempts and confidence', () => {
    expect(practiceStatus({ attemptsCount: 0, confidence: 'GREEN' })).toBe(
      'NOT_STARTED',
    );
    expect(practiceStatus({ attemptsCount: 1, confidence: 'RED' })).toBe(
      'IN_PROGRESS',
    );
    expect(practiceStatus({ attemptsCount: 2, confidence: 'YELLOW' })).toBe(
      'IN_PROGRESS',
    );
    expect(practiceStatus({ attemptsCount: 3, confidence: 'GREEN' })).toBe(
      'DONE',
    );
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('problem items follow Practice (WI-046)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `follow-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `follow-${randomUUID()}`, timezone: 'America/Toronto' };
  const now = new Date('2026-10-27T18:00:00Z');
  let topicId: string;
  const attempt = (
    problemId: string,
    confidenceAfter: string,
    solvedIndependently: string,
    at: Date,
  ) =>
    recordAttempt(
      user,
      {
        problemId,
        requestId: randomUUID(),
        confidenceAfter,
        solvedIndependently,
      },
      at,
    );
  const problemItem = async (title: string) => {
    const problem = await saveProblem(user, {
      title,
      platform: 'LeetCode',
      problemUrl: `https://leetcode.com/problems/${randomUUID()}/`,
      difficulty: 'EASY',
      topicId,
    });
    const roadmap = await saveRoadmap(user, { title: `DSA ${randomUUID()}` });
    await addItems(user, {
      roadmapId: roadmap.id,
      section: 'Arrays',
      lines: `? ${title}`,
    });
    const item = await prisma.roadmapItem.findFirstOrThrow({
      where: { roadmapId: roadmap.id },
    });
    return { problem, item };
  };
  const link = (
    item: { id: string; title: string; section: string },
    to: string,
  ) =>
    saveItem(user, {
      id: item.id,
      title: item.title,
      section: item.section,
      kind: 'QUESTION',
      link: to,
      nextRevisionAt: '2026-11-03',
    });
  const read = (id: string) =>
    prisma.roadmapItem.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Follow test',
          timezone: u.timezone,
        },
      });
    topicId = (
      await saveTopic(user, {
        name: user.id,
        status: 'LEARNING',
        ordering: 0,
        current: false,
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.dsaTopic.deleteMany({ where: { id: topicId } });
    await prisma.$disconnect();
  });

  it('links a problem, drops a typed revision date and takes the status from attempts', async () => {
    const { problem, item } = await problemItem('Two Sum');
    await link(item, `problem:${problem.id}`);
    expect(await read(item.id)).toMatchObject({
      dsaProblemId: problem.id,
      status: 'NOT_STARTED',
      nextRevisionAt: null,
      completedAt: null,
    });

    await attempt(problem.id, 'RED', 'NO', now);
    expect((await read(item.id)).status).toBe('IN_PROGRESS');

    const green = new Date(+now + 86400000);
    await attempt(problem.id, 'GREEN', 'YES', green);
    const done = await read(item.id);
    expect(done).toMatchObject({
      status: 'DONE',
      nextRevisionAt: null,
      revisionStage: 0,
    });
    expect(+done.completedAt!).toBe(+green);
    // Practice keeps its own revision; the roadmap never writes to it.
    const p = await prisma.dsaProblem.findUniqueOrThrow({
      where: { id: problem.id },
    });
    expect(p).toMatchObject({ confidence: 'GREEN', attemptsCount: 2 });
    expect(p.nextRevisionAt).not.toBeNull();

    // A later Yellow reopens the item; Green again keeps a fresh completion time.
    await attempt(problem.id, 'YELLOW', 'YES', new Date(+green + 86400000));
    expect(await read(item.id)).toMatchObject({
      status: 'IN_PROGRESS',
      completedAt: null,
    });
  });

  it('refuses Done, Start, Reopen and Revised on a problem item, keeps Asked and Remove', async () => {
    const { problem, item } = await problemItem('Valid Anagram');
    await link(item, `problem:${problem.id}`);
    for (const op of ['done', 'start', 'reopen', 'revised'])
      await expect(applyItemOp(user, { id: item.id, op }, now)).rejects.toThrow(
        'This item follows Practice',
      );
    expect((await read(item.id)).status).toBe('NOT_STARTED');
    await applyItemOp(user, { id: item.id, op: 'asked' }, now);
    expect((await read(item.id)).askedInInterview).toBe(true);
    await applyItemOp(user, { id: item.id, op: 'remove' }, now);
    expect(
      await prisma.roadmapItem.findUnique({ where: { id: item.id } }),
    ).toBeNull();
  });

  it('keeps the last status when unlinked, and concept items keep their own marks', async () => {
    const { problem, item } = await problemItem('Contains Duplicate');
    await link(item, `problem:${problem.id}`);
    await attempt(problem.id, 'YELLOW', 'YES', now);
    await link(item, '');
    expect(await read(item.id)).toMatchObject({
      dsaProblemId: null,
      status: 'IN_PROGRESS',
    });
    // Unlinked, the roadmap marks and a typed revision date apply again.
    await applyItemOp(user, { id: item.id, op: 'done' }, now);
    expect((await read(item.id)).status).toBe('DONE');
    await link(item, '');
    expect((await read(item.id)).nextRevisionAt).not.toBeNull();
  });

  it('brings stale items in step for one owner only and writes nothing when already in step', async () => {
    const { problem, item } = await problemItem('Group Anagrams');
    await link(item, `problem:${problem.id}`);
    await attempt(problem.id, 'GREEN', 'YES', now);
    // A stale copy, as an earlier version could leave it.
    await prisma.roadmapItem.update({
      where: { id: item.id },
      data: {
        status: 'NOT_STARTED',
        completedAt: null,
        nextRevisionAt: new Date('2026-11-03'),
        revisionStage: 1,
      },
    });
    const otherRoadmap = await prisma.roadmap.create({
      data: { userId: other.id, title: 'Other' },
    });
    const otherItem = await prisma.roadmapItem.create({
      data: {
        userId: other.id,
        roadmapId: otherRoadmap.id,
        section: 'Arrays',
        title: 'Not mine',
        status: 'DONE',
        dsaProblemId: problem.id,
      },
    });
    expect(
      await prisma.$transaction((tx) => followPractice(tx, user.id, {}, now)),
    ).toBeGreaterThanOrEqual(1);
    expect(await read(item.id)).toMatchObject({
      status: 'DONE',
      nextRevisionAt: null,
      revisionStage: 0,
    });
    expect((await read(otherItem.id)).status).toBe('DONE');
    const before = (await read(item.id)).updatedAt;
    expect(
      await prisma.$transaction((tx) =>
        followPractice(tx, user.id, { itemId: item.id }, now),
      ),
    ).toBe(0);
    expect(+(await read(item.id)).updatedAt).toBe(+before);
  });
});
