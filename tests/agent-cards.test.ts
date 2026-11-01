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
import { sendMessage } from '../src/features/agent/service';
import { applyRequest, dismissRequest } from '../src/features/agent/requests';
import { readMetadata } from '../src/features/agent/plan-domain';
import {
  attemptFits,
  cardViews,
  readRequests,
  REQUEST_UNDO,
} from '../src/features/agent/request-domain';
import { restore } from '../src/features/undo/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
// Tuesday 3 November 2026, 10:00 in Toronto; the plan window runs to Sunday 8 November.
const day = '2026-11-03';
const now = localInstant(day, '10:00', zone);
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
type Answer = { content?: string; tools?: { name: string; args: unknown }[] };
function fakeRouter(answers: Answer[]) {
  const results: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
    if (u.includes('/models/')) return Response.json(endpointList);
    const body = JSON.parse(String(init?.body));
    for (const m of body.messages)
      if (m.role === 'tool' && !results.includes(m.content))
        results.push(m.content);
    const a = answers.shift() ?? { content: 'Done.' };
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
          finish_reason: a.tools ? 'tool_calls' : 'stop',
        },
      ],
    });
  }) as typeof fetch;
  return { fetcher, results: () => results.map((r) => JSON.parse(r)) };
}

describe('cards, pure (WI-103)', () => {
  it('follows Practice’s attempt rule and keeps undo kinds to their card', () => {
    expect(attemptFits('solid', 'yes')).toBe(true);
    expect(attemptFits('shaky', 'yes')).toBe(false);
    expect(attemptFits('solid', 'partial')).toBe(false);
    expect(attemptFits('shaky', 'no')).toBe(true);
    const card = {
      id: randomUUID(),
      kind: 'delete_block',
      args: { blockId: 'b1' },
      summary: ['Graphs'],
      snapshot: { version: 'v' },
      status: 'applied',
      undo: { kind: 'restore-block', payload: { id: 'b1', sessions: [] } },
    };
    expect(readRequests({ requests: [card] })).toHaveLength(1);
    // The page never gets the stored undo, only whether there is one.
    expect(cardViews({ requests: [card] })[0]).toEqual({
      id: card.id,
      kind: 'delete_block',
      args: { blockId: 'b1' },
      summary: ['Graphs'],
      snapshot: { version: 'v' },
      status: 'applied',
      canUndo: true,
    });
    for (const bad of [
      { ...card, undo: { kind: 'cancel-block', payload: {} } },
      { ...card, args: { blockId: 'b1', extra: 1 } },
      { ...card, kind: 'run_sql' },
      { ...card, id: 'not-a-uuid' },
    ])
      expect(readRequests({ requests: [bad] })).toEqual([]);
    expect(REQUEST_UNDO.log_attempt).toBeNull();
  });
});

