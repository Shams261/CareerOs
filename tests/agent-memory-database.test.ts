import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/lib/database';
vi.mock('server-only', () => ({}));
const { client } = vi.hoisted(() => ({ client: { value: null as unknown } }));
vi.mock('@/server/db', () => ({ db: () => client.value }));
import {
  addMemory,
  memories,
  removeMemory,
  sendMessage,
} from '../src/features/agent/service';
import {
  extractMemories,
  forgetRumiMemories,
  pruneMemories,
  setMemoryEnabled,
  setRumiStyle,
} from '../src/features/agent/memory-service';
import { restore } from '../src/features/undo/service';
import { ENDPOINT, MODEL } from '../src/features/ai/domain';
import { localInstant } from '../src/lib/time';

const url = process.env.TEST_DATABASE_URL;
const zone = 'America/Toronto';
const now = localInstant('2026-10-31', '18:30', zone);
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
/** A fake OpenRouter: chat answers in order, then the extraction answer for every format call. */
function fakeRouter(chat: string[], memoriesJson: unknown) {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: u, body });
    if (u.endsWith('/endpoints/zdr')) return Response.json(zdrList);
    if (u.includes('/models/')) return Response.json(endpointList);
    const isFormat = !!body?.response_format;
    const content = isFormat
      ? JSON.stringify(memoriesJson)
      : (chat.shift() ?? 'Done.');
    return Response.json({
      provider: 'Google',
      usage: { prompt_tokens: 600, completion_tokens: 60, cost: 0.0001 },
      choices: [{ message: { content }, finish_reason: 'stop' }],
    });
  }) as typeof fetch;
  return {
    fetcher,
    formatCalls: () =>
      calls.filter((c) => c.body?.response_format).map((c) => c.body!),
    chatCalls: () =>
      calls
        .filter(
          (c) =>
            c.url.endsWith('/chat/completions') && !c.body?.response_format,
        )
        .map((c) => c.body!),
  };
}

