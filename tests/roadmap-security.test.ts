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
  roadmapDetail,
  saveItem,
  saveItemAskedNote,
  saveItemNotes,
  saveRoadmap,
} from '../src/features/roadmap/service';
import { deleteRoadmap } from '../src/features/deletes/service';
import { removeCard } from '../src/features/ai/service';
import { restore } from '../src/features/undo/service';
import { itemInput, parseReferenceLines } from '../src/features/roadmap/domain';
const url = process.env.TEST_DATABASE_URL;

/**
 * Owner scoping of the roadmap (WI-090, from the final check of 2026-10-30): every write names
 * the signed-in owner, so another owner's records, a tampered Undo payload and a link to someone
 * else's topic are refused; a link may only be https.
 */
describe.skipIf(!url)('roadmap owner scoping', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const a = { id: `rs-a-${randomUUID()}`, timezone: 'America/Toronto' },
    b = { id: `rs-b-${randomUUID()}`, timezone: 'America/Toronto' };
  let roadmapB = '',
    itemB = '',
    cardB = '',
    roadmapA = '',
    itemA = '',
    topicB = '';
  beforeAll(async () => {
    for (const u of [a, b])
      await prisma.user.create({
        data: {
          id: u.id,
          email: `${u.id}@example.com`,
          name: 'Test',
          timezone: u.timezone,
        },
      });
    const rb = await prisma.roadmap.create({
      data: { userId: b.id, title: 'Theirs' },
    });
    roadmapB = rb.id;
    const ib = await prisma.roadmapItem.create({
      data: {
        userId: b.id,
        roadmapId: rb.id,
        section: 'S',
        kind: 'CONCEPT',
        title: 'Their item',
        ordering: 1,
      },
    });
    itemB = ib.id;
    cardB = (
      await prisma.revisionCard.create({
        data: {
          userId: b.id,
          roadmapItemId: ib.id,
          question: 'q',
          points: ['p1', 'p2', 'p3'],
        },
      })
    ).id;
    const subject = await prisma.learningSubject.create({
      data: {
        userId: b.id,
        name: 'Their subject',
        status: 'ACTIVE',
        topics: { create: { userId: b.id, title: 'Their topic' } },
      },
      include: { topics: true },
    });
    topicB = subject.topics[0].id;
    const ra = await prisma.roadmap.create({
      data: { userId: a.id, title: 'Mine' },
    });
    roadmapA = ra.id;
    itemA = (
      await prisma.roadmapItem.create({
        data: {
          userId: a.id,
          roadmapId: ra.id,
          section: 'S',
          kind: 'CONCEPT',
          title: 'My item',
          ordering: 1,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.$disconnect();
  });
  const refused = (p: Promise<unknown>) => expect(p).rejects.toThrow();
  const edit = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: 'changed',
    section: 'S',
    kind: 'CONCEPT',
    notes: '',
    url: '',
    askedNote: '',
    ...extra,
  });

  it("refuses every write to another owner's item", async () => {
    await refused(applyItemOp(a, { id: itemB, op: 'done' }));
    await refused(applyItemOp(a, { id: itemB, op: 'remove' }));
    await refused(saveItem(a, edit(itemB)));
    await refused(saveItemNotes(a, { id: itemB, notes: 'changed' }));
    await refused(saveItemAskedNote(a, { id: itemB, askedNote: 'changed' }));
    const item = await prisma.roadmapItem.findUniqueOrThrow({
      where: { id: itemB },
    });
    expect([item.title, item.status, item.notes]).toEqual([
      'Their item',
      'NOT_STARTED',
      null,
    ]);
  });

  it("refuses writes to another owner's roadmap and card, and hides the roadmap", async () => {
    await refused(
      addItems(a, { roadmapId: roadmapB, section: 'S', lines: 'x' }),
    );
    await refused(saveRoadmap(a, { id: roadmapB, title: 'changed' }));
    await refused(deleteRoadmap(a, roadmapB));
    await refused(removeCard(a, cardB));
    expect(await roadmapDetail(a, roadmapB)).toBeNull();
    expect(
      (await prisma.roadmap.findUniqueOrThrow({ where: { id: roadmapB } }))
        .title,
    ).toBe('Theirs');
    expect(
      await prisma.roadmapItem.count({ where: { roadmapId: roadmapB } }),
    ).toBe(1);
    expect(await prisma.revisionCard.count({ where: { id: cardB } })).toBe(1);
  });

  it('refuses a tampered Undo that names another owner or an unknown kind', async () => {
    await refused(
      restore(a, 'restore-roadmap-state', {
        id: itemB,
        status: 'DONE',
        revisionStage: 0,
      }),
    );
    await refused(
      restore(a, 'restore-roadmap-item', {
        roadmapId: roadmapB,
        section: 'S',
        kind: 'CONCEPT',
        title: 'planted',
        priority: 2,
        status: 'NOT_STARTED',
        askedInInterview: false,
        ordering: 1,
        revisionStage: 0,
      }),
    );
    await refused(
      restore(a, 'restore-card', {
        roadmapItemId: itemB,
        question: 'planted',
        points: ['p1', 'p2', 'p3'],
      }),
    );
    await refused(restore(a, 'nonsense-kind', {}));
    expect(await prisma.roadmapItem.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.revisionCard.count({ where: { userId: b.id } })).toBe(
      1,
    );
  });

  it("refuses a link to another owner's topic and any link that is not https", async () => {
    await refused(saveItem(a, edit(itemA, { link: `learning:${topicB}` })));
    expect(() =>
      itemInput.parse(edit(itemA, { url: 'javascript:alert(1)' })),
    ).toThrow();
    expect(() =>
      itemInput.parse(edit(itemA, { url: 'data:text/html,x' })),
    ).toThrow();
    expect(() =>
      itemInput.parse(edit(itemA, { section: 'x'.repeat(121) })),
    ).toThrow();
    expect(() => parseReferenceLines('x | javascript:alert(1)')).toThrow();
    expect(() => parseReferenceLines('x | data:text/html,x')).toThrow();
    expect(
      itemInput.parse(edit(itemA, { url: 'https://example.com/a' })).url,
    ).toBe('https://example.com/a');
    // The owner's own item still saves.
    expect((await saveItem(a, edit(itemA))).title).toBe('changed');
    expect(roadmapA).not.toBe('');
  });
});
