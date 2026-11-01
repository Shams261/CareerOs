import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
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
import { undoWrite } from '../src/features/agent/writes';
import { applyRequest, undoRequest } from '../src/features/agent/requests';
import { runTool } from '../src/features/agent/tools';
import { collectIds } from '../src/features/agent/write-domain';
import { restore } from '../src/features/undo/service';
import { localInstant } from '../src/lib/time';

/**
 * Rumi's writes stay inside the signed-in owner's records (WI-102): reads hand the model only
 * the owner's ids, Undo runs only from the owner's own answer, and a stored action that was
 * tampered with never reaches another owner's rows.
 */
const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-11-03';
const now = localInstant(day, '10:00', zone);

describe.skipIf(!url)('Rumi writes are owner-scoped (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let owner: { id: string; timezone: string };
  let other: { id: string; timezone: string };
  beforeAll(() => undefined);
  afterAll(() => prisma.$disconnect());
  const make = (name: string) => {
    const id = `${name}-${randomUUID()}`;
    return prisma.user.create({
      data: { id, email: `${id}@example.com`, name, timezone: zone },
    });
  };
  const seed = async (userId: string, title: string) => {
    const plan = await prisma.dailyPlan.create({
      data: { userId, date: new Date(day) },
    });
    const block = await prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category: 'DSA',
        plannedStart: localInstant(day, '18:00', zone),
        plannedEnd: localInstant(day, '19:00', zone),
      },
    });
    const topic = await prisma.dsaTopic.create({
      data: { name: `Arrays ${title} ${randomUUID()}` },
    });
    const problem = await prisma.dsaProblem.create({
      data: {
        userId,
        topicId: topic.id,
        title: `Two Sum ${title}`,
        platform: 'LEETCODE',
        problemUrl: '',
        difficulty: 'EASY',
      },
    });
    const note = await prisma.quickNote.create({
      data: { userId, body: `Note ${title}` },
    });
    return { block, problem, note };
  };
  const answer = (userId: string, actions: object[]) =>
    prisma.agentConversation
      .create({ data: { userId, title: 'T' } })
      .then((c) =>
        prisma.agentMessage.create({
          data: {
            conversationId: c.id,
            userId,
            role: 'ASSISTANT',
            content: 'Done.',
            metadata: { actions } as object,
          },
        }),
      );
  beforeEach(async () => {
    owner = await make('sec-owner');
    other = await make('sec-other');
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  });

  it('hands the model only the owner’s ids', async () => {
    const mine = await seed(owner.id, 'MINE');
    const theirs = await seed(other.id, 'THEIRS');
    const seen = new Set<string>();
    collectIds(await runTool(owner, 'get_today', {}, now), seen);
    collectIds(
      await runTool(owner, 'find_problems', { text: 'two sum' }, now),
      seen,
    );
    expect(seen.has(mine.block.id)).toBe(true);
    expect(seen.has(mine.problem.id)).toBe(true);
    for (const id of [theirs.block.id, theirs.problem.id, theirs.note.id])
      expect(seen.has(id)).toBe(false);
  });

  it('refuses Undo on another owner’s answer', async () => {
    const theirs = await seed(other.id, 'THEIRS');
    const msg = await answer(other.id, [
      {
        id: 'w1',
        tool: 'add_note',
        label: 'Note added',
        detail: 'x',
        undo: { kind: 'remove-note', payload: { id: theirs.note.id } },
        status: 'done',
      },
    ]);
    await expect(
      undoWrite(owner, msg.id, 'w1', (k, p) => restore(owner, k, p)),
    ).rejects.toThrow(/no longer exists/);
    expect(
      await prisma.quickNote.count({ where: { id: theirs.note.id } }),
    ).toBe(1);
  });

  it('refuses a card press or its Undo on another owner’s answer', async () => {
    const theirs = await seed(other.id, 'THEIRS');
    const conv = await prisma.agentConversation.create({
      data: { userId: other.id, title: 'T' },
    });
    const cardId = randomUUID();
    const msg = await prisma.agentMessage.create({
      data: {
        conversationId: conv.id,
        userId: other.id,
        role: 'ASSISTANT',
        content: 'Card.',
        metadata: {
          requests: [
            {
              id: cardId,
              kind: 'delete_block',
              args: { blockId: theirs.block.id },
              summary: ['x'],
              snapshot: { version: theirs.block.updatedAt.toISOString() },
              status: 'shown',
            },
          ],
        } as object,
      },
    });
    await expect(applyRequest(owner, msg.id, cardId, now)).rejects.toThrow(
      /no longer exists/,
    );
    await expect(
      undoRequest(owner, msg.id, cardId, async () => 'ran'),
    ).rejects.toThrow(/Nothing to undo/);
    const block = await prisma.timeBlock.findUnique({
      where: { id: theirs.block.id },
    });
    expect(block?.status).toBe('PLANNED');
  });

  it('never lets a card on the owner’s answer reach another owner’s block', async () => {
    const theirs = await seed(other.id, 'THEIRS');
    const conv = await prisma.agentConversation.create({
      data: { userId: owner.id, title: 'T' },
    });
    const cardId = randomUUID();
    const msg = await prisma.agentMessage.create({
      data: {
        conversationId: conv.id,
        userId: owner.id,
        role: 'ASSISTANT',
        content: 'Card.',
        metadata: {
          requests: [
            {
              id: cardId,
              kind: 'delete_block',
              args: { blockId: theirs.block.id },
              summary: ['x'],
              snapshot: { version: theirs.block.updatedAt.toISOString() },
              status: 'shown',
            },
          ],
        } as object,
      },
    });
    await expect(applyRequest(owner, msg.id, cardId, now)).rejects.toThrow(
      /records changed/,
    );
    const block = await prisma.timeBlock.findUnique({
      where: { id: theirs.block.id },
    });
    expect(block?.status).toBe('PLANNED');
  });

  it('never lets a tampered action touch another owner’s rows', async () => {
    const theirs = await seed(other.id, 'THEIRS');
    // The owner's own answer, edited to point at another owner's note and block.
    const msg = await answer(owner.id, [
      {
        id: 'w1',
        tool: 'add_note',
        label: 'Note added',
        detail: 'x',
        undo: { kind: 'remove-note', payload: { id: theirs.note.id } },
        status: 'done',
      },
      {
        id: 'w2',
        tool: 'add_block',
        label: 'Block added',
        detail: 'x',
        undo: { kind: 'cancel-block', payload: { id: theirs.block.id } },
        status: 'done',
      },
      {
        // A swapped undo kind is not read at all.
        id: 'w3',
        tool: 'add_note',
        label: 'Note added',
        detail: 'x',
        undo: { kind: 'cancel-block', payload: { id: theirs.block.id } },
        status: 'done',
      },
    ]);
    await expect(
      undoWrite(owner, msg.id, 'w1', (k, p) => restore(owner, k, p)),
    ).rejects.toThrow();
    await expect(
      undoWrite(owner, msg.id, 'w2', (k, p) => restore(owner, k, p)),
    ).rejects.toThrow();
    await expect(
      undoWrite(owner, msg.id, 'w3', (k, p) => restore(owner, k, p)),
    ).rejects.toThrow(/not on the answer/);
    expect(
      await prisma.quickNote.count({ where: { id: theirs.note.id } }),
    ).toBe(1);
    const block = await prisma.timeBlock.findUnique({
      where: { id: theirs.block.id },
    });
    expect(block?.status).toBe('PLANNED');
  });
});
