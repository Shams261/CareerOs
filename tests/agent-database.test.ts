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
import { runTool } from '../src/features/agent/tools';
import {
  addMemory,
  conversation,
  deleteConversation,
  askRumi,
  sendMessage,
} from '../src/features/agent/service';
import { grill } from '../src/features/ai/service';
import { CAP_MICROS, ENDPOINT, MODEL } from '../src/features/ai/domain';
import { TOOL_NAMES, type ToolName } from '../src/features/agent/domain';
import { localInstant } from '../src/lib/time';
import { exportOwnerData } from '../src/server/export';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const day = '2026-10-27';
const now = localInstant(day, '18:30', zone);
const at = (time: string, d = day) => localInstant(d, time, zone);
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
const ARGS: Record<ToolName, Record<string, unknown>> = {
  get_today: {},
  get_schedule: { from: '2026-10-20', to: '2026-10-30' },
  get_activity: { days: 28 },
  get_roadmaps: {},
  get_practice: {},
  get_jobs: {},
  get_patterns: {},
  get_prep_docs: {},
  // Cards, handled by the message loop; through runTool they only refuse.
  propose_blocks: {},
  suggest_memory: {},
};

type Answer = {
  content?: string | null;
  tools?: { name: string; args: unknown }[];
  provider?: string;
};
/** A fake OpenRouter for chat: a queue of answers (tool calls or text); it records requests. */
function fakeRouter(answers: Answer[]) {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    calls.push({
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
    if (u.includes('/models/')) return Response.json(endpointList);
    const a = answers.shift() ?? { content: 'Done.' };
    return Response.json({
      provider: a.provider ?? 'Google',
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
          finish_reason: a.tools ? 'tool_calls' : 'stop',
        },
      ],
    });
  }) as typeof fetch;
  return {
    fetcher,
    chats: () => calls.filter((c) => c.url.endsWith('/chat/completions')),
  };
}

