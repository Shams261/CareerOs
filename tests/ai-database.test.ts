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
import {
  AiRefusal,
  AiUnavailable,
  aiState,
  checkAgain,
  dailyProviderCheck,
  grill,
  keepCard,
  removeCard,
} from '../src/features/ai/service';
import { CAP_MICROS, ENDPOINT, MODEL } from '../src/features/ai/domain';
import { restore } from '../src/features/undo/service';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = new Date('2026-10-27T15:00:00Z');
const ticks = { title: true, scope: true, checkpoint: true, references: false };
const rung = (i: number) => ({
  question: `Question number ${i}: how would this behave under load?`,
  change: i ? `Change ${i}` : 'Starting point',
  points: ['First point', 'Second point', 'Third point'],
});
const goodLadder = JSON.stringify({ rungs: [0, 1, 2, 3, 4].map(rung) });
const zdrList = { data: [{ model_id: MODEL, tag: ENDPOINT }] };
const endpointList = {
  data: {
    endpoints: [
      {
        tag: ENDPOINT,
        supported_parameters: [
          'max_tokens',
          'response_format',
          'structured_outputs',
          'tools',
          'tool_choice',
        ],
        pricing: { prompt: '0.0000001', completion: '0.0000005' },
      },
    ],
  },
};

/** A fake OpenRouter: public lists and a queue of chat answers; it records every request. */
function fakeRouter(
  answers: {
    content?: string;
    provider?: string;
    status?: number;
    finish?: string;
  }[],
  lists = { zdr: zdrList, endpoints: endpointList },
) {
  const calls: { url: string; body?: unknown; auth?: string | null }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('authorization'),
    });
    if (u.endsWith('/endpoints/zdr')) return Response.json(lists.zdr);
    if (u.includes('/models/')) return Response.json(lists.endpoints);
    const a = answers.shift() ?? { status: 500 };
    if (a.status) return new Response('error', { status: a.status });
    return Response.json({
      provider: a.provider ?? 'Google',
      usage: { prompt_tokens: 600, completion_tokens: 800, cost: 0.00046 },
      choices: [
        { message: { content: a.content }, finish_reason: a.finish ?? 'stop' },
      ],
    });
  }) as typeof fetch;
  return {
    fetcher,
    calls,
    chats: () => calls.filter((c) => c.url.endsWith('/chat/completions')),
  };
}

