import 'server-only';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { dayKey, hhmm, shortDate } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import {
  AiRefusal,
  AiUnavailable,
  callModel,
  ready,
  settle,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { ENDPOINT, MODEL } from '@/features/ai/domain';
import {
  AGENT_NAME,
  AGENT_RATE,
  chatBody,
  chatReservation,
  conversationTitle,
  HISTORY,
  historyWindow,
  MAX_ROUNDS,
  MEMORY,
  memoryInput,
  messageInput,
  readToolCall,
  REPLY_MAX,
  systemPrompt,
  toolContent,
  type ChatMessage,
  type ToolCall,
} from './domain';
import { runTool } from './tools';

export const UNAVAILABLE = `${AGENT_NAME} is unavailable right now.`;
const WORDS: CallWords = {
  unavailable: UNAVAILABLE,
  budgetUsed: (day) =>
    `This month’s AI budget is used. ${AGENT_NAME} returns on ${shortDate(day)}.`,
  log: '[agent] chat',
};

/** The conversation list, newest first. */
export const conversations = (user: ScheduleUser) =>
  db().agentConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });

/** One conversation with its messages, or null when it is not the owner's. */
export const conversation = (user: ScheduleUser, id: string) =>
  db().agentConversation.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });

export async function deleteConversation(user: ScheduleUser, id: string) {
  const found = await db().agentConversation.deleteMany({
    where: { id, userId: user.id },
  });
  if (!found.count) throw new Error('This conversation was already deleted.');
}

/** "Rumi knows": the owner's own lines, oldest first. */
export const memories = (user: ScheduleUser) =>
  db().agentMemory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true },
  });
export async function addMemory(user: ScheduleUser, raw: unknown) {
  const text = memoryInput.parse(raw);
  return locked(user.id, async (tx) => {
    const count = await tx.agentMemory.count({ where: { userId: user.id } });
    if (count >= MEMORY.items)
      throw new Error(
        `${AGENT_NAME} keeps up to ${MEMORY.items} lines. Remove one first.`,
      );
    return tx.agentMemory.create({ data: { userId: user.id, text } });
  });
}
export async function removeMemory(user: ScheduleUser, id: string) {
  const found = await db().agentMemory.deleteMany({
    where: { id, userId: user.id },
  });
  if (!found.count) throw new Error('This line was already removed.');
}

/** Whether Ask Rumi can run on this server (the AI key is set). */
export const agentConfigured = () => !!aiConfig();

/**
 * One owner message (WI-040, ADR-024). The message is counted and stored first, under the
 * owner lock, so the hourly and daily limits hold. Then up to `MAX_ROUNDS` model calls, each
 * reserved in the ledger: the model may call read-only tools, whose results are sent but
 * never stored; the last round must answer without tools. Only the answer is stored, with
 * the names of the tools used, the rounds and the cost.
 */
export async function sendMessage(
  user: ScheduleUser,
  input: { conversationId?: string | null; text: unknown },
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(UNAVAILABLE);
  const text = messageInput.parse(input.text);
  await ready(user, cfg, now, fetcher, { requireEnabled: false });
  const { conversationId, history } = await locked(user.id, async (tx) => {
    const hour = new Date(+now - 3600_000),
      day = new Date(+now - 24 * 3600_000);
    const sent = (since: Date) =>
      tx.agentMessage.count({
        where: { userId: user.id, role: 'USER', createdAt: { gte: since } },
      });
    const [lastHour, lastDay] = await Promise.all([sent(hour), sent(day)]);
    if (lastHour >= AGENT_RATE.hour || lastDay >= AGENT_RATE.day)
      throw new AiRefusal(
        `That is enough ${AGENT_NAME} for now. Try again in a while.`,
      );
    let id = input.conversationId ?? null;
    if (id) {
      const own = await tx.agentConversation.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!own)
        throw new AiRefusal(
          'This conversation no longer exists. Start a new one.',
        );
    } else
      id = (
        await tx.agentConversation.create({
          data: { userId: user.id, title: conversationTitle(text) },
        })
      ).id;
    await tx.agentMessage.create({
      data: {
        conversationId: id,
        userId: user.id,
        role: 'USER',
        content: text,
        createdAt: now,
      },
    });
    await tx.agentConversation.update({
      where: { id },
      data: { updatedAt: now },
    });
    const history = await tx.agentMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY,
      select: { role: true, content: true },
    });
    return { conversationId: id, history: history.reverse() };
  });
  const memory = (await memories(user)).map((m) => m.text);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt({
        today: dayKey(now, user.timezone),
        weekday: formatInTimeZone(now, user.timezone, 'EEEE'),
        time: hhmm(now, user.timezone),
        zone: user.timezone,
        memory,
      }),
    },
    ...historyWindow(history),
  ];
  const started = Date.now();
  // Stored after the question even when the test clock (`now`) is ahead of the real one.
  const later = () => new Date(+now + Math.max(1, Date.now() - started));
  const used: string[] = [];
  let spent = 0;
  let reply: string | null = null;
  for (let round = 1; round <= MAX_ROUNDS && reply === null; round++) {
    const final = round === MAX_ROUNDS;
    const { usageId, answer, cost, durationMs } = await callModel({
      user,
      cfg,
      feature: 'AGENT_CHAT',
      body: chatBody(messages, final),
      reserve: chatReservation(messages),
      now,
      fetcher,
      words: WORDS,
    });
    spent += cost.micros;
    const message = answer.choices?.[0]?.message;
    const calls = Array.isArray(message?.tool_calls)
      ? (message.tool_calls as ToolCall[])
      : [];
    const content =
      typeof message?.content === 'string' ? message.content.trim() : '';
    const ok = calls.length > 0 ? !final : !!content;
    await settle(usageId, {
      outcome: ok ? 'OK' : 'FAILED',
      costMicros: cost.micros,
      inputTokens: cost.input,
      outputTokens: cost.output,
      durationMs,
    });
    if (calls.length && !final) {
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: calls,
      });
      for (const call of calls.slice(0, 6)) {
        const read = readToolCall(call);
        let result: unknown;
        if (read.ok) {
          used.push(read.name);
          result = await runTool(user, read.name, read.args, now);
        } else result = { error: read.error };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolContent(result),
        });
      }
      continue;
    }
    if (content) reply = content.slice(0, REPLY_MAX);
    else break;
  }
  console.info(
    `[agent] chat made ${JSON.stringify({ model: MODEL, provider: ENDPOINT, tools: used.length, micros: spent })}`,
  );
  if (reply === null) {
    console.error('[agent] chat failed NoAnswer');
    throw new AiUnavailable(
      `${AGENT_NAME} couldn’t put an answer together. Ask again, more narrowly.`,
    );
  }
  const saved = await db().agentMessage.create({
    data: {
      conversationId,
      userId: user.id,
      role: 'ASSISTANT',
      content: reply,
      metadata: { tools: used, costMicros: spent },
      createdAt: later(),
    },
  });
  await db().agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: saved.createdAt },
  });
  return { conversationId, message: saved };
}
