import {
  afterAll,
  afterEach,
  beforeAll,
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
vi.mock('@/server/memo', () => ({
  memo: (_u: string, _k: string, load: () => unknown) => load(),
  forgetAll: () => undefined,
}));
import { revisionDeck } from '../src/features/ai/service';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-27', '15:00', zone);
describe.skipIf(!url)('Revision deck (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'c'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    delete process.env.STUDY_AI_ENABLED;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `deck-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Deck', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('builds the deck from kept cards on items due today only', async () => {
    const roadmap = await prisma.roadmap.create({
      data: { userId: user.id, title: 'System design', studyAi: true },
    });
    const item = (
      title: string,
      due: string | null,
      status: 'DONE' | 'NOT_STARTED' = 'DONE',
    ) =>
      prisma.roadmapItem.create({
        data: {
          userId: user.id,
          roadmapId: roadmap.id,
          section: 'S',
          title,
          status,
          nextRevisionAt: due ? new Date(due) : null,
        },
      });
    const overdue = await item('Rate limiter', '2026-10-25');
    const today = await item('Caching', '2026-10-27');
    const later = await item('Queues', '2026-11-03');
    const noCards = await item('Sharding', '2026-10-27');
    const card = (itemId: string, q: string) =>
      prisma.revisionCard.create({
        data: {
          userId: user.id,
          roadmapItemId: itemId,
          question: q,
          points: ['one point', 'two points', 'three points'],
        },
      });
    await card(today.id, 'Where does a read-through cache sit?');
    await card(overdue.id, 'How would you limit each user?');
    await card(later.id, 'Not due yet: never in the deck?');
    const deck = await revisionDeck(user, now);
    expect(deck.items.map((i) => i.title)).toEqual(['Rate limiter', 'Caching']);
    expect(deck.cards.map((c) => c.question)).toEqual([
      'How would you limit each user?',
      'Where does a read-through cache sit?',
    ]);
    expect(deck.items.some((i) => i.id === noCards.id)).toBe(false);
  });
});
