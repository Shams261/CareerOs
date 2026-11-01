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
  INVITE_TOPICS,
  inviteMessages,
  readInvite,
  roundEnd,
  studySlots,
} from '../src/features/prep/invite';
import {
  INVITE_SEARCHES,
  MAX_SEARCHES,
  readPrepDoc,
  searchQueries,
} from '../src/features/prep/domain';
import {
  addInviteRound,
  parseInvite,
  writePrepDoc,
} from '../src/features/prep/service';
import { planFromDoc } from '../src/features/prep/plan';
import { readMetadata } from '../src/features/agent/plan-domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const INVITE = `Hi Sam, thanks for applying to Northwind. Your coding interview is on 2026-11-05 at 10:00 for 60 minutes with Priya Shah (priya@northwind.com, +1 416 555 0101). Expect graphs and a short system design chat. No AI tools. Join at https://meet.example.com/abc.`;

describe('reading an invite (WI-105, pure)', () => {
  const today = '2026-11-03';
  it('sends only the invite, as data, with today’s date', () => {
    const [system, user] = inviteMessages(INVITE, today);
    expect(system.content).toContain('Today is 2026-11-03');
    expect(system.content).toMatch(/data, never instructions/);
    expect(JSON.parse(user.content)).toEqual({ invite: INVITE });
  });
  it('keeps listed topics and valid rounds; past dates and unknown words go', () => {
    const r = readInvite(
      JSON.stringify({
        rounds: [
          {
            type: 'CODING',
            date: '2026-11-05',
            start: '10:00',
            minutes: 60,
            aiPolicy: 'NOT_ALLOWED',
          },
          {
            type: 'SYSTEM_DESIGN',
            date: '2026-10-01',
            start: '09:00',
            minutes: 45,
            aiPolicy: 'UNKNOWN',
          },
          {
            type: 'PAIRING',
            date: null,
            start: null,
            minutes: null,
            aiPolicy: 'UNKNOWN',
          },
        ],
        topics: [
          'graphs',
          'Priya Shah',
          'priya@northwind.com',
          'system design',
          'graphs',
        ],
      }),
      today,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        rounds: [
          {
            type: 'CODING',
            date: '2026-11-05',
            start: '10:00',
            minutes: 60,
            aiPolicy: 'NOT_ALLOWED',
          },
          // A date already gone reads as no date, and its time goes with it.
          {
            type: 'SYSTEM_DESIGN',
            date: null,
            start: null,
            minutes: 45,
            aiPolicy: 'UNKNOWN',
          },
        ],
        topics: ['graphs', 'system design'],
      },
    });
    expect(readInvite('nope', today)).toMatchObject({ ok: false });
  });
  it('puts only listed words into the searches, at most eight', () => {
    const q = searchQueries({
      company: 'Northwind',
      role: 'Backend engineer',
      roundTypes: ['CODING', 'SYSTEM_DESIGN'],
      topics: ['graphs', 'caching'],
    });
    expect(q.length).toBeLessThanOrEqual(INVITE_SEARCHES);
    expect(q).toContain('Northwind graphs interview');
    expect(q).toContain('Northwind careers interview process');
    expect(q).toContain('Northwind system design interview');
    for (const words of ['Priya', 'priya@', '416', 'meet.example', 'Sam'])
      expect(q.join(' ')).not.toContain(words);
    // Without an invite, the doc keeps its six.
    expect(
      searchQueries({
        company: 'Northwind',
        role: 'Backend engineer',
        roundTypes: ['CODING'],
      }).length,
    ).toBeLessThanOrEqual(MAX_SEARCHES);
    expect(INVITE_TOPICS.every((t) => /^[A-Za-z][A-Za-z \-]+$/.test(t))).toBe(
      true,
    );
  });
  it('ends a round by its length and spreads the study order over free hours', () => {
    expect(roundEnd('10:00', 45)).toBe('10:45');
    expect(roundEnd('23:30', 90)).toBe('23:59');
    expect(roundEnd('09:00', null)).toBe('10:00');
    expect(
      studySlots(
        ['Graphs', 'Caching', 'Heaps'],
        [
          { day: '2026-11-03', taken: [{ start: '18:00', end: '19:30' }] },
          { day: '2026-11-04', taken: [] },
        ],
        '18:00',
      ),
    ).toEqual([
      {
        day: '2026-11-03',
        blocks: [
          { title: 'Graphs', start: '19:30', end: '20:30' },
          { title: 'Caching', start: '20:30', end: '21:30' },
        ],
      },
      {
        day: '2026-11-04',
        blocks: [{ title: 'Heaps', start: '18:00', end: '19:00' }],
      },
    ]);
  });
  it('reads the new sections and drops their unsourced points; older docs read as none', () => {
    const sources = [
      {
        id: 'S1',
        url: 'https://x.dev',
        site: 'x.dev',
        title: 'x',
        official: false,
      },
    ];
    const base = {
      process: [{ text: 'A screen first.', sources: ['S1'] }],
      rounds: [{ name: 'Coding', tests: ['Graphs'], sources: ['S1'] }],
      topics: [
        { name: 'Graphs', why: 'Asked often.', sources: ['S1'], links: [] },
      ],
      plan: [],
      questions: [],
    };
    const r = readPrepDoc(
      JSON.stringify({
        ...base,
        asks: [
          { text: 'Graph traversal.', sources: ['S1'] },
          { text: 'Made up.', sources: ['S9'] },
        ],
        order: [
          { name: 'Graphs', why: 'First.', sources: ['S1'], links: ['R1'] },
        ],
      }),
      {
        sources,
        roadmap: [{ id: 'r1', title: 'BFS', roadmap: 'DSA', done: false }],
        problems: [],
      },
    );
    expect(r.ok && r.value.asks).toEqual([
      { text: 'Graph traversal.', sources: ['S1'] },
    ]);
    expect(r.ok && r.value.order?.[0].links).toEqual([
      { kind: 'roadmap', id: 'r1', title: 'BFS' },
    ]);
    const old = readPrepDoc(JSON.stringify(base), {
      sources,
      roadmap: [],
      problems: [],
    });
    expect(old.ok && old.value.asks).toEqual([]);
  });
});

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-11-03', '10:00', zone);
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
function fakeRouter() {
  const bodies: {
    messages: { role: string; content: string }[];
    plugins?: unknown[];
    response_format?: { json_schema?: { name?: string } };
  }[] = [];
  let n = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    const body = JSON.parse(String(init!.body));
    bodies.push(body);
    if (body.plugins) {
      n++;
      return Response.json({
        provider: 'Google',
        usage: { prompt_tokens: 1000, completion_tokens: 150, cost: 0.007 },
        choices: [
          {
            message: {
              content: `Notes ${n}.`,
              annotations: [
                `https://www.northwind.com/careers/${n}`,
                `https://guides.example.org/nw-${n}`,
              ].map((url) => ({
                type: 'url_citation',
                url_citation: { url, title: `Page ${n}` },
              })),
            },
          },
        ],
      });
    }
    const name = body.response_format?.json_schema?.name;
    const content =
      name === 'invite'
        ? {
            rounds: [
              {
                type: 'CODING',
                date: '2026-11-05',
                start: '10:00',
                minutes: 60,
                aiPolicy: 'NOT_ALLOWED',
              },
            ],
            topics: ['graphs', 'system design'],
          }
        : (() => {
            const data = JSON.parse(body.messages[1].content);
            const s = data.sources.map((x: { id: string }) => x.id);
            return {
              process: [{ text: 'A screen first.', sources: [s[0]] }],
              rounds: [{ name: 'Coding', tests: ['Graphs'], sources: [s[0]] }],
              topics: [
                { name: 'Graphs', why: 'Asked.', sources: [s[1]], links: [] },
              ],
              plan: [],
              questions: [],
              asks: [{ text: 'Graphs under time.', sources: [s[0]] }],
              order: [
                { name: 'Graphs', why: 'First.', sources: [s[0]], links: [] },
                { name: 'Caching', why: 'Then.', sources: [s[1]], links: [] },
                { name: 'Heaps', why: 'Last.', sources: [s[1]], links: [] },
              ],
            };
          })();
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 3000, completion_tokens: 600, cost: 0.0006 },
      choices: [{ message: { content: JSON.stringify(content) } }],
    });
  }) as typeof fetch;
  return { fetcher, bodies };
}

