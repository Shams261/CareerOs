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
import { draftWeek, nextWeek } from '../src/features/agent/draft';
import { applyProposal } from '../src/features/agent/plans';
import { readMetadata } from '../src/features/agent/plan-domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
// Sunday 1 November 2026; next week is 2 to 8 November.
const now = localInstant('2026-11-01', '10:00', zone);
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
type Call = { day: string; blocks: unknown[] };
function fakeRouter(calls: Call[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    bodies.push(JSON.parse(String(init!.body)));
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 2500, completion_tokens: 300, cost: 0.0004 },
      choices: [
        {
          message: {
            content: 'A steady week.',
            tool_calls: calls.map((c, i) => ({
              id: `call_${i}`,
              type: 'function',
              function: {
                name: 'propose_blocks',
                arguments: JSON.stringify(c),
              },
            })),
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, bodies };
}
const block = (title: string, start: string, end: string) => ({
  title,
  kind: 'DSA',
  start,
  end,
  reason: 'Weekly mix',
});

describe('the week draft (WI-107)', () => {
  it('plans the Monday to Sunday after today', () => {
    expect(nextWeek('2026-11-01')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(nextWeek('2026-10-28')[0]).toBe('2026-11-02');
  });
});

describe.skipIf(!url)('the week draft (WI-107, PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const saved = { ...process.env };
  let user: { id: string; timezone: string };
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const id = `draft-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'D', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });
  const prepare = async () => {
    for (const day of nextWeek('2026-11-01'))
      await prisma.dailyPlan.create({
        data: { userId: user.id, date: new Date(day), generatedAt: now },
      });
    const monday = await prisma.dailyPlan.findFirstOrThrow({
      where: { userId: user.id, date: new Date('2026-11-02') },
    });
    // A routine on Monday evening is taken time.
    await prisma.timeBlock.create({
      data: {
        dailyPlanId: monday.id,
        title: 'Gym',
        category: 'GYM',
        plannedStart: localInstant('2026-11-02', '20:00', zone),
        plannedEnd: localInstant('2026-11-02', '21:00', zone),
      },
    });
  };

  it('waits for next week to be prepared', async () => {
    const r = fakeRouter([]);
    await expect(draftWeek(user, now, r.fetcher)).rejects.toThrow(
      /Prepare next week/,
    );
    expect(r.bodies).toHaveLength(0);
  });

  it('makes one checked card a day of next week from one call, and adds nothing', async () => {
    await prepare();
    const r = fakeRouter([
      {
        day: '2026-11-02',
        blocks: [
          block('Graphs', '20:30', '21:30'),
          block('Heaps', '21:30', '22:00'),
        ],
      },
      { day: '2026-11-02', blocks: [block('Twice', '07:00', '08:00')] },
      { day: '2026-11-04', blocks: [block('System design', '19:00', '20:00')] },
      { day: '2026-11-09', blocks: [block('Too late', '19:00', '20:00')] },
    ]);
    const id = await draftWeek(user, now, r.fetcher);
    // The model saw the days with their taken time, the mix and only the draft tool.
    const body = r.bodies[0] as {
      tools: { function: { name: string } }[];
      messages: { content: string }[];
    };
    expect(body.tools.map((t) => t.function.name)).toEqual(['propose_blocks']);
    const data = JSON.parse(body.messages[1].content);
    expect(data.days[0]).toMatchObject({
      day: '2026-11-02',
      weekday: 'Monday',
      taken: ['20:00–21:00 busy'],
    });
    expect(data.weeklyMix.length).toBeGreaterThan(0);
    const message = await prisma.agentMessage.findFirstOrThrow({
      where: { conversationId: id },
    });
    const proposals = readMetadata(message.metadata).proposals;
    expect(proposals.map((p) => p.day)).toEqual(['2026-11-02', '2026-11-04']);
    expect(proposals[0].blocks.map((b) => b.conflict ?? 'ok')).toEqual([
      'Overlaps 20:00–21:00 busy',
      'ok',
    ]);
    expect(
      await prisma.timeBlock.count({
        where: { dailyPlan: { userId: user.id }, category: 'DSA' },
      }),
    ).toBe(0);
    // Add to plan with a changed time and a block the owner added.
    const { ids } = await applyProposal(
      user,
      message.id,
      proposals[0].id,
      now,
      [],
      {
        edits: [{ i: 1, start: '21:15', end: '21:45' }],
        extra: [
          {
            title: 'Behavioural story',
            kind: 'Behavioural',
            start: '07:00',
            end: '07:30',
          },
        ],
      },
    );
    const added = await prisma.timeBlock.findMany({
      where: { id: { in: ids } },
      orderBy: { plannedStart: 'asc' },
    });
    expect(added.map((b) => b.title)).toEqual(['Behavioural story', 'Heaps']);
    expect(added[1].plannedStart).toEqual(
      localInstant('2026-11-02', '21:15', zone),
    );
  });

  it('refuses a changed time that lands on taken time', async () => {
    await prepare();
    const r = fakeRouter([
      { day: '2026-11-02', blocks: [block('Graphs', '07:00', '08:00')] },
    ]);
    const id = await draftWeek(user, now, r.fetcher);
    const message = await prisma.agentMessage.findFirstOrThrow({
      where: { conversationId: id },
    });
    const [p] = readMetadata(message.metadata).proposals;
    await expect(
      applyProposal(user, message.id, p.id, now, [], {
        edits: [{ i: 0, start: '20:15', end: '20:45' }],
      }),
    ).rejects.toThrow(/Your day changed|Overlaps/);
  });
});
