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
import { streamReader, type StreamEvent } from '../src/features/ai/stream';
import { sendMessage } from '../src/features/agent/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const data = (chunk: unknown) => `data: ${JSON.stringify(chunk)}`;

describe('a streamed answer (WI-119, pure)', () => {
  it('hands on text only once the pinned provider is named, and builds the same answer', () => {
    const events: StreamEvent[] = [];
    const r = streamReader('Google', (e) => events.push(e));
    r.line(': OPENROUTER PROCESSING');
    r.line(data({ choices: [{ delta: { content: 'Start ' } }] }));
    expect(events).toEqual([]);
    r.line(
      data({ provider: 'Google', choices: [{ delta: { content: 'with ' } }] }),
    );
    r.line(
      data({
        provider: 'Google',
        choices: [{ delta: { content: 'Graphs.' } }],
      }),
    );
    r.line(
      data({
        provider: 'Google',
        usage: { prompt_tokens: 10, completion_tokens: 3 },
        choices: [{ delta: {}, finish_reason: 'stop' }],
      }),
    );
    r.line('data: [DONE]');
    expect(events).toEqual([{ text: 'Start with ' }, { text: 'Graphs.' }]);
    expect(r.answer()).toEqual({
      provider: 'Google',
      usage: { prompt_tokens: 10, completion_tokens: 3 },
      choices: [
        { message: { content: 'Start with Graphs.' }, finish_reason: 'stop' },
      ],
    });
  });
  it('resets shown text when the round turns to tools, and joins their arguments', () => {
    const events: StreamEvent[] = [];
    const r = streamReader('Google', (e) => events.push(e));
    r.line(
      data({
        provider: 'Google',
        choices: [{ delta: { content: 'Let me look.' } }],
      }),
    );
    r.line(
      data({
        provider: 'Google',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'c1',
                  type: 'function',
                  function: { name: 'get_today', arguments: '{' },
                },
              ],
            },
          },
        ],
      }),
    );
    r.line(
      data({
        provider: 'Google',
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] },
          },
        ],
      }),
    );
    r.line(
      data({ provider: 'Google', choices: [{ delta: { content: ' more' } }] }),
    );
    expect(events).toEqual([{ text: 'Let me look.' }, { reset: true }]);
    expect(r.answer().choices[0].message).toMatchObject({
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'get_today', arguments: '{}' },
        },
      ],
    });
  });
  it('shows nothing from another provider, and skips broken lines', () => {
    const events: StreamEvent[] = [];
    const r = streamReader('Google', (e) => events.push(e));
    r.line(
      data({ provider: 'Elsewhere', choices: [{ delta: { content: 'Hi' } }] }),
    );
    r.line('data: {broken');
    expect(events).toEqual([]);
    expect(r.answer().provider).toBe('Elsewhere');
  });
});

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-27', '18:30', zone);
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

describe.skipIf(!url)(
  'a streamed answer in Ask Rumi (WI-119, PostgreSQL)',
  () => {
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
      const id = `stream-${randomUUID()}`;
      user = await prisma.user.create({
        data: { id, email: `${id}@example.com`, name: 'S', timezone: zone },
      });
    });
    afterEach(async () => {
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('streams the reply as it is written and stores the same text', async () => {
      const bodies: { stream?: boolean }[] = [];
      const sse = (chunks: unknown[]) =>
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              for (const ch of chunks) c.enqueue(enc.encode(`${data(ch)}\n\n`));
              c.enqueue(enc.encode('data: [DONE]\n\n'));
              c.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      let round = 0;
      const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const u = String(input);
        if (u.endsWith('/endpoints/zdr'))
          return Response.json({ data: [{ model_id: MODEL, tag: ENDPOINT }] });
        if (u.includes('/models/')) return Response.json(endpointList);
        bodies.push(JSON.parse(String(init!.body)));
        round++;
        if (round === 1)
          return sse([
            {
              provider: 'Google',
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'c1',
                        type: 'function',
                        function: { name: 'get_today', arguments: '{}' },
                      },
                    ],
                  },
                },
              ],
            },
            {
              provider: 'Google',
              usage: {
                prompt_tokens: 900,
                completion_tokens: 20,
                cost: 0.0001,
              },
              choices: [{ delta: {}, finish_reason: 'tool_calls' }],
            },
          ]);
        return sse([
          {
            provider: 'Google',
            choices: [{ delta: { content: 'Your day is ' } }],
          },
          {
            provider: 'Google',
            choices: [{ delta: { content: 'open from 19:00.' } }],
          },
          {
            provider: 'Google',
            usage: { prompt_tokens: 900, completion_tokens: 20, cost: 0.0001 },
            choices: [{ delta: {}, finish_reason: 'stop' }],
          },
        ]);
      }) as typeof fetch;
      const events: StreamEvent[] = [];
      const { message } = await sendMessage(
        user,
        { text: 'What is on today?', onStream: (e) => events.push(e) },
        now,
        fetcher,
      );
      expect(bodies.every((b) => b.stream === true)).toBe(true);
      const shown = events.map((e) => ('text' in e ? e.text : '')).join('');
      expect(shown).toBe('Your day is open from 19:00.');
      expect(message.content).toBe(shown);
      expect(
        (await prisma.aiUsage.findMany({ where: { userId: user.id } })).every(
          (u) => u.outcome === 'OK' && u.costMicros > 0,
        ),
      ).toBe(true);
    });
  },
);
