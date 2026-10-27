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
import { listen } from '../src/features/listen/service';
import { AiRefusal, AiUnavailable } from '../src/features/ai/service';
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
          'tools',
          'tool_choice',
        ],
        pricing: { prompt: '0.0000001', completion: '0.0000005' },
      },
    ],
  },
};
const PAGES: Record<string, string> = {
  'https://www.postgresql.org/docs/current/mvcc-intro.html': `<nav><p>Documentation home and download links for every supported release</p></nav>
    <p>PostgreSQL maintains data consistency with a multiversion model, so each transaction sees a snapshot of data as it was some time ago.</p>
    <p>Reading never blocks writing and writing never blocks reading, because readers use their snapshot of committed row versions.</p>
    <p>Row versions let readers keep a snapshot while writers add new versions, so neither blocks the other during long reads.</p>`,
  'https://www.postgresql.org/docs/current/transaction-iso.html': `<p>Each snapshot shows only row versions committed before the transaction began, so readers see a stable view while writers continue.</p>
    <p>Writers create new row versions instead of overwriting, which is why readers never block writers in this snapshot model.</p>`,
  'https://www.hellointerview.com/learn/mvcc': `<p>MVCC keeps several versions of each row so a transaction reads a consistent snapshot while writers create new versions.</p>`,
};

function web(
  answer: (sent: { messages: { content: string }[] }) => unknown,
  finishes: string[] = [],
) {
  const fetched: string[] = [];
  const chats: { max_tokens?: number; messages: { content: string }[] }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdr);
    if (u.includes('/models/')) return Response.json(endpoints);
    if (u.endsWith('/chat/completions')) {
      const sent = JSON.parse(String(init?.body));
      chats.push(sent);
      return Response.json({
        provider: 'Google',
        usage: { prompt_tokens: 900, completion_tokens: 400, cost: 0.00029 },
        choices: [
          finishes.length
            ? {
                // A cut-off answer: the JSON never closes.
                message: { content: '{"lines":[{"text":"HTTP' },
                finish_reason: finishes.shift(),
              }
            : {
                message: { content: JSON.stringify(answer(sent)) },
                finish_reason: 'stop',
              },
        ],
      });
    }
    fetched.push(u);
    if (u === 'https://redis.io/docs/moved')
      return new Response(null, {
        status: 301,
        headers: { location: 'https://evil.example/steal' },
      });
    const page = PAGES[u];
    return page
      ? new Response(page, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      : new Response('missing', { status: 404 });
  }) as typeof fetch;
  return { fetcher, fetched, chats };
}
/** A script that cites what it was sent: each passage's own first sentence. */
const faithful = (sent: { messages: { content: string }[] }) => {
  const { passages } = JSON.parse(sent.messages[1].content) as {
    passages: { id: string; text: string }[];
  };
  const lines = passages.map((p) => ({ text: p.text, sources: [p.id] }));
  lines.push({
    text: 'Quantum annealing guarantees zero downtime for every rollout.',
    sources: ['P1'],
  });
  return { lines };
};

