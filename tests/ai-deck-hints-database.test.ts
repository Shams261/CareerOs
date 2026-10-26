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
import {
  AiRefusal,
  AiUnavailable,
  problemHints,
  revisionDeck,
} from '../src/features/ai/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-27', '15:00', zone);
const zdr = { data: [{ model_id: MODEL, tag: ENDPOINT }] };
const endpoints = {
  data: {
    endpoints: [
      {
        tag: ENDPOINT,
        supported_parameters: [
          'max_tokens',
          'response_format',
          'structured_outputs',
        ],
        pricing: { prompt: '0.0000001', completion: '0.0000005' },
      },
    ],
  },
};
const hints = (text: string) =>
  JSON.stringify({
    hints: Array.from({ length: 5 }, (_, i) => ({
      focus: `Step ${i + 1}`,
      hint: text,
    })),
  });
function router(answers: string[]) {
  const chats: unknown[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdr);
    if (u.includes('/models/')) return Response.json(endpoints);
    chats.push(JSON.parse(String(init?.body)));
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 300, completion_tokens: 250, cost: 0.00016 },
      choices: [
        { message: { content: answers.shift() }, finish_reason: 'stop' },
      ],
    });
  }) as typeof fetch;
  return { fetcher, chats };
}

describe.skipIf(!url)('Revision deck and hints (PostgreSQL)', () => {
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

  async function problem(title = 'Two Sum') {
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Arrays & Hashing' },
      create: { name: 'Arrays & Hashing' },
      update: {},
    });
    return prisma.dsaProblem.create({
      data: {
        userId: user.id,
        title,
        platform: 'LeetCode',
        problemUrl: 'https://leetcode.com/problems/two-sum/',
        difficulty: 'EASY',
        topicId: topic.id,
        notes: 'PRIVATE-NOTE my own approach with a map',
      },
    });
  }

  it('sends only the problem’s four fields and records a hints request', async () => {
    const p = await problem();
    const r = router([
      hints('Think about which numbers you have already seen.'),
    ]);
    const out = await problemHints(user, p.id, now, r.fetcher);
    expect(out.hints).toHaveLength(5);
    const sent = JSON.stringify(r.chats[0]);
    expect(sent).not.toContain('PRIVATE-NOTE');
    expect(sent).not.toContain('leetcode.com/problems');
    expect(
      JSON.parse(
        (r.chats[0] as { messages: { content: string }[] }).messages[1].content,
      ),
    ).toEqual({
      problem: 'Two Sum',
      difficulty: 'Easy',
      platform: 'LeetCode',
      topic: 'Arrays & Hashing',
    });
    const usage = await prisma.aiUsage.findMany({ where: { userId: user.id } });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ feature: 'GRILL_PROBLEM', outcome: 'OK' });
  });

  it('never shows code: a hint with code is retried, then refused', async () => {
    const p = await problem();
    const code = hints(
      'Loop with for (let i = 0; i < n; i++) and check map[x].',
    );
    const ok = router([
      code,
      hints('A map from value to index answers in one pass.'),
    ]);
    expect(
      (await problemHints(user, p.id, now, ok.fetcher)).hints[0].hint,
    ).toMatch(/one pass/);
    const bad = router([code, code]);
    await expect(
      problemHints(user, p.id, now, bad.fetcher),
    ).rejects.toBeInstanceOf(AiUnavailable);
    const tested = await problem('TEST problem');
    await expect(
      problemHints(user, tested.id, now, router([]).fetcher),
    ).rejects.toBeInstanceOf(AiRefusal);
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
