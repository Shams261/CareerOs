import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import { restore } from '../src/features/undo/service';
import { addNote, noteOp, openNotes } from '../src/features/notes/service';
import {
  addItems,
  applyItemOp,
  roadmapDetail,
  saveRoadmap,
} from '../src/features/roadmap/service';
import { generatePlan } from '../src/features/schedule/service';
import { saveBlock } from '../src/features/schedule/editing';
import { execute } from '../src/features/execution/service';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('undo restores what a one-click action removed', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const user = { id: `undo-${randomUUID()}`, timezone: 'America/Toronto' },
    other = { id: `undo-${randomUUID()}`, timezone: 'America/Toronto' };
  beforeAll(async () => {
    for (const u of [user, other])
      await prisma.user.create({
        data: { id: u.id, email: `${u.id}@example.com`, name: 'T' },
      });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  it('brings back a removed note', async () => {
    const note = await addNote(user, { body: 'Call the recruiter' });
    const { note: removed } = await noteOp(user, { id: note.id, op: 'remove' });
    expect(await openNotes(user.id)).toHaveLength(0);
    expect(await restore(user, 'restore-note', { body: removed.body })).toBe(
      'Note restored.',
    );
    expect((await openNotes(user.id)).map((n) => n.body)).toEqual([
      'Call the recruiter',
    ]);
  });
  it('brings back a removed roadmap item with its marks, under the owner only', async () => {
    const roadmap = await saveRoadmap(user, { title: 'Roadmap' });
    await addItems(user, {
      roadmapId: roadmap.id,
      section: 'System design',
      lines: 'CAP theorem',
    });
    const item = (await roadmapDetail(user, roadmap.id))!.items[0];
    await applyItemOp(user, { id: item.id, op: 'done' });
    await applyItemOp(user, { id: item.id, op: 'asked' });
    const { item: removed } = await applyItemOp(user, {
      id: item.id,
      op: 'remove',
    });
    const payload = {
      roadmapId: removed.roadmapId,
      section: removed.section,
      kind: removed.kind,
      title: removed.title,
      status: removed.status,
      askedInInterview: removed.askedInInterview,
      ordering: removed.ordering,
    };
    await expect(
      restore(other, 'restore-roadmap-item', payload),
    ).rejects.toThrow('no longer exists');
    expect(await restore(user, 'restore-roadmap-item', payload)).toBe(
      'Item restored.',
    );
    const back = (await roadmapDetail(user, roadmap.id))!.items;
    expect(back.map((i) => [i.title, i.status, i.askedInInterview])).toEqual([
      ['CAP theorem', 'DONE', true],
    ]);
    expect(back[0].completedAt).not.toBeNull();
  });
  it('resets a skipped block to planned', async () => {
    await generatePlan(user, '2030-03-04');
    await saveBlock(
      user,
      {
        title: 'Study',
        category: 'DSA',
        day: '2030-03-04',
        endDay: '2030-03-04',
        startLocal: '09:00',
        endLocal: '10:00',
        priority: 2,
        description: '',
        goalId: '',
      },
      false,
    );
    const block = await prisma.timeBlock.findFirstOrThrow({
      where: { dailyPlan: { userId: user.id }, title: 'Study' },
    });
    await execute(user, block.id, 'skip', 'Ran late');
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: block.id } }))
        .status,
    ).toBe('SKIPPED');
    expect(await restore(user, 'block-reset', { id: block.id })).toBe(
      'Block restored.',
    );
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: block.id } }))
        .status,
    ).toBe('PLANNED');
    await expect(restore(user, 'nonsense', {})).rejects.toThrow(
      'Nothing to undo',
    );
  });
});