describe.skipIf(!url)('Listen (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'d'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    delete process.env.STUDY_AI_ENABLED;
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `listen-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'Listen', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  const item = async (references: unknown, title = 'MVCC and snapshots') => {
    const roadmap = await prisma.roadmap.create({
      data: { userId: user.id, title: 'Databases', studyAi: true },
    });
    return prisma.roadmapItem.create({
      data: {
        userId: user.id,
        roadmapId: roadmap.id,
        section: 'Transactions',
        title,
        scope: 'Snapshot reads, row versions, writers and readers',
        checkpoint: 'Explain why readers never block writers.',
        notes: 'PRIVATE-NOTE the interviewer at Northwind asked this',
        askedNote: 'PRIVATE-ASKED Northwind onsite',
        references: references as object,
      },
    });
  };

  it('fetches listed sources, sends only item fields and passages, and keeps checked lines', async () => {
    const it1 = await item([
      {
        label: 'PostgreSQL MVCC',
        url: 'https://www.postgresql.org/docs/current/mvcc-intro.html',
      },
      {
        label: 'PostgreSQL isolation',
        url: 'https://www.postgresql.org/docs/current/transaction-iso.html',
      },
      {
        label: 'Hello Interview MVCC',
        url: 'https://www.hellointerview.com/learn/mvcc',
      },
      { label: 'Redis moved page', url: 'https://redis.io/docs/moved' },
      { label: 'A video', url: 'https://www.youtube.com/watch?v=x' },
    ]);
    const { fetcher, fetched, chats } = web(faithful);
    const script = await listen(user, it1.id, now, fetcher);
    // The video is never fetched, and the redirect off the list is not followed.
    expect(fetched.sort()).toEqual([
      'https://redis.io/docs/moved',
      'https://www.hellointerview.com/learn/mvcc',
      'https://www.postgresql.org/docs/current/mvcc-intro.html',
      'https://www.postgresql.org/docs/current/transaction-iso.html',
    ]);
    expect(chats).toHaveLength(1);
    const sent = JSON.stringify(chats[0]);
    expect(sent).not.toContain('PRIVATE-NOTE');
    expect(sent).not.toContain('PRIVATE-ASKED');
    expect(sent).not.toContain('youtube');
    const body = JSON.parse(chats[0].messages[1].content);
    expect(Object.keys(body).sort()).toEqual([
      'doneWhen',
      'passages',
      'scope',
      'topic',
    ]);
    expect(chats[0]).toMatchObject({
      model: MODEL,
      provider: { only: [ENDPOINT], zdr: true, allow_fallbacks: false },
    });
    // Official lines stay; the lone secondary line and the invented line are dropped.
    expect(script.lines.length).toBeGreaterThanOrEqual(4);
    expect(new Set(script.lines.map((l) => l.check))).toEqual(
      new Set(['official']),
    );
    expect(script.dropped).toBe(
      '2 lines dropped: 1 had no supporting passage, 1 had only one non-official source.',
    );
    expect(new Set(script.passages.map((p) => p.host))).toEqual(
      new Set(['postgresql.org']),
    );
    expect(script.failed).toEqual([
      { label: 'Redis moved page', host: 'redis.io' },
    ]);
    expect(script.skipped).toEqual([
      { label: 'A video', host: 'youtube.com', reason: 'not a checked source' },
    ]);
    const ledger = await prisma.aiUsage.findMany({
      where: { userId: user.id },
    });
    expect(ledger.map((r) => [r.feature, r.outcome])).toEqual([
      ['LISTEN_ITEM', 'OK'],
    ]);
  });

  it('asks a cut-off answer again in Listen’s own terms, without resending it', async () => {
    const it1 = await item([
      {
        label: 'PostgreSQL MVCC',
        url: 'https://www.postgresql.org/docs/current/mvcc-intro.html',
      },
      {
        label: 'PostgreSQL isolation',
        url: 'https://www.postgresql.org/docs/current/transaction-iso.html',
      },
    ]);
    const { fetcher, chats } = web(faithful, ['length']);
    const script = await listen(user, it1.id, now, fetcher);
    expect(script.lines.length).toBeGreaterThanOrEqual(4);
    expect(chats).toHaveLength(2);
    expect(chats[0].max_tokens).toBe(3000);
    const retry = chats[1].messages.at(-1)!.content;
    expect(retry).toContain('eight lines');
    expect(retry).not.toContain('questions');
    expect(JSON.stringify(chats[1].messages)).not.toContain(
      '{"lines":[{"text":"HTTP',
    );
  });

  it('refuses before spending when nothing checked can come of it', async () => {
    const none = await item([
      { label: 'A video', url: 'https://www.youtube.com/watch?v=x' },
    ]);
    const a = web(faithful);
    await expect(listen(user, none.id, now, a.fetcher)).rejects.toBeInstanceOf(
      AiRefusal,
    );
    expect(a.fetched).toEqual([]);
    const lone = await item(
      [
        {
          label: 'Hello Interview MVCC',
          url: 'https://www.hellointerview.com/learn/mvcc',
        },
      ],
      'MVCC alone',
    );
    const b = web(faithful);
    await expect(listen(user, lone.id, now, b.fetcher)).rejects.toThrow(
      /official documentation or two different sites/,
    );
    expect(b.chats).toHaveLength(0);
    const test = await item(
      [
        {
          label: 'PostgreSQL MVCC',
          url: 'https://www.postgresql.org/docs/current/mvcc-intro.html',
        },
      ],
      'UAT test item',
    );
    await expect(
      listen(user, test.id, now, web(faithful).fetcher),
    ).rejects.toThrow('Listen skips test records.');
    expect(await prisma.aiUsage.count({ where: { userId: user.id } })).toBe(0);
  });

  it('shows nothing when too little of the script survives the check', async () => {
    const it1 = await item([
      {
        label: 'PostgreSQL MVCC',
        url: 'https://www.postgresql.org/docs/current/mvcc-intro.html',
      },
      {
        label: 'Hello Interview MVCC',
        url: 'https://www.hellointerview.com/learn/mvcc',
      },
    ]);
    const { fetcher } = web(() => ({
      lines: Array.from({ length: 5 }, () => ({
        text: 'Quantum annealing guarantees zero downtime for every rollout.',
        sources: ['P1'],
      })),
    }));
    await expect(listen(user, it1.id, now, fetcher)).rejects.toBeInstanceOf(
      AiUnavailable,
    );
  });
});