describe.skipIf(!url)('Grill Me (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  let item: { id: string };
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    delete process.env.STUDY_AI_ENABLED;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `grill-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Grill', timezone: zone },
    });
    const roadmap = await prisma.roadmap.create({
      data: { userId: user.id, title: 'System design', studyAi: true },
    });
    item = await prisma.roadmapItem.create({
      data: {
        userId: user.id,
        roadmapId: roadmap.id,
        section: 'Building blocks',
        title: 'Rate limiter',
        scope: 'Token bucket, sliding window, per-user keys.',
        checkpoint: 'Explain the trade-offs out loud.',
        notes: 'PRIVATE-NOTE recruiter said the team uses Redis',
        askedInInterview: true,
        askedNote: 'PRIVATE-ASKED Northwind phone screen',
        url: 'https://example.com/PRIVATE-URL',
      },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  // Every row shares the request's `now`, so the id (a cuid, rising in creation order)
  // keeps the order stable.
  const usage = () =>
    prisma.aiUsage.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

  it('sends only the ticked fields, once, and records cost without content', async () => {
    const r = fakeRouter([{ content: goodLadder }]);
    const ladder = await grill(user, item.id, ticks, now, r.fetcher);
    expect(ladder.rungs).toHaveLength(5);
    const [chat] = r.chats();
    expect(chat.auth).toMatch(/^Bearer sk-or-/);
    const sent = JSON.stringify(chat.body);
    for (const secret of [
      'PRIVATE-NOTE',
      'PRIVATE-ASKED',
      'PRIVATE-URL',
      'Building blocks',
    ])
      expect(sent).not.toContain(secret);
    expect((chat.body as { provider: unknown }).provider).toMatchObject({
      only: [ENDPOINT],
      allow_fallbacks: false,
      zdr: true,
    });
    const rows = await usage();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outcome: 'OK',
      model: MODEL,
      provider: ENDPOINT,
      inputTokens: 600,
      outputTokens: 800,
      costMicros: 460,
    });
    // The public lists are read without the key.
    expect(
      r.calls
        .filter((c) => !c.url.endsWith('/chat/completions'))
        .every((c) => !c.auth),
    ).toBe(true);
    expect((await aiState(user, now)).spent).toBe(460);
  });

  it('sends nothing once the month’s budget is used', async () => {
    await prisma.aiUsage.create({
      data: {
        userId: user.id,
        feature: 'GRILL_ITEM',
        model: MODEL,
        provider: ENDPOINT,
        costMicros: CAP_MICROS - 100,
        outcome: 'OK',
        createdAt: new Date('2026-10-05T12:00:00Z'),
      },
    });
    const r = fakeRouter([{ content: goodLadder }]);
    await expect(grill(user, item.id, ticks, now, r.fetcher)).rejects.toThrow(
      /budget is used. Grill Me returns on Nov 1/,
    );
    expect(r.chats()).toHaveLength(0);
  });

  it('retries once on a malformed ladder, then gives up calmly', async () => {
    const r = fakeRouter([
      { content: '{"rungs":[]}' },
      { content: goodLadder },
    ]);
    await grill(user, item.id, ticks, now, r.fetcher);
    expect((await usage()).map((u) => u.outcome)).toEqual(['FAILED', 'OK']);
    const retry = r.chats()[1].body as {
      messages: { role: string; content: string }[];
    };
    expect(retry.messages.at(-1)!.content).toMatch(/did not match/);
    // The rejected answer is never sent back.
    expect(retry.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'user',
    ]);

    const bad = fakeRouter([{ content: 'nope' }, { content: 'nope' }]);
    await expect(
      grill(user, item.id, ticks, now, bad.fetcher),
    ).rejects.toBeInstanceOf(AiUnavailable);
    expect(bad.chats()).toHaveLength(2);
  });

  it('asks again, briefly, when an answer is cut off at the ceiling', async () => {
    const r = fakeRouter([
      { content: goodLadder.slice(0, 300), finish: 'length' },
      { content: goodLadder },
    ]);
    const ladder = await grill(user, item.id, ticks, now, r.fetcher);
    expect(ladder.rungs).toHaveLength(5);
    const retry = r.chats()[1].body as {
      max_tokens: number;
      messages: { role: string; content: string }[];
    };
    expect(retry.max_tokens).toBe(2000);
    // The cut-off text is not sent back; only a request to be brief.
    expect(retry.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'user',
    ]);
    expect(retry.messages.at(-1)!.content).toMatch(/cut off/);
  });

  it('blocks AI when an answer comes from another provider, until the owner checks again', async () => {
    const r = fakeRouter([{ content: goodLadder, provider: 'Anthropic' }]);
    await expect(
      grill(user, item.id, ticks, now, r.fetcher),
    ).rejects.toBeInstanceOf(AiUnavailable);
    expect((await aiState(user, now)).blocked).toMatch(
      /outside the pinned endpoint/,
    );
    const again = fakeRouter([{ content: goodLadder }]);
    await expect(
      grill(user, item.id, ticks, now, again.fetcher),
    ).rejects.toBeInstanceOf(AiRefusal);
    expect(again.chats()).toHaveLength(0);
    // The daily check never lifts a block; the owner's check does when it passes.
    await prisma.jobRun.deleteMany({ where: { name: 'ai-provider-check' } });
    await dailyProviderCheck(now, again.fetcher);
    expect((await aiState(user, now)).blocked).not.toBeNull();
    expect((await checkAgain(user, now, again.fetcher)).ok).toBe(true);
    expect((await aiState(user, now)).blocked).toBeNull();
  });

  it('blocks AI when the endpoint leaves the ZDR list', async () => {
    const r = fakeRouter([{ content: goodLadder }], {
      zdr: { data: [] },
      endpoints: endpointList,
    });
    await expect(
      grill(user, item.id, ticks, now, r.fetcher),
    ).rejects.toBeInstanceOf(AiRefusal);
    expect(r.chats()).toHaveLength(0);
    expect((await aiState(user, now)).blocked).toMatch(/zero data retention/);
  });

  it('refuses without a call: Study AI off, test records, a title only, the hourly limit', async () => {
    const r = fakeRouter([]);
    await prisma.roadmap.updateMany({
      where: { userId: user.id },
      data: { studyAi: false },
    });
    await expect(grill(user, item.id, ticks, now, r.fetcher)).rejects.toThrow(
      /Study AI is off/,
    );
    await prisma.roadmap.updateMany({
      where: { userId: user.id },
      data: { studyAi: true },
    });
    await prisma.roadmapItem.update({
      where: { id: item.id },
      data: { title: 'TEST item' },
    });
    await expect(grill(user, item.id, ticks, now, r.fetcher)).rejects.toThrow(
      /test records/,
    );
    await prisma.roadmapItem.update({
      where: { id: item.id },
      data: { title: 'Rate limiter', scope: null, checkpoint: null },
    });
    await expect(grill(user, item.id, ticks, now, r.fetcher)).rejects.toThrow(
      /scope or/,
    );
    await prisma.roadmapItem.update({
      where: { id: item.id },
      data: { scope: 'Token bucket' },
    });
    await prisma.aiUsage.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId: user.id,
        feature: 'GRILL_ITEM' as const,
        model: MODEL,
        provider: ENDPOINT,
        costMicros: 1,
        outcome: 'OK' as const,
        createdAt: new Date(+now - i * 60_000),
      })),
    });
    await expect(grill(user, item.id, ticks, now, r.fetcher)).rejects.toThrow(
      /enough Grill Me/,
    );
    expect(r.chats()).toHaveLength(0);
    // Another owner's item is never reachable.
    const other = await prisma.user.create({
      data: {
        id: `o-${randomUUID()}`,
        email: `${randomUUID()}@example.com`,
        name: 'O',
      },
    });
    await expect(
      grill({ id: other.id, timezone: zone }, item.id, ticks, now, r.fetcher),
    ).rejects.toThrow(/no longer exists/);
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('has no AI at all without a key', async () => {
    const key = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      expect((await aiState(user, now)).configured).toBe(false);
      await expect(
        grill(user, item.id, ticks, now, fakeRouter([]).fetcher),
      ).rejects.toBeInstanceOf(AiRefusal);
    } finally {
      process.env.OPENROUTER_API_KEY = key;
    }
  });

  it('keeps a card once, removes it, and Undo keeps it again', async () => {
    const r = rung(2);
    const first = await keepCard(user, { itemId: item.id, ...r });
    expect(first.created).toBe(true);
    expect((await keepCard(user, { itemId: item.id, ...r })).created).toBe(
      false,
    );
    const removed = await removeCard(user, first.card.id);
    expect(
      await prisma.revisionCard.count({ where: { userId: user.id } }),
    ).toBe(0);
    await restore(user, 'restore-card', {
      itemId: removed.roadmapItemId,
      question: removed.question,
      change: removed.change ?? '',
      points: removed.points,
    });
    expect(
      await prisma.revisionCard.findFirstOrThrow({
        where: { userId: user.id },
      }),
    ).toMatchObject({ question: r.question, points: r.points });
  });
});
