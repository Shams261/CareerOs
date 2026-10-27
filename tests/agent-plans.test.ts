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
vi.mock('next/server', () => ({ after: () => undefined }));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  checkBlocks,
  kindFor,
  patternLine,
  patterns,
  planWindow,
  proposeArgs,
  readMetadata,
} from '../src/features/agent/plan-domain';
import { readToolCall } from '../src/features/agent/domain';
import { sendMessage } from '../src/features/agent/service';
import {
  answerSuggestion,
  applyProposal,
  dismissProposal,
} from '../src/features/agent/plans';
import { getPatterns } from '../src/features/agent/tools';
import { restore } from '../src/features/undo/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const zone = 'America/Toronto';
const day = '2026-10-27'; // a Tuesday
const now = localInstant(day, '10:00', zone);
const at = (time: string, d = day) => localInstant(d, time, zone);
const block = (start: string, end: string, title = 'Graphs: BFS') => ({
  title,
  kind: 'DSA',
  start,
  end,
  reason: 'DSA: 30 min in 7 days',
});

describe('what Rumi may plan (pure)', () => {
  it('plans today to this Sunday only', () => {
    expect(planWindow(day)).toEqual({ first: day, last: '2026-11-01' });
    expect(planWindow('2026-11-01')).toEqual({
      first: '2026-11-01',
      last: '2026-11-01',
    });
  });
  it('keeps the owner’s spelling of a kind', () => {
    const known = ['DSA', 'System design', 'Backend'];
    expect(kindFor('system_design', known)).toBe('System design');
    expect(kindFor('dsa', known)).toBe('DSA');
    expect(kindFor('graphs', known)).toBe('Graphs');
  });
  it('reads only valid proposals', () => {
    expect(
      proposeArgs.safeParse({ day, blocks: [block('18:00', '19:00')] }).success,
    ).toBe(true);
    for (const bad of [
      { day, blocks: [] },
      { day, blocks: Array.from({ length: 7 }, () => block('18:00', '19:00')) },
      { day, blocks: [block('25:00', '26:00')] },
      { day, blocks: [{ ...block('18:00', '19:00'), userId: 'x' }] },
      { day: 'tomorrow', blocks: [block('18:00', '19:00')] },
    ])
      expect(proposeArgs.safeParse(bad).success).toBe(false);
    expect(
      readToolCall({
        id: 'c',
        type: 'function',
        function: {
          name: 'propose_blocks',
          arguments: JSON.stringify({ day, blocks: [block('18:00', '19:00')] }),
        },
      }).ok,
    ).toBe(true);
  });
  it('marks blocks that cannot be added, and why', () => {
    const taken = [
      { start: at('07:00'), end: at('08:00'), label: '07:00–08:00 busy' },
    ];
    const out = checkBlocks(
      day,
      [
        block('09:00', '09:30'),
        block('07:30', '08:30'),
        block('19:00', '18:00'),
        block('18:00', '19:00'),
        block('18:30', '19:30', 'Overlapping'),
      ],
      taken,
      now,
      zone,
      ['DSA'],
    );
    expect(out.map((b) => b.conflict ?? 'ok')).toEqual([
      'That time has passed',
      'That time has passed',
      'It ends before it starts',
      'ok',
      'Overlaps 18:00–19:00 Graphs: BFS',
    ]);
    const later = checkBlocks(
      day,
      [block('07:30', '08:30')],
      taken,
      at('06:00'),
      zone,
      [],
    );
    expect(later[0].conflict).toBe('Overlaps 07:00–08:00 busy');
  });
  it('reads stored cards safely', () => {
    expect(readMetadata(null)).toEqual({ proposals: [], suggestions: [] });
    expect(readMetadata({ proposals: [{ id: 1 }], suggestions: 'x' })).toEqual({
      proposals: [],
      suggestions: [],
    });
  });
  it('finds the best hours and the recorded share of planned time', () => {
    const s = (d: string, a: string, b: string, category = 'DSA') => ({
      category,
      startedAt: at(a, d),
      endedAt: at(b, d),
    });
    const p = patterns(
      {
        sessions: [
          s('2026-10-20', '06:00', '08:00'),
          s('2026-10-21', '07:00', '08:30'),
          s('2026-10-22', '20:00', '20:30', 'Technical'),
        ],
        planned: [
          {
            category: 'DSA',
            plannedStart: at('06:00', '2026-10-20'),
            plannedEnd: at('09:00', '2026-10-20'),
          },
          {
            category: 'DSA',
            plannedStart: at('06:00', '2026-10-21'),
            plannedEnd: at('09:00', '2026-10-21'),
          },
          {
            category: 'TECHNICAL',
            plannedStart: at('20:00', '2026-10-22'),
            plannedEnd: at('22:00', '2026-10-22'),
          },
        ],
      },
      now,
      zone,
    );
    expect(p).toEqual({
      bestHours: '06:00–09:00',
      recordedShare: { DSA: 60, Technical: 25 },
    });
    expect(patternLine(p)).toBe(
      'Last 4 weeks: Most recorded study 06:00–09:00 · DSA about 60% of planned · Technical about 25% of planned',
    );
    expect(
      patterns(
        { sessions: [s(day, '06:00', '06:30')], planned: [] },
        now,
        zone,
      ),
    ).toEqual({
      bestHours: null,
      recordedShare: {},
    });
    expect(patternLine({ bestHours: null, recordedShare: {} })).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
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
type Answer = { content?: string; tools?: { name: string; args: unknown }[] };
function fakeRouter(answers: Answer[]) {
  const chats: Record<string, unknown>[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    chats.push(JSON.parse(String(init!.body)));
    const a = answers.shift() ?? { content: 'Here is a plan.' };
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 900, completion_tokens: 100, cost: 0.00014 },
      choices: [
        {
          message: {
            content: a.content ?? null,
            tool_calls: a.tools?.map((t, i) => ({
              id: `call_${i}`,
              type: 'function',
              function: { name: t.name, arguments: JSON.stringify(t.args) },
            })),
          },
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, chats };
}

describe.skipIf(!url)('Rumi plans (PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  let user: { id: string; timezone: string };
  let other: { id: string; timezone: string };
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
  const make = (name: string) => {
    const id = `${name}-${randomUUID()}`;
    return prisma.user.create({
      data: { id, email: `${id}@example.com`, name, timezone: zone },
    });
  };
  beforeEach(async () => {
    user = await make('plans');
    other = await make('plans-other');
    // A Wednesday gym routine, not yet generated for this week.
    await prisma.routineBlock.create({
      data: {
        userId: user.id,
        title: 'PRIVATE-GYM',
        category: 'GYM',
        weekdays: [3],
        startLocal: '18:00',
        endLocal: '19:00',
        priority: 2,
        enabled: true,
      },
    });
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
  });

  /** One answer with a plan for Wednesday: one clear block, one on the gym routine. */
  async function propose(args?: unknown) {
    const r = fakeRouter([
      {
        tools: [
          {
            name: 'propose_blocks',
            args: args ?? {
              day: '2026-10-28',
              blocks: [
                block('06:30', '08:00', 'Graphs: BFS practice'),
                block('18:30', '19:30', 'System design: caching'),
              ],
            },
          },
        ],
      },
      { content: 'Here is a plan for Wednesday.' },
    ]);
    const { message } = await sendMessage(
      user,
      { text: 'Plan Wednesday' },
      now,
      r.fetcher,
    );
    return { message, r, meta: readMetadata(message.metadata) };
  }
  const blocksOn = (d: string) =>
    prisma.timeBlock.findMany({
      where: { dailyPlan: { userId: user.id, date: new Date(d) } },
      orderBy: { plannedStart: 'asc' },
    });

  it('shows a plan with the routine as busy, and adds nothing until the owner presses', async () => {
    const { r, meta } = await propose();
    const [p] = meta.proposals;
    expect(p.status).toBe('shown');
    expect(p.blocks.map((b) => b.conflict ?? 'ok')).toEqual([
      'ok',
      'Overlaps 18:00–19:00 busy',
    ]);
    const told = (
      r.chats[1].messages as { role: string; content: string }[]
    ).find((m) => m.role === 'tool')!.content;
    expect(told).not.toMatch(/PRIVATE/);
    expect(JSON.parse(told).note).toMatch(/Nothing is added/);
    const wed = await blocksOn('2026-10-28');
    expect(wed.map((b) => b.category)).toEqual(['GYM']);
  });

  it('adds the clear blocks as blocks added for the day, once, with Undo that reopens the card', async () => {
    const { message, meta } = await propose();
    const p = meta.proposals[0];
    await expect(applyProposal(other, message.id, p.id, now)).rejects.toThrow(
      /no longer exists/,
    );
    const { ids } = await applyProposal(user, message.id, p.id, now);
    expect(ids).toHaveLength(1);
    const wed = await blocksOn('2026-10-28');
    expect(
      wed.map((b) => [b.title, b.category, b.isOverride, b.status]),
    ).toEqual([
      ['Graphs: BFS practice', 'DSA', true, 'PLANNED'],
      ['PRIVATE-GYM', 'GYM', false, 'PLANNED'],
    ]);
    const after = await prisma.agentMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(readMetadata(after.metadata).proposals[0]).toMatchObject({
      status: 'applied',
      blockIds: ids,
    });
    expect(after.metadata).toMatchObject({ tools: ['propose_blocks'] });
    await expect(applyProposal(user, message.id, p.id, now)).rejects.toThrow(
      /already added/,
    );
    await restore(user, 'cancel-blocks', {
      ids,
      messageId: message.id,
      proposalId: p.id,
    });
    expect(
      (await prisma.timeBlock.findUniqueOrThrow({ where: { id: ids[0] } }))
        .status,
    ).toBe('CANCELLED');
    const reopened = await prisma.agentMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(readMetadata(reopened.metadata).proposals[0].status).toBe('shown');
  });

  it('adds nothing when the day changed since the proposal', async () => {
    const { message, meta } = await propose();
    const plan = await prisma.dailyPlan.findFirstOrThrow({
      where: { userId: user.id, date: new Date('2026-10-28') },
    });
    await prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title: 'Added elsewhere',
        category: 'WORK',
        plannedStart: at('07:00', '2026-10-28'),
        plannedEnd: at('07:30', '2026-10-28'),
      },
    });
    await expect(
      applyProposal(user, message.id, meta.proposals[0].id, now),
    ).rejects.toThrow(/day changed .*Nothing was added/);
    expect((await blocksOn('2026-10-28')).map((b) => b.title)).toEqual([
      'Added elsewhere',
      'PRIVATE-GYM',
    ]);
  });

  it('refuses days beyond Sunday and dismisses on request', async () => {
    const { meta, r } = await propose({
      day: '2026-11-02',
      blocks: [block('18:00', '19:00')],
    });
    expect(meta.proposals).toEqual([]);
    const told = (
      r.chats[1].messages as { role: string; content: string }[]
    ).find((m) => m.role === 'tool')!.content;
    expect(told).toMatch(/Prepare next week/);
    const second = await propose();
    await dismissProposal(user, second.message.id, second.meta.proposals[0].id);
    await expect(
      applyProposal(user, second.message.id, second.meta.proposals[0].id, now),
    ).rejects.toThrow(/dismissed/);
  });

  it('keeps a "Rumi knows" line only when the owner keeps it', async () => {
    const r = fakeRouter([
      {
        tools: [
          {
            name: 'suggest_memory',
            args: { text: 'Rest day is Saturday', reason: 'You said so' },
          },
        ],
      },
      { content: 'Noted as a suggestion.' },
    ]);
    const { message } = await sendMessage(
      user,
      { text: 'Saturday is my rest day' },
      now,
      r.fetcher,
    );
    const [s] = readMetadata(message.metadata).suggestions;
    expect(await prisma.agentMemory.count({ where: { userId: user.id } })).toBe(
      0,
    );
    await answerSuggestion(user, message.id, s.id, true);
    expect(
      (await prisma.agentMemory.findMany({ where: { userId: user.id } })).map(
        (m) => m.text,
      ),
    ).toEqual(['Rest day is Saturday']);
    await expect(
      answerSuggestion(user, message.id, s.id, true),
    ).rejects.toThrow(/not open/);
  });

  it('reads patterns from study sessions only', async () => {
    for (const d of ['2026-10-20', '2026-10-21'])
      await prisma.actualSession.create({
        data: {
          userId: user.id,
          category: 'DSA',
          startedAt: at('06:00', d),
          endedAt: at('08:00', d),
        },
      });
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        category: 'GYM',
        startedAt: at('18:00', '2026-10-22'),
        endedAt: at('23:00', '2026-10-22'),
      },
    });
    expect((await getPatterns(user, now)).bestHours).toBe('06:00–09:00');
  });
});
