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
import { undoWrite } from '../src/features/agent/writes';
import { readMetadata } from '../src/features/agent/plan-domain';
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
type Answer = {
  content?: string;
  tools?: { name: string; args: unknown }[];
  /** The model's host goes away from this answer on (WI-145). */
  down?: boolean;
};
/** A fake OpenRouter for chat: answers in order; each tool result is recorded. */
function fakeRouter(answers: Answer[]) {
  const results: string[] = [];
  let down = false;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
    if (u.includes('/models/')) return Response.json(endpointList);
    const body = JSON.parse(String(init?.body));
    for (const m of body.messages)
      if (m.role === 'tool' && !results.includes(m.content))
        results.push(m.content);
    if (down || answers[0]?.down) {
      down = true;
      throw new TypeError('fetch failed');
    }
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

describe.skipIf(!url)('Rumi’s small writes (WI-102, PostgreSQL)', () => {
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
    const id = `writes-${randomUUID()}`;
    user = await prisma.user.create({
      data: { id, email: `${id}@example.com`, name: 'W', timezone: zone },
    });
  });
  afterEach(async () => {
    await prisma.user.delete({ where: { id: user.id } });
  });

  const ask = async (text: string, answers: Answer[]) => {
    const r = fakeRouter(answers);
    const sent = await sendMessage(user, { text }, now, r.fetcher);
    return {
      ...sent,
      actions: readMetadata(sent.message.metadata).actions,
      results: r.results(),
    };
  };
  const block = async (d: string, from: string, to: string, title = 'Gym') => {
    const plan = await prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date: new Date(d) } },
      create: { userId: user.id, date: new Date(d) },
      update: {},
    });
    return prisma.timeBlock.create({
      data: {
        dailyPlanId: plan.id,
        title,
        category: 'GYM',
        plannedStart: localInstant(d, from, zone),
        plannedEnd: localInstant(d, to, zone),
      },
    });
  };

  it('adds a note in the owner’s words at once, and Undo removes it', async () => {
    const { message, actions, results } = await ask('note: call Priya Friday', [
      { tools: [{ name: 'add_note', args: { body: 'Call Priya on Friday' } }] },
      {
        content:
          'Added a note: “Call Priya on Friday”. Undo is under this answer.',
      },
    ]);
    expect(results[0]).toMatchObject({ done: true, added: 'note' });
    const notes = await prisma.quickNote.findMany({
      where: { userId: user.id },
    });
    expect(notes.map((n) => n.body)).toEqual(['Call Priya on Friday']);
    expect(actions).toEqual([
      {
        id: expect.any(String),
        tool: 'add_note',
        label: 'Note added',
        detail: 'Call Priya on Friday',
        undo: { kind: 'remove-note', payload: { id: notes[0].id } },
        status: 'done',
      },
    ]);
    const words = await undoWrite(user, message.id, actions[0].id, (k, p) =>
      restore(user, k, p),
    );
    expect(words).toBe('Note removed.');
    expect(await prisma.quickNote.count({ where: { userId: user.id } })).toBe(
      0,
    );
    const after = await prisma.agentMessage.findUnique({
      where: { id: message.id },
    });
    expect(readMetadata(after!.metadata).actions[0].status).toBe('undone');
    await expect(
      undoWrite(user, message.id, actions[0].id, (k, p) => restore(user, k, p)),
    ).rejects.toThrow(/already undone/);
  });

  it('keeps a change and its Undo when the model stops after it (WI-145)', async () => {
    const r = fakeRouter([
      { tools: [{ name: 'add_note', args: { body: 'Call Priya on Friday' } }] },
      { down: true },
    ]);
    const sent = await sendMessage(
      user,
      { text: 'note: call Priya Friday' },
      now,
      r.fetcher,
    );
    const { actions } = readMetadata(sent.message.metadata);
    expect(actions.map((a) => [a.tool, a.status])).toEqual([
      ['add_note', 'done'],
    ]);
    expect(sent.message.content).toMatch(/^Done so far: Note added\./);
    await undoWrite(user, sent.message.id, actions[0].id, (k, p) =>
      restore(user, k, p),
    );
    expect(await prisma.quickNote.count({ where: { userId: user.id } })).toBe(
      0,
    );
    // With nothing changed, the stop is still the error it was.
    await expect(
      sendMessage(
        user,
        { text: 'what is on today?' },
        now,
        fakeRouter([{ down: true }]).fetcher,
      ),
    ).rejects.toThrow();
  });

  it('adds one block in free time, refusing a clash, a passed time, a day past Sunday and a fourth hour', async () => {
    await block('2026-11-04', '18:00', '19:00');
    const { actions, results } = await ask('add DSA tomorrow', [
      {
        tools: [
          {
            name: 'add_block',
            args: {
              day: '2026-11-04',
              title: 'Graphs',
              kind: 'dsa',
              start: '18:30',
              end: '19:30',
            },
          },
          {
            name: 'add_block',
            args: {
              day: '2026-11-04',
              title: 'Graphs',
              kind: 'dsa',
              start: '19:00',
              end: '20:00',
            },
          },
        ],
      },
      { content: 'Added Graphs at 19:00.' },
    ]);
    expect(results[0]).toMatchObject({ done: false });
    expect(results[0].error).toMatch(
      /^Overlaps 18:00–19:00 busy\. Nothing was added/,
    );
    expect(results[1]).toMatchObject({
      done: true,
      added: 'block',
      time: '19:00–20:00',
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      tool: 'add_block',
      label: 'Block added',
      detail: 'Wed, Nov 4 · 19:00–20:00 · Graphs · DSA',
      undo: { kind: 'cancel-block' },
    });
    const added = await prisma.timeBlock.findMany({
      where: { dailyPlan: { userId: user.id }, title: 'Graphs' },
    });
    expect(added).toHaveLength(1);
    expect(added[0].category).toBe('DSA');

    const later = await ask('more', [
      {
        tools: [
          {
            name: 'add_block',
            args: {
              day,
              title: 'Early',
              kind: 'DSA',
              start: '08:00',
              end: '09:00',
            },
          },
          {
            name: 'add_block',
            args: {
              day: '2026-11-09',
              title: 'Next week',
              kind: 'DSA',
              start: '08:00',
              end: '09:00',
            },
          },
        ],
      },
      {
        tools: [
          {
            name: 'add_block',
            args: {
              day,
              title: 'Long',
              kind: 'DSA',
              start: '12:00',
              end: '15:30',
            },
          },
        ],
      },
      { content: 'None of those could be added.' },
    ]);
    expect(later.results.map((r) => r.error)).toEqual([
      expect.stringMatching(/That time has passed/),
      expect.stringMatching(/only from 2026-11-03 to 2026-11-08/),
      expect.stringMatching(/3 hours at most/),
    ]);
    expect(later.actions).toEqual([]);
    expect(
      await prisma.timeBlock.count({
        where: { dailyPlan: { userId: user.id } },
      }),
    ).toBe(2);
  });

  it('marks a rest day with Undo, and never twice', async () => {
    const { message, actions, results } = await ask('aaj rest', [
      {
        tools: [
          { name: 'rest_today', args: {} },
          { name: 'rest_today', args: {} },
        ],
      },
      { content: 'Today is a rest day.' },
    ]);
    expect(results[0]).toMatchObject({ done: true, restDay: day });
    expect(results[1]).toMatchObject({
      done: false,
      error: 'Today is already a rest day.',
    });
    const plan = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
    });
    expect(plan?.restAt).not.toBeNull();
    await undoWrite(user, message.id, actions[0].id, (k, p) =>
      restore(user, k, p),
    );
    const back = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(day) } },
    });
    expect(back?.restAt).toBeNull();
  });

  it('keeps two changes an answer, none in the last rounds, and twenty a day', async () => {
    const note = (body: string) => ({ name: 'add_note', args: { body } });
    const first = await ask('notes', [
      { tools: [note('one'), note('two'), note('three')] },
      { content: 'Added two notes.' },
    ]);
    expect(first.actions).toHaveLength(2);
    expect(first.results[2].error).toMatch(/At most 2 changes/);
    // Rounds 5 and 6 of 6 make no changes.
    const late = await ask('late', [
      { tools: [{ name: 'get_today', args: {} }] },
      { tools: [{ name: 'get_today', args: {} }] },
      { tools: [{ name: 'get_today', args: {} }] },
      { tools: [{ name: 'get_today', args: {} }] },
      { tools: [note('too late')] },
      { content: 'Read your day.' },
    ]);
    expect(late.actions).toEqual([]);
    expect(late.results.at(-1)?.error).toMatch(/No more changes/);
    // The day's count reads every answer of the owner's day.
    for (let i = 0; i < 9; i++)
      await ask(`notes ${i}`, [
        { tools: [note(`a${i}`), note(`b${i}`)] },
        { content: 'Added.' },
      ]);
    const capped = await ask('one more', [
      { tools: [note('twenty-one')] },
      { content: 'Could not add it.' },
    ]);
    expect(capped.results[0].error).toMatch(/20 changes today/);
    expect(await prisma.quickNote.count({ where: { userId: user.id } })).toBe(
      20,
    );
  });

  it('remembers the ids its reads returned, and only those', async () => {
    const dsa = await block(day, '18:00', '19:00', 'Two pointers');
    await prisma.timeBlock.update({
      where: { id: dsa.id },
      data: { category: 'DSA' },
    });
    const gym = await block(day, '07:00', '08:00');
    const { message } = await ask('what is on today', [
      { tools: [{ name: 'get_today', args: {} }] },
      { content: 'Two pointers at 18:00.' },
    ]);
    const meta = message.metadata as { seen?: string[] };
    expect(meta.seen).toContain(dsa.id);
    // A block shown only as "busy" never hands its id to the model.
    expect(meta.seen).not.toContain(gym.id);
  });
});
