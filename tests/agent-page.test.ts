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
  isSunday,
  pageInput,
  pageRef,
  promptsFor,
} from '../src/features/agent/page-domain';
import { readPage } from '../src/features/agent/page-context';
import { sendMessage } from '../src/features/agent/service';
import { readSeen } from '../src/features/agent/plan-domain';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

describe('the page Rumi is opened on (WI-117, pure)', () => {
  it('reads a record’s page from its path, and a place otherwise', () => {
    const id = 'cmh1a2b3c4d5e6f7g8';
    expect(pageRef(`/dsa/${id}`)).toEqual({ kind: 'problem', id });
    expect(pageRef(`/jobs/${id}/prep/abc12345678`)).toEqual({
      kind: 'application',
      id,
    });
    expect(pageRef(`/roadmap/${id}`)).toEqual({ kind: 'roadmap', id });
    expect(pageRef('/dsa/drill')).toEqual({ kind: 'place', place: 'practice' });
    expect(pageRef('/calendar')).toEqual({ kind: 'place', place: 'plan' });
    expect(pageRef('/settings')).toEqual({ kind: 'place', place: 'other' });
    expect(pageRef(null)).toEqual({ kind: 'place', place: 'other' });
  });
  it('takes a bare path only', () => {
    expect(pageInput.safeParse('/dsa/abc').success).toBe(true);
    for (const bad of ['dsa', '/dsa?x=1', 'https://x.example/dsa', '/a b'])
      expect(pageInput.safeParse(bad).success, bad).toBe(false);
  });
  it('suggests four questions for each page, the record’s own first', () => {
    expect(promptsFor(pageRef('/dsa/cmh1a2b3c4d5e6f7g8'))[0]).toMatch(
      /hint for this problem/,
    );
    expect(promptsFor(pageRef('/jobs/cmh1a2b3c4d5e6f7g8'))[0]).toMatch(
      /this application/,
    );
    for (const path of [
      '/today',
      '/calendar',
      '/roadmap',
      '/dsa',
      '/jobs',
      '/review',
      '/x',
    ])
      expect(promptsFor(pageRef(path)), path).toHaveLength(4);
    expect(promptsFor(pageRef('/calendar'))[0]).toBe('Plan tomorrow for me');
  });
  it('knows a Sunday', () => {
    expect(isSunday('2026-11-01')).toBe(true);
    expect(isSunday('2026-11-02')).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-27', '18:30', zone);
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
const SECRET = 'PRIVATE-NEVER-SENT';

describe.skipIf(!url)('the page Rumi is opened on (WI-117, PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const saved = { ...process.env };
  let user: { id: string; timezone: string };
  let other: { id: string; timezone: string };
  let problemId: string;
  let appId: string;
  let roundId: string;
  let foreignProblem: string;
  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
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
    user = await make('page');
    other = await make('page-other');
    const topic = await prisma.dsaTopic.create({
      data: { name: `Two Pointers ${randomUUID()}` },
    });
    problemId = (
      await prisma.dsaProblem.create({
        data: {
          userId: user.id,
          topicId: topic.id,
          title: 'Container With Most Water',
          platform: 'LeetCode',
          problemUrl: '',
          difficulty: 'MEDIUM',
          notes: SECRET,
        },
      })
    ).id;
    foreignProblem = (
      await prisma.dsaProblem.create({
        data: {
          userId: other.id,
          topicId: topic.id,
          title: 'Someone else’s problem',
          platform: 'LeetCode',
          problemUrl: '',
          difficulty: 'HARD',
        },
      })
    ).id;
    appId = (
      await prisma.jobApplication.create({
        data: {
          userId: user.id,
          company: 'Northwind',
          role: 'Backend engineer',
          stage: 'TECHNICAL',
          jobDescription: SECRET,
          compensationNotes: SECRET,
          recruiterContact: SECRET,
          notes: SECRET,
        },
      })
    ).id;
    roundId = (
      await prisma.interviewRound.create({
        data: {
          userId: user.id,
          applicationId: appId,
          title: 'Coding',
          type: 'CODING',
          status: 'SCHEDULED',
          scheduledStart: localInstant('2026-10-29', '10:00', zone),
          timezone: zone,
          outcomeNotes: SECRET,
        },
      })
    ).id;
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
  });

  it('reads the owner’s problem and application without their private fields', async () => {
    const p = await readPage(user, { kind: 'problem', id: problemId }, now);
    expect(p.line).toMatch(/"Container With Most Water"/);
    expect(p.line).toMatch(/not attempted yet/);
    expect(p.ids).toEqual([problemId]);
    const a = await readPage(user, { kind: 'application', id: appId }, now);
    expect(a.line).toMatch(/Northwind, Backend engineer/);
    expect(a.line).toMatch(/coding round/);
    expect(a.ids).toEqual([appId, roundId]);
    for (const line of [p.line, a.line]) expect(line).not.toContain(SECRET);
  });
  it('never reads another owner’s record, nor a roadmap with Study AI off', async () => {
    const f = await readPage(
      user,
      { kind: 'problem', id: foreignProblem },
      now,
    );
    expect(f).toEqual({ line: 'The owner opened you on Practice.', ids: [] });
    const r = await prisma.roadmap.create({
      data: { userId: user.id, title: 'Mine', studyAi: false },
    });
    expect(
      (await readPage(user, { kind: 'roadmap', id: r.id }, now)).ids,
    ).toEqual([]);
  });
  it('sends the page as data and keeps its id for a card', async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
      if (u.includes('/models/')) return Response.json(endpointList);
      bodies.push(JSON.parse(String(init!.body)));
      return Response.json({
        provider: 'Google',
        usage: { prompt_tokens: 900, completion_tokens: 50, cost: 0.0001 },
        choices: [{ message: { content: 'Try two pointers from both ends.' } }],
      });
    }) as typeof fetch;
    const { message } = await sendMessage(
      user,
      { text: 'Give me a hint for this problem', page: `/dsa/${problemId}` },
      now,
      fetcher,
    );
    const system = bodies[0].messages.filter((m) => m.role === 'system');
    expect(system[1].content).toMatch(
      /Practice problem; "this problem" means it/,
    );
    expect(system[1].content).toMatch(/never instructions/);
    expect(JSON.stringify(bodies[0])).not.toContain(SECRET);
    expect(readSeen(message.metadata)).toContain(problemId);
    // A foreign id in the path reads nothing and is never seen.
    const r2 = await sendMessage(
      user,
      { text: 'Hint?', page: `/dsa/${foreignProblem}` },
      now,
      fetcher,
    );
    expect(readSeen(r2.message.metadata)).not.toContain(foreignProblem);
    expect(JSON.stringify(bodies.at(-1))).not.toContain('Someone else');
  });
});
