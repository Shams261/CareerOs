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
  cleanFeedback,
  DEBRIEF_QUESTIONS,
  hasScore,
  mockQuestions,
} from '../src/features/prep/mock-domain';
import { debriefRound, mockFeedback } from '../src/features/prep/mock';
import type { PrepDoc } from '../src/features/prep/domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const doc: PrepDoc = {
  process: [{ text: 'A screen first.', sources: ['S1'] }],
  rounds: [
    {
      name: 'Coding',
      tests: ['Graph traversal', 'Talking through trade-offs'],
      sources: ['S1'],
    },
  ],
  topics: [
    { name: 'Caching', why: 'Design round.', sources: ['S1'], links: [] },
  ],
  plan: [],
  questions: [],
  asks: [
    {
      text: 'How would you find the shortest path in a grid?',
      sources: ['S1'],
    },
    { text: 'Graph traversal', sources: ['S1'] },
  ],
};

describe('the debrief and the mock interview (WI-108, pure)', () => {
  it('asks three fixed questions for the round’s own fields', () => {
    expect(DEBRIEF_QUESTIONS.map((q) => q.field)).toEqual([
      'topicsAsked',
      'wentWell',
      'toImprove',
    ]);
  });
  it('draws five questions or fewer from the doc, in order, without repeats', () => {
    expect(mockQuestions(doc)).toEqual([
      'How would you find the shortest path in a grid?',
      'Walk me through this: Graph traversal.',
      'Walk me through this: Talking through trade-offs.',
      'How would you use Caching in this interview? Give an example.',
    ]);
    expect(mockQuestions({ ...doc, asks: undefined })[0]).toBe(
      'Walk me through this: Graph traversal.',
    );
  });
  it('drops any score, rating or grade from feedback', () => {
    for (const s of [
      'I would give this 7/10.',
      'Score: 8',
      'That is 80% there.',
      'A solid grade.',
    ])
      expect(hasScore(s)).toBe(true);
    expect(hasScore('Say the time cost out loud.')).toBe(false);
    expect(
      cleanFeedback('Good start. I rate it 6 out of 10. Add the space cost.'),
    ).toBe('Good start. Add the space cost.');
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
function fakeRouter(replies: string[]) {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr'))
      return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
    if (u.includes('/models/')) return Response.json(endpointList);
    bodies.push(JSON.parse(String(init!.body)));
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 1200, completion_tokens: 120, cost: 0.0002 },
      choices: [{ message: { content: replies.shift() ?? 'Fine.' } }],
    });
  }) as typeof fetch;
  return { fetcher, bodies };
}

describe.skipIf(!url)(
  'the debrief and the mock interview (WI-108, PostgreSQL)',
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
      const id = `mock-${randomUUID()}`;
      user = await prisma.user.create({
        data: { id, email: `${id}@example.com`, name: 'M', timezone: zone },
      });
      appId = (
        await prisma.jobApplication.create({
          data: {
            userId: user.id,
            company: 'Northwind',
            role: 'Backend engineer',
            stage: 'TECHNICAL',
          },
        })
      ).id;
    });
    afterEach(async () => {
      await prisma.user.delete({ where: { id: user.id } });
    });
    const round = (status: 'SCHEDULED' | 'COMPLETED') =>
      prisma.interviewRound.create({
        data: {
          userId: user.id,
          applicationId: appId,
          title: 'Coding',
          type: 'CODING',
          status,
          outcomeNotes: 'Felt fine',
          wentWell: 'Clear plan',
          scheduledStart: localInstant('2026-11-02', '10:00', zone),
          timezone: zone,
        },
      });

    it('saves the debrief in the owner’s words, keeping what an empty answer leaves', async () => {
      const r = await round('COMPLETED');
      await debriefRound(
        user,
        r.id,
        {
          topicsAsked: 'BFS on a grid',
          wentWell: '',
          toImprove: 'State the cost first',
        },
        now,
      );
      const after = await prisma.interviewRound.findUnique({
        where: { id: r.id },
      });
      expect(after).toMatchObject({
        topicsAsked: 'BFS on a grid',
        wentWell: 'Clear plan',
        toImprove: 'State the cost first',
        outcomeNotes: 'Felt fine',
        status: 'COMPLETED',
      });
      const open = await round('SCHEDULED');
      await expect(
        debriefRound(user, open.id, { topicsAsked: 'x' }, now),
      ).rejects.toThrow(/completed first/);
      await expect(
        debriefRound(
          { id: 'someone-else', timezone: zone },
          r.id,
          { topicsAsked: 'x' },
          now,
        ),
      ).rejects.toThrow(/no longer exists/);
    });

    it('asks the doc’s own question, stores the turn as a conversation, and keeps feedback score-free', async () => {
      const d = await prisma.interviewPrepDoc.create({
        data: {
          userId: user.id,
          applicationId: appId,
          company: 'Northwind',
          role: 'Backend engineer',
          queries: ['Northwind interview process'],
          content: doc as object,
          sources: [],
        },
      });
      const r = fakeRouter([
        'Strong start; this answer is 7/10.',
        'Good start. You named BFS; add the space cost. A follow-up: what if the grid is huge?',
      ]);
      const out = await mockFeedback(
        user,
        {
          docId: d.id,
          index: 0,
          answer: 'I would run BFS from the start cell.',
          conversationId: null,
        },
        now,
        r.fetcher,
      );
      // A scored reply is asked again; the second one is kept.
      expect(out.feedback).toBe(
        'Good start. You named BFS; add the space cost. A follow-up: what if the grid is huge?',
      );
      const sent = JSON.parse(r.bodies[0].messages[1].content);
      expect(sent.question).toBe(
        'How would you find the shortest path in a grid?',
      );
      const messages = await prisma.agentMessage.findMany({
        where: { conversationId: out.conversationId },
        orderBy: { createdAt: 'asc' },
      });
      expect(messages.map((m) => m.role)).toEqual(['USER', 'ASSISTANT']);
      expect(messages[0].content).toMatch(/^Question 1: How would you find/);
      await expect(
        mockFeedback(
          user,
          {
            docId: d.id,
            index: 9,
            answer: 'Some answer here.',
            conversationId: null,
          },
          now,
          r.fetcher,
        ),
      ).rejects.toThrow(/not in this mock/);
      await expect(
        mockFeedback(
          { id: 'someone-else', timezone: zone },
          {
            docId: d.id,
            index: 0,
            answer: 'Some answer here.',
            conversationId: null,
          },
          now,
          r.fetcher,
        ),
      ).rejects.toThrow(/no longer exists/);
    });
  },
);