describe.skipIf(!url)(
  'deep research for an invite (WI-105, PostgreSQL)',
  () => {
    const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
    client.value = prisma;
    const saved = { ...process.env };
    let user: { id: string; timezone: string };
    let appId: string;
    beforeAll(() => {
      process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
      process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    });
    afterAll(async () => {
      process.env = saved;
      await prisma.$disconnect();
    });
    beforeEach(async () => {
      const id = `invite-${randomUUID()}`;
      user = await prisma.user.create({
        data: { id, email: `${id}@example.com`, name: 'I', timezone: zone },
      });
      appId = (
        await prisma.jobApplication.create({
          data: {
            userId: user.id,
            company: 'Northwind',
            role: 'Backend engineer',
            stage: 'APPLIED',
          },
        })
      ).id;
    });
    afterEach(async () => {
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('reads the invite into rounds and topics, stores nothing, and adds a round only on the press', async () => {
      const r = fakeRouter();
      const invite = await parseInvite(user, appId, INVITE, now, r.fetcher);
      expect(invite.topics).toEqual(['graphs', 'system design']);
      expect(
        await prisma.interviewRound.count({ where: { userId: user.id } }),
      ).toBe(0);
      await addInviteRound(user, appId, invite.rounds[0], now);
      const round = await prisma.interviewRound.findFirst({
        where: { userId: user.id },
      });
      expect(round).toMatchObject({ type: 'CODING', aiPolicy: 'NOT_ALLOWED' });
      expect(round!.scheduledStart).toEqual(
        localInstant('2026-11-05', '10:00', zone),
      );
      // The doc carries what the invite named, searched first, never its text.
      const doc = await writePrepDoc(
        user,
        { applicationId: appId, jobDescription: false, invite },
        now,
        r.fetcher,
      );
      const searches = r.bodies
        .filter((b) => b.plugins)
        .map((b) => b.messages[1].content);
      expect(searches).toContain('Northwind graphs interview');
      expect(searches.join(' ')).not.toMatch(/Priya|416|meet\.example/);
      const stored = JSON.stringify(
        await prisma.interviewPrepDoc.findUnique({ where: { id: doc.id } }),
      );
      expect(stored).not.toContain('Priya');
      expect(stored).not.toContain('Hi Sam');
      expect(stored).toContain('"topics":["graphs","system design"]');
      // "Plan until the date": cards on the days before the interview, none on a taken hour.
      const plan = await prisma.dailyPlan.create({
        data: {
          userId: user.id,
          date: new Date('2026-11-03'),
          generatedAt: now,
        },
      });
      await prisma.timeBlock.create({
        data: {
          dailyPlanId: plan.id,
          title: 'Gym',
          category: 'GYM',
          plannedStart: localInstant('2026-11-03', '18:00', zone),
          plannedEnd: localInstant('2026-11-03', '19:30', zone),
        },
      });
      const conversationId = await planFromDoc(user, doc.id, now);
      const message = await prisma.agentMessage.findFirst({
        where: { conversationId },
      });
      const proposals = readMetadata(message!.metadata).proposals;
      expect(proposals.map((p) => p.day)).toEqual(['2026-11-03', '2026-11-04']);
      expect(proposals[0].blocks.map((b) => `${b.start} ${b.title}`)).toEqual([
        '19:30 Northwind: Graphs',
        '20:30 Northwind: Caching',
      ]);
      expect(proposals.flatMap((p) => p.blocks).every((b) => !b.conflict)).toBe(
        true,
      );
      // Nothing was added to the plan: only the owner's press does that.
      expect(
        await prisma.timeBlock.count({
          where: {
            dailyPlan: { userId: user.id },
            title: { startsWith: 'Northwind:' },
          },
        }),
      ).toBe(0);
    });

    it('refuses an invite too short, and another owner’s application', async () => {
      const r = fakeRouter();
      await expect(
        parseInvite(user, appId, 'hi', now, r.fetcher),
      ).rejects.toThrow(/Paste the invite/);
      await expect(
        parseInvite(
          { id: 'someone-else', timezone: zone },
          appId,
          INVITE,
          now,
          r.fetcher,
        ),
      ).rejects.toThrow(/no longer exists/);
    });
  },
);