describe.skipIf(!url)('Rumi’s cards (WI-103, PostgreSQL)', () => {
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
    const id = `cards-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'C', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  const ask = async (answers: Answer[]) => {
    const r = fakeRouter(answers);
    const sent = await sendMessage(user, { text: 'please' }, now, r.fetcher);
    return {
      id: sent.message.id,
      cards: readMetadata(sent.message.metadata).requests,
      results: r.results(),
    };
  };
  const block = async (
    d: string,
    from: string,
    to: string,
    title = 'Graphs',
    category = 'DSA',
  ) => {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(d) } },
      create: { userId: user.id, date: new Date(d) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category,
        plannedStart: localInstant(d, from, zone),
        plannedEnd: localInstant(d, to, zone),
      },
    });
  };
  const undo = (messageId: string, requestId: string) =>
    restore(user, 'undo-request', { messageId, requestId });

  it('moves a block it read with one press, never twice, and Undo puts it back', async () => {
    const b = await block(day, '18:00', '19:00');
    const { id, cards, results } = await ask([
      { tools: [{ name: 'get_today', args: {} }] },
      {
        tools: [
          {
            name: 'move_block',
            args: {
              blockId: b.id,
              day: '2026-11-04',
              start: '07:00',
              end: '08:00',
            },
          },
        ],
      },
      { content: 'Here is a card to move it.' },
    ]);
    expect(results[1]).toMatchObject({ shown: true });
    expect(cards[0]).toMatchObject({
      kind: 'move_block',
      status: 'shown',
      canUndo: false,
      summary: [
        'Graphs · DSA',
        'From Today · 18:00–19:00',
        'To Wed, Nov 4 · 07:00–08:00',
      ],
    });
    // Nothing moved until the press.
    expect(
      (await prisma.timeBlock.findUnique({ where: { id: b.id } }))!
        .plannedStart,
    ).toEqual(b.plannedStart);
    expect(await applyRequest(user, id, cards[0].id, now)).toEqual({
      kind: 'move_block',
      undo: true,
    });
    const moved = await prisma.timeBlock.findUnique({
      where: { id: b.id },
      include: { dailyPlan: true },
    });
    expect(moved!.dailyPlan.date.toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(moved!.plannedStart).toEqual(
      localInstant('2026-11-04', '07:00', zone),
    );
    await expect(applyRequest(user, id, cards[0].id, now)).rejects.toThrow(
      /already applied/,
    );
    expect(await undo(id, cards[0].id)).toBe('Block back in its slot.');
    const back = await prisma.timeBlock.findUnique({ where: { id: b.id } });
    expect(back!.plannedStart).toEqual(b.plannedStart);
    // The card is open again and applies against the block as it is now.
    const reopened = await prisma.agentMessage.findUnique({ where: { id } });
    expect(readMetadata(reopened!.metadata).requests[0].status).toBe('shown');
    await applyRequest(user, id, cards[0].id, now);
  });

  it('refuses an unread id, a clash and a busy block; applies nothing after a change', async () => {
    const b = await block(day, '18:00', '19:00');
    const gym = await block(day, '07:00', '08:00', 'Gym', 'GYM');
    await block('2026-11-04', '07:00', '08:00', 'Run', 'GYM');
    const unread = await ask([
      { tools: [{ name: 'delete_block', args: { blockId: b.id } }] },
      { content: 'Could not.' },
    ]);
    expect(unread.results[0].error).toMatch(/Read it first: blockId/);
    expect(unread.cards).toEqual([]);
    const { id, cards, results } = await ask([
      { tools: [{ name: 'get_today', args: {} }] },
      {
        tools: [
          {
            name: 'move_block',
            args: {
              blockId: b.id,
              day: '2026-11-04',
              start: '07:30',
              end: '08:30',
            },
          },
          { name: 'delete_block', args: { blockId: b.id } },
        ],
      },
      { content: 'One card.' },
    ]);
    expect(results[1].error).toMatch(/^Overlaps 07:00–08:00 busy\. No card/);
    expect(cards.map((c) => c.kind)).toEqual(['delete_block']);
    // A busy block's id never reached the model, so it can never be named.
    const seen = (
      (await prisma.agentMessage.findUnique({ where: { id } }))!.metadata as {
        seen: string[];
      }
    ).seen;
    expect(seen).not.toContain(gym.id);
    // The block changes after the card was made: the press changes nothing.
    await prisma.timeBlock.update({
      where: { id: b.id },
      data: { title: 'Graphs II' },
    });
    await expect(applyRequest(user, id, cards[0].id, now)).rejects.toThrow(
      /records changed/,
    );
    expect(
      (await prisma.timeBlock.findUnique({ where: { id: b.id } }))!.status,
    ).toBe('PLANNED');
    await dismissRequest(user, id, cards[0].id);
    await expect(applyRequest(user, id, cards[0].id, now)).rejects.toThrow(
      /dismissed/,
    );
  });

  it('deletes a block with its recorded time, and Undo brings both back', async () => {
    const b = await block(day, '08:00', '09:00');
    await prisma.actualSession.create({
      data: {
        userId: user.id,
        taskId: b.id,
        category: 'DSA',
        startedAt: localInstant(day, '08:00', zone),
        endedAt: localInstant(day, '08:40', zone),
      },
    });
    const { id, cards } = await ask([
      { tools: [{ name: 'get_today', args: {} }] },
      { tools: [{ name: 'delete_block', args: { blockId: b.id } }] },
      { content: 'Card.' },
    ]);
    expect(cards[0].summary.at(-1)).toMatch(/recorded time goes with it/);
    await applyRequest(user, id, cards[0].id, now);
    expect(
      (await prisma.timeBlock.findUnique({ where: { id: b.id } }))!.status,
    ).toBe('CANCELLED');
    expect(
      await prisma.actualSession.count({ where: { userId: user.id } }),
    ).toBe(0);
    await undo(id, cards[0].id);
    expect(
      (await prisma.timeBlock.findUnique({ where: { id: b.id } }))!.status,
    ).not.toBe('CANCELLED');
    expect(
      await prisma.actualSession.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it('changes a stage once, refuses after a change in Jobs, and Undo restores it', async () => {
    const app = await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: 'Acme',
        role: 'Backend engineer',
        stage: 'APPLIED',
      },
    });
    const { id, cards } = await ask([
      { tools: [{ name: 'get_jobs', args: {} }] },
      {
        tools: [
          {
            name: 'change_stage',
            args: { applicationId: app.id, stage: 'TECHNICAL' },
          },
        ],
      },
      { content: 'Card.' },
    ]);
    expect(cards[0].summary).toEqual([
      'Acme · Backend engineer',
      'From Applied to Technical',
    ]);
    await applyRequest(user, id, cards[0].id, now);
    expect(
      (await prisma.jobApplication.findUnique({ where: { id: app.id } }))!
        .stage,
    ).toBe('TECHNICAL');
    await undo(id, cards[0].id);
    expect(
      (await prisma.jobApplication.findUnique({ where: { id: app.id } }))!
        .stage,
    ).toBe('APPLIED');
    // Reopened: it applies again (a fresh request id), but not once Jobs moved the stage.
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { stage: 'FINAL' },
    });
    await expect(applyRequest(user, id, cards[0].id, now)).rejects.toThrow(
      /records changed/,
    );
  });

  it('records an attempt once, with no Undo, and refuses a mismatched outcome', async () => {
    const topic = await prisma.dsaTopic.create({
      data: { name: `Arrays ${randomUUID()}` },
    });
    const p = await prisma.dsaProblem.create({
      data: {
        userId: user.id,
        topicId: topic.id,
        title: 'Two Sum',
        platform: 'LEETCODE',
        problemUrl: '',
        difficulty: 'EASY',
      },
    });
    const { id, cards, results } = await ask([
      { tools: [{ name: 'find_problems', args: { text: 'two sum' } }] },
      {
        tools: [
          {
            name: 'log_attempt',
            args: { problemId: p.id, confidence: 'shaky', solved: 'yes' },
          },
          {
            name: 'log_attempt',
            args: {
              problemId: p.id,
              confidence: 'solid',
              solved: 'yes',
              minutes: 25,
            },
          },
        ],
      },
      { content: 'Card.' },
    ]);
    expect(results[1].error).toMatch(/okay or solid/);
    expect(cards[0].summary).toEqual([
      'Two Sum · easy · Arrays ' + topic.name.slice(7),
      'Solved on my own · Solid · 25 min',
      'Attempts stay as recorded: there is no Undo.',
    ]);
    expect(await applyRequest(user, id, cards[0].id, now)).toEqual({
      kind: 'log_attempt',
      undo: false,
    });
    const attempts = await prisma.dsaAttempt.findMany({
      where: { userId: user.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      confidenceAfter: 'GREEN',
      solvedIndependently: 'YES',
      durationMinutes: 25,
      notes: '',
    });
    await expect(applyRequest(user, id, cards[0].id, now)).rejects.toThrow(
      /already applied/,
    );
    expect(await prisma.dsaAttempt.count({ where: { userId: user.id } })).toBe(
      1,
    );
  });

  it('saves a day’s review from the owner’s edited fields, never over an existing one, with Undo', async () => {
    const { id, cards } = await ask([
      {
        tools: [
          {
            name: 'write_review',
            args: {
              day: '2026-11-02',
              notes: 'Did graphs, skipped the run.',
              rating: 4,
            },
          },
          {
            name: 'write_review',
            args: { day: '2026-11-04', notes: 'Tomorrow.' },
          },
        ],
      },
      { content: 'Here is a draft.' },
    ]);
    expect(cards.map((c) => c.args.day)).toEqual(['2026-11-02']);
    await applyRequest(user, id, cards[0].id, now, {
      notes: 'Graphs done; the run moved to Thursday.',
      blocker: '',
      carryForward: 'Run',
      rating: '3',
    });
    const plan = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date('2026-11-02') } },
      include: { checkIn: true },
    });
    expect(plan!.reviewedAt).not.toBeNull();
    expect(plan!.checkIn).toMatchObject({
      notes: 'Graphs done; the run moved to Thursday.',
      carryForward: 'Run',
      rating: 3,
    });
    await undo(id, cards[0].id);
    const after = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date('2026-11-02') } },
      include: { checkIn: true },
    });
    expect(after!.reviewedAt).toBeNull();
    expect(after!.checkIn).toBeNull();
    // A review written on Today meanwhile is never overwritten by the card.
    await prisma.dailyCheckIn.create({
      data: {
        userId: user.id,
        dailyPlanId: after!.id,
        completedAt: now,
        notes: 'Mine',
      },
    });
    await expect(
      applyRequest(user, id, cards[0].id, now, { notes: 'Again' }),
    ).rejects.toThrow(/records changed/);
  });
});