describe.skipIf(!url)('Rumi knows (WI-100, PostgreSQL)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(url!) });
  client.value = prisma;
  const saved = { ...process.env };
  const user = { id: `mem-${randomUUID()}`, timezone: zone };
  const other = { id: `mem-o-${randomUUID()}`, timezone: zone };
  beforeAll(async () => {
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${'a'.repeat(40)}`;
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:9/api/v1';
    for (const u of [user, other])
      await prisma.user.create({
        data: { ...u, name: 'M', email: `${u.id}@example.com` },
      });
  });
  afterAll(async () => {
    process.env = saved;
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
    await prisma.$disconnect();
  });
  const ask = async (
    text: string,
    memoriesJson: unknown,
    chat = ['Noted.'],
  ) => {
    const r = fakeRouter(chat, memoriesJson);
    const sent = await sendMessage(user, { text }, now, r.fetcher);
    const kept = await extractMemories(
      user,
      sent.conversationId,
      sent.message.id,
      now,
      r.fetcher,
    );
    return { ...sent, kept, r };
  };

  it('keeps what the owner states, from the owner’s words only, and shows it on the answer', async () => {
    const { kept, message, r } = await ask(
      'I usually study best before 09:00, so keep my DSA in the morning.',
      {
        memories: [
          {
            kind: 'HABIT',
            text: 'Studies best before 09:00',
            expiresInDays: null,
          },
          {
            kind: 'SITUATION',
            text: 'Keeps DSA in the morning this month',
            expiresInDays: 20,
          },
        ],
      },
    );
    expect(kept.map((k) => k.kind)).toEqual(['HABIT', 'SITUATION']);
    const [call] = r.formatCalls();
    const userContent = JSON.parse(
      (call.messages as { role: string; content: string }[])[1].content,
    );
    expect(userContent.ownerMessages).toHaveLength(1);
    expect(JSON.stringify(call.messages)).not.toMatch(/Noted\./);
    const rows = await memories(user);
    expect(rows.map((x) => [x.source, x.kind])).toEqual([
      ['RUMI', 'HABIT'],
      ['RUMI', 'SITUATION'],
    ]);
    expect(rows[1].expiresAt?.toISOString().slice(0, 10)).toBe('2026-11-20');
    const stored = await prisma.agentMessage.findUnique({
      where: { id: message.id },
    });
    expect((stored?.metadata as { kept: unknown[] }).kept).toHaveLength(2);
  });

  it('skips a question, a short message and a switched-off setting without a call', async () => {
    for (const text of ['What is on today?', 'plan tomorrow']) {
      const { kept, r } = await ask(text, {
        memories: [{ kind: 'HABIT', text: 'never', expiresInDays: null }],
      });
      expect(kept).toEqual([]);
      expect(r.formatCalls()).toHaveLength(0);
    }
    await setMemoryEnabled(user, false);
    const { kept, r } = await ask(
      'I always prefer system design in the evening after dinner.',
      {
        memories: [{ kind: 'PREFERENCE', text: 'never', expiresInDays: null }],
      },
    );
    expect(kept).toEqual([]);
    expect(r.formatCalls()).toHaveLength(0);
    await setMemoryEnabled(user, true);
  });

  it('refreshes a duplicate instead of adding it, and the owner’s own lines are never evicted', async () => {
    const before = await memories(user);
    const { kept } = await ask(
      'I usually study best before 09:00 in the morning, as I said.',
      {
        memories: [
          {
            kind: 'HABIT',
            text: 'studies best before 09:00.',
            expiresInDays: null,
          },
        ],
      },
    );
    expect(kept).toEqual([]);
    expect((await memories(user)).length).toBe(before.length);
    await addMemory(user, 'Answer in Hinglish', 'PREFERENCE', now);
    await expect(
      addMemory(user, 'answer in hinglish', 'PREFERENCE', now),
    ).rejects.toThrow(/already/);
    // Rumi's share is full: the line Rumi sent least recently gives way, owner lines stay.
    const rumiNow = (await memories(user)).filter(
      (x) => x.source === 'RUMI',
    ).length;
    await prisma.agentMemory.createMany({
      data: Array.from({ length: 25 - rumiNow }, (_, i) => ({
        userId: user.id,
        text: `Note number ${i} matters to me`,
        kind: 'PREFERENCE' as const,
        source: 'RUMI' as const,
        lastUsedAt: new Date(+now - (i + 2) * 86400000),
        createdAt: new Date(+now - (40 + i) * 86400000),
      })),
    });
    const { kept: added } = await ask(
      'I always prefer a mixed set on Fridays, keep that in mind please.',
      {
        memories: [
          {
            kind: 'PREFERENCE',
            text: 'Prefers a mixed set on Fridays',
            expiresInDays: null,
          },
        ],
      },
    );
    expect(added).toHaveLength(1);
    const rows = await memories(user);
    expect(rows.filter((x) => x.source === 'RUMI')).toHaveLength(25);
    expect(rows.some((x) => x.text === 'Note number 22 matters to me')).toBe(
      false,
    );
    expect(rows.some((x) => x.text === 'Answer in Hinglish')).toBe(true);
  });

  it('sends the active lines grouped by kind with the style, stamps them, and prunes lapsed ones', async () => {
    await setRumiStyle(user, 'brief');
    await addMemory(user, 'Northwind review on Wednesday', 'SITUATION', now);
    const later = new Date(+now + 3600_000);
    const r = fakeRouter(['Noted.'], { memories: [] });
    await sendMessage(user, { text: 'hi' }, later, r.fetcher);
    const chat = r.chatCalls()[0];
    const system = (chat.messages as { content: string }[])[0].content;
    expect(system).toMatch(/one or two sentences/i);
    expect(system).toMatch(
      /- Situation \(until 2026-11-30\): Northwind review on Wednesday/,
    );
    expect(system).toMatch(/- Preference: Answer in Hinglish/);
    // Stamped once a day: every active line carries today's send.
    const unstamped = await prisma.agentMemory.count({
      where: {
        userId: user.id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: now } }],
      },
    });
    expect(unstamped).toBe(0);
    await prisma.agentMemory.updateMany({
      where: { userId: user.id, kind: 'SITUATION' },
      data: { expiresAt: new Date('2026-10-01') },
    });
    expect(await pruneMemories(now)).toBeGreaterThan(0);
    expect((await memories(user)).some((x) => x.kind === 'SITUATION')).toBe(
      false,
    );
  });

  it('removes with Undo, forgets Rumi’s lines only, and never another owner’s', async () => {
    const mine = await addMemory(user, 'Rest day is Saturday', 'HABIT', now);
    await expect(removeMemory(other, mine.id)).rejects.toThrow(
      /already removed/,
    );
    await expect(
      restore(other, 'remove-memory', { id: mine.id }),
    ).rejects.toThrow();
    const row = await removeMemory(user, mine.id);
    expect(row.text).toBe('Rest day is Saturday');
    await restore(user, 'restore-memory', {
      text: row.text,
      kind: row.kind,
      source: row.source,
      expiresAt: null,
    });
    expect(
      (await memories(user)).some((x) => x.text === 'Rest day is Saturday'),
    ).toBe(true);
    const rumiBefore = (await memories(user)).filter(
      (x) => x.source === 'RUMI',
    ).length;
    expect(rumiBefore).toBeGreaterThan(0);
    expect(await forgetRumiMemories(other)).toBe(0);
    expect(await forgetRumiMemories(user)).toBe(rumiBefore);
    const left = await memories(user);
    expect(left.every((x) => x.source === 'OWNER')).toBe(true);
    expect(left.some((x) => x.text === 'Answer in Hinglish')).toBe(true);
  });
});