describe.skipIf(!url)('Ask Rumi (PostgreSQL)', () => {
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
    user = await make('rumi');
    other = await make('rumi-other');
  });
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
  });

  async function block(
    owner: string,
    title: string,
    from: string,
    to: string,
    category = 'DSA',
    d = day,
    extra: Record<string, unknown> = {},
  ) {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: owner, date: new Date(d) } },
      create: { userId: owner, date: new Date(d), notes: 'PRIVATE-PLAN' },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category,
        plannedStart: at(from, d),
        plannedEnd: at(to, d),
        description: 'PRIVATE-DESCRIPTION',
        ...extra,
      },
    });
  }

  /** Every field ADR-024 never reads holds a PRIVATE marker. */
  async function seed(owner: string, label = '') {
    const dsa = await block(owner, `Two pointers${label}`, '18:00', '19:30');
    await block(owner, `PRIVATE-GYM${label}`, '07:00', '08:00', 'GYM');
    await block(owner, `PRIVATE-WORK${label}`, '09:00', '17:00', 'WORK');
    await block(
      owner,
      'Skipped graphs',
      '06:00',
      '06:30',
      'DSA',
      '2026-10-26',
      {
        status: 'SKIPPED',
        skipReason: 'PRIVATE-SKIP',
      },
    );
    await block(owner, 'TEST block', '20:00', '20:30');
    await prisma.actualSession.create({
      data: {
        userId: owner,
        taskId: dsa.id,
        category: 'DSA',
        startedAt: at('18:05'),
        endedAt: at('18:25'),
        notes: 'PRIVATE-SESSION',
      },
    });
    const plan = await prisma.dailyPlan.findFirstOrThrow({
      where: { userId: owner, date: new Date(day) },
    });
    await prisma.dailyCheckIn.create({
      data: {
        userId: owner,
        dailyPlanId: plan.id,
        completedAt: at('17:00'),
        notes: 'PRIVATE-CHECKIN',
        carryForward: 'PRIVATE-CARRY',
        blocker: 'PRIVATE-BLOCKER',
      },
    });
    const shared = await prisma.roadmap.create({
      data: { userId: owner, title: `System design${label}`, studyAi: true },
    });
    const hidden = await prisma.roadmap.create({
      data: { userId: owner, title: 'PRIVATE-ROADMAP', studyAi: false },
    });
    for (const [roadmapId, title, status] of [
      [shared.id, 'Rate limiter', 'DONE'],
      [shared.id, 'Consistent hashing', 'NOT_STARTED'],
      [hidden.id, 'PRIVATE-HIDDEN-ITEM', 'DONE'],
    ] as const)
      await prisma.roadmapItem.create({
        data: {
          userId: owner,
          roadmapId,
          section: 'Building blocks',
          title,
          status,
          completedAt: status === 'DONE' ? at('12:00') : null,
          nextRevisionAt: status === 'DONE' ? new Date(day) : null,
          notes: 'PRIVATE-ITEM-NOTE',
          askedNote: 'PRIVATE-ASKED',
          url: 'https://example.com/PRIVATE-URL',
        },
      });
    const topic = await prisma.dsaTopic.upsert({
      where: { name: 'Two Pointers' },
      create: { name: 'Two Pointers' },
      update: {},
    });
    const problem = await prisma.dsaProblem.create({
      data: {
        userId: owner,
        title: `Container With Most Water${label}`,
        platform: 'LeetCode',
        problemUrl: 'https://leetcode.com/problems/PRIVATE-PROBLEM-URL/',
        difficulty: 'MEDIUM',
        topicId: topic.id,
        confidence: 'YELLOW',
        notes: 'PRIVATE-PROBLEM-NOTE',
      },
    });
    await prisma.dsaAttempt.create({
      data: {
        userId: owner,
        problemId: problem.id,
        requestId: randomUUID(),
        attemptedAt: at('18:20'),
        confidenceAfter: 'YELLOW',
        solvedIndependently: 'YES',
        notes: 'PRIVATE-ATTEMPT-NOTE',
        mistake: 'PRIVATE-MISTAKE',
      },
    });
    const app = await prisma.jobApplication.create({
      data: {
        userId: owner,
        company: `Northwind${label}`,
        role: 'Software Engineer II',
        stage: 'TECHNICAL',
        recruiterName: 'PRIVATE-RECRUITER',
        recruiterContact: 'PRIVATE-CONTACT',
        hiringContact: 'PRIVATE-HIRING',
        notes: 'PRIVATE-JOB-NOTE',
        compensationNotes: 'PRIVATE-COMPENSATION',
        jobDescription: 'PRIVATE-JOB-DESCRIPTION',
        nextAction: 'PRIVATE-NEXT-ACTION',
        nextActionDate: new Date('2026-10-29'),
        actionOwner: 'ME',
        jobUrl: 'https://example.com/PRIVATE-JOB-URL',
      },
    });
    const round = await prisma.interviewRound.create({
      data: {
        userId: owner,
        applicationId: app.id,
        title: 'System design round',
        type: 'SYSTEM_DESIGN',
        scheduledStart: at('15:00', '2026-10-30'),
        timezone: zone,
        interviewers: 'PRIVATE-INTERVIEWER',
        meetingUrl: 'https://meet.example.com/PRIVATE-MEETING',
        location: 'PRIVATE-LOCATION',
        notes: 'PRIVATE-ROUND-NOTE',
        topicsAsked: 'PRIVATE-TOPICS',
        wentWell: 'PRIVATE-WENT-WELL',
        toImprove: 'PRIVATE-TO-IMPROVE',
        outcomeNotes: 'PRIVATE-OUTCOME',
      },
    });
    await prisma.interviewPrepItem.create({
      data: {
        userId: owner,
        roundId: round.id,
        title: 'Design a URL shortener',
        notes: 'PRIVATE-PREP-NOTE',
      },
    });
  }

  it('never reads a field ADR-024 keeps away, nor another owner’s records', async () => {
    await seed(user.id);
    await seed(other.id, ' OTHER-OWNER');
    for (const name of TOOL_NAMES) {
      const out = JSON.stringify(await runTool(user, name, ARGS[name], now));
      expect(out, name).not.toMatch(/PRIVATE|OTHER-OWNER|TEST block/);
    }
    const today = (await runTool(user, 'get_today', {}, now)) as {
      blocks: Record<string, unknown>[];
    };
    expect(today.blocks).toEqual([
      { time: '07:00–08:00', busy: true },
      { time: '09:00–17:00', busy: true },
      {
        time: '18:00–19:30',
        kind: 'DSA',
        title: 'Two pointers',
        state: 'Now',
        recordedMinutes: 20,
      },
      { time: '20:00–20:30', busy: true },
    ]);
    const roadmaps = (await runTool(user, 'get_roadmaps', {}, now)) as {
      hiddenRoadmaps: number;
      roadmaps: { title: string; done: number; left: number }[];
    };
    expect(roadmaps.hiddenRoadmaps).toBe(1);
    expect(roadmaps.roadmaps).toMatchObject([
      { title: 'System design', done: 1, left: 1, dueForRevision: 1 },
    ]);
    const activity = (await runTool(
      user,
      'get_activity',
      { days: 7 },
      now,
    )) as {
      totalMinutes: Record<string, number>;
      lastRecordedOn: Record<string, string | null>;
      roadmapItemsDone: Record<string, number>;
    };
    // Kinds with nothing recorded are named at 0, so a gap can be named.
    expect(activity.totalMinutes).toEqual({ DSA: 20, Technical: 0 });
    expect(activity.lastRecordedOn).toEqual({ DSA: day, Technical: null });
    expect(activity.roadmapItemsDone).toEqual({ 'System design': 1 });
    const jobs = JSON.stringify(await runTool(user, 'get_jobs', {}, now));
    expect(jobs).toMatch(/Northwind/);
    expect(jobs).toMatch(/Design a URL shortener/);
  });

  it('keeps the titles of the owner’s own study categories', async () => {
    await block(user.id, 'Spring Boot APIs', '18:00', '19:00', 'Backend');
    const hidden = (await runTool(user, 'get_today', {}, now)) as {
      blocks: unknown[];
    };
    expect(hidden.blocks).toEqual([{ time: '18:00–19:00', busy: true }]);
    await prisma.studyNudgeSetting.create({
      data: { userId: user.id, studyCategories: ['DSA', 'Backend'] },
    });
    const shown = JSON.stringify(await runTool(user, 'get_today', {}, now));
    expect(shown).toMatch(/Spring Boot APIs/);
    const activity = (await runTool(
      user,
      'get_activity',
      { days: 7 },
      now,
    )) as {
      studyKinds: string[];
      totalMinutes: Record<string, number>;
    };
    expect(activity.studyKinds).toEqual(['DSA', 'Technical', 'Backend']);
    expect(activity.totalMinutes.Backend).toBe(0);
  });

  it('answers through a tool, stores only the question and answer, and counts each call', async () => {
    await seed(user.id);
    const r = fakeRouter([
      { tools: [{ name: 'get_activity', args: { days: 7 } }] },
      { content: '**DSA** had 20 min this week. System design had none.' },
    ]);
    const { conversationId, message } = await sendMessage(
      user,
      { text: 'What did I study least this week?' },
      now,
      r.fetcher,
    );
    expect(message.content).toMatch(/DSA/);
    const [first, second] = r.chats();
    expect(r.chats()).toHaveLength(2);
    expect(first.body).toMatchObject({
      model: MODEL,
      tool_choice: 'auto',
      provider: { only: [ENDPOINT], zdr: true, allow_fallbacks: false },
    });
    const sent = second.body!.messages as { role: string; content: string }[];
    expect(sent[0].role).toBe('system');
    const tool = sent.find((m) => m.role === 'tool')!;
    expect(JSON.parse(tool.content).totalMinutes).toEqual({
      DSA: 20,
      Technical: 0,
    });
    expect(JSON.stringify(r.chats())).not.toMatch(/PRIVATE/);
    const stored = await conversation(user, conversationId);
    expect(stored?.title).toBe('What did I study least this week?');
    expect(stored?.messages.map((m) => [m.role, m.content])).toEqual([
      ['USER', 'What did I study least this week?'],
      ['ASSISTANT', '**DSA** had 20 min this week. System design had none.'],
    ]);
    const row = await prisma.agentMessage.findFirstOrThrow({
      where: { conversationId, role: 'ASSISTANT' },
    });
    expect(row.metadata).toEqual({ tools: ['get_activity'], costMicros: 280 });
    const usage = await prisma.aiUsage.findMany({ where: { userId: user.id } });
    expect(usage.map((u) => [u.feature, u.outcome])).toEqual([
      ['AGENT_CHAT', 'OK'],
      ['AGENT_CHAT', 'OK'],
    ]);
  });

  it('tells the page each read as it starts and keeps the reads on the answer (WI-055)', async () => {
    await seed(user.id);
    const r = fakeRouter([
      {
        tools: [
          { name: 'get_today', args: {} },
          { name: 'get_roadmaps', args: {} },
        ],
      },
      { content: 'Start with the roadmap item due today.' },
    ]);
    const reads: string[] = [];
    const result = await askRumi(
      user,
      null,
      'What should I start with today?',
      (tool) => reads.push(tool),
      r.fetcher,
    );
    expect(reads).toEqual(['get_today', 'get_roadmaps']);
    expect(result).toMatchObject({
      ok: true,
      reply: {
        content: 'Start with the roadmap item due today.',
        tools: ['get_today', 'get_roadmaps'],
        proposals: [],
        suggestions: [],
      },
    });
    expect(result.ok && result.budget).toMatch(/of US\$3/);
  });

  it('sends the last twelve messages and the owner’s lines, in the owner’s conversation only', async () => {
    await addMemory(user, 'Rest day is Saturday');
    const r = fakeRouter([]);
    const first = await sendMessage(user, { text: 'q0' }, now, r.fetcher);
    for (let i = 1; i < 8; i++)
      await sendMessage(
        user,
        { conversationId: first.conversationId, text: `q${i}` },
        new Date(+now + i * 60_000),
        r.fetcher,
      );
    const last = r.chats().at(-1)!.body!.messages as {
      role: string;
      content: string;
    }[];
    expect(last).toHaveLength(13);
    expect(last[0].content).toMatch(/- Rest day is Saturday/);
    expect(last[1]).toEqual({ role: 'assistant', content: 'Done.' });
    expect(last[2]).toEqual({ role: 'user', content: 'q2' });
    expect(last.at(-1)).toEqual({ role: 'user', content: 'q7' });
    await expect(
      sendMessage(
        other,
        { conversationId: first.conversationId, text: 'mine?' },
        now,
        r.fetcher,
      ),
    ).rejects.toThrow(/no longer exists/);
  });

  it('stops after six calls, the last without tools', async () => {
    const loop = Array.from({ length: 6 }, () => ({
      tools: [{ name: 'get_today', args: {} }],
    }));
    const r = fakeRouter([
      ...loop.slice(0, 5),
      { content: 'Here is what I have.' },
    ]);
    const { message } = await sendMessage(
      user,
      { text: 'Today?' },
      now,
      r.fetcher,
    );
    expect(message.content).toBe('Here is what I have.');
    expect(r.chats()).toHaveLength(6);
    expect(r.chats().map((c) => c.body!.tool_choice)).toEqual([
      'auto',
      'auto',
      'auto',
      'auto',
      'auto',
      'none',
    ]);
  });

  it('refuses a bad tool call to the model without running anything', async () => {
    const r = fakeRouter([
      { tools: [{ name: 'get_activity', args: { days: 365 } }] },
      { content: 'I can look back 28 days at most.' },
    ]);
    await sendMessage(user, { text: 'Last year?' }, now, r.fetcher);
    const sent = r.chats()[1].body!.messages as {
      role: string;
      content: string;
    }[];
    expect(
      JSON.parse(sent.find((m) => m.role === 'tool')!.content),
    ).toHaveProperty('error');
  });

  it('holds the hourly limit on owner messages, not on calls, and leaves Grill Me its own', async () => {
    const conv = await prisma.agentConversation.create({
      data: { userId: user.id, title: 'Earlier' },
    });
    await prisma.agentMessage.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        conversationId: conv.id,
        userId: user.id,
        role: 'USER' as const,
        content: `earlier ${i}`,
        createdAt: new Date(+now - 10 * 60_000),
      })),
    });
    const r = fakeRouter([]);
    await expect(
      sendMessage(user, { text: 'One more?' }, now, r.fetcher),
    ).rejects.toThrow(/enough Rumi for now/);
    expect(r.chats()).toHaveLength(0);
    // Sixty chat calls in the ledger do not use up Grill Me's 20 an hour.
    await prisma.aiUsage.createMany({
      data: Array.from({ length: 60 }, () => ({
        userId: user.id,
        feature: 'AGENT_CHAT' as const,
        model: MODEL,
        provider: ENDPOINT,
        costMicros: 10,
        outcome: 'OK' as const,
        createdAt: new Date(+now - 5 * 60_000),
      })),
    });
    const roadmap = await prisma.roadmap.create({
      data: { userId: user.id, title: 'System design', studyAi: true },
    });
    const item = await prisma.roadmapItem.create({
      data: {
        userId: user.id,
        roadmapId: roadmap.id,
        section: 'Basics',
        title: 'Caching',
        scope: 'Write-through and write-back.',
      },
    });
    const ladder = JSON.stringify({
      rungs: [0, 1, 2, 3, 4].map((i) => ({
        question: `Question ${i}: what changes under load?`,
        change: i ? `Change ${i}` : 'Starting point',
        points: ['One point', 'Two point', 'Three point'],
      })),
    });
    const g = fakeRouter([{ content: ladder }]);
    await expect(
      grill(
        user,
        item.id,
        { title: true, scope: true, checkpoint: false, references: false },
        now,
        g.fetcher,
      ),
    ).resolves.toHaveProperty('rungs');
  });

  it('shares the monthly cap and blocks AI when another provider answers', async () => {
    await prisma.aiUsage.create({
      data: {
        userId: user.id,
        feature: 'GRILL_ITEM',
        model: MODEL,
        provider: ENDPOINT,
        costMicros: CAP_MICROS - 100,
        outcome: 'OK',
        createdAt: at('12:00', '2026-10-05'),
      },
    });
    const r = fakeRouter([]);
    await expect(
      sendMessage(user, { text: 'Today?' }, now, r.fetcher),
    ).rejects.toThrow(/budget is used. Rumi returns on Nov 1/);
    expect(r.chats()).toHaveLength(0);
    await prisma.aiUsage.deleteMany({ where: { userId: user.id } });
    const wrong = fakeRouter([{ content: 'Hi', provider: 'Somewhere else' }]);
    await expect(
      sendMessage(user, { text: 'Today?' }, now, wrong.fetcher),
    ).rejects.toThrow(/Rumi is unavailable/);
    expect(
      (await prisma.aiSetting.findUnique({ where: { userId: user.id } }))
        ?.blockedAt,
    ).not.toBeNull();
  });

  it('deletes a conversation and exports the rest', async () => {
    const r = fakeRouter([{ content: 'Noted.' }, { content: 'Noted again.' }]);
    const a = await sendMessage(user, { text: 'Keep this' }, now, r.fetcher);
    const b = await sendMessage(user, { text: 'Delete this' }, now, r.fetcher);
    await addMemory(user, 'Best hours 06:00–09:00');
    await deleteConversation(user, b.conversationId);
    await expect(deleteConversation(other, a.conversationId)).rejects.toThrow();
    const data = await exportOwnerData(user.id, now);
    expect(data.rumi.conversations.map((c) => c.title)).toEqual(['Keep this']);
    expect(data.rumi.conversations[0].messages).toHaveLength(2);
    expect(data.rumi.knows.map((m) => m.text)).toEqual([
      'Best hours 06:00–09:00',
    ]);
    expect(
      await prisma.agentMessage.count({
        where: { conversationId: b.conversationId },
      }),
    ).toBe(0);
  });
});
