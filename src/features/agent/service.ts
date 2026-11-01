import 'server-only';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { aiConfig } from '@/lib/env';
import { dayKey, hhmm, shortDate } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import {
  AiRefusal,
  AiUnavailable,
  aiState,
  callModel,
  ready,
  settle,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { budgetLine, ENDPOINT, MODEL, nearCap } from '@/features/ai/domain';
import { issueMessages } from '@/lib/validation';
import { z } from 'zod';
import {
  AGENT_NAME,
  AGENT_RATE,
  chatBody,
  chatReservation,
  conversationTitle,
  HISTORY,
  historyWindow,
  MAX_ROUNDS,
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
import {
  extractMemories,
  keepLineIn,
  memoryRows,
  rumiStyle,
  type Kept,
} from './memory-service';
import {
  expiryFor,
  isActive,
  memoryLines,
  type MemoryKind,
} from './memory-domain';
import { linesToday } from './lines';
import { runWrite } from './writes';
import { prepareRequest } from './requests';
import {
  isRequest,
  REQUESTS_PER_ANSWER,
  type ActionCard,
  type CardView,
} from './request-domain';
import {
  collectIds,
  isWrite,
  SEEN_MAX,
  unseenId,
  type WriteAction,
} from './write-domain';
import { newSuggestion, proposeBlocks } from './plans';
import {
  planWindow,
  PROPOSALS_PER_ANSWER,
  readMetadata,
  readTools,
  SUGGESTIONS_PER_ANSWER,
  type ProposeArgs,
  type Proposal,
  type Suggestion,
  readSeen,
} from './plan-domain';

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
        select: {
          id: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

export async function deleteConversation(user: ScheduleUser, id: string) {
  const found = await db().agentConversation.deleteMany({
    where: { id, userId: user.id },
  });
  if (!found.count) throw new Error('This conversation was already deleted.');
}

/** "Rumi knows": every line, oldest first (WI-100: with its kind, source and days). */
export const memories = memoryRows;
/** A line the owner writes (WI-100: with a kind; the rules of keepLineIn apply). */
export async function addMemory(
  user: ScheduleUser,
  raw: unknown,
  kind: MemoryKind = 'PREFERENCE',
  now = new Date(),
) {
  const text = memoryInput.parse(raw);
  const today = dayKey(now, user.timezone);
  return locked(user.id, async (tx) => {
    const row = await keepLineIn(
      tx,
      user,
      {
        text,
        kind,
        source: 'OWNER',
        expiresAt: expiryFor(kind, today),
      },
      now,
    );
    if (!row) throw new Error(`${AGENT_NAME} already has that line.`);
    return row;
  });
}
/** Removes one line and returns it, so Undo can put it back (WI-100). */
export async function removeMemory(user: ScheduleUser, id: string) {
  return locked(user.id, async (tx) => {
    const row = await tx.agentMemory.findFirst({
      where: { id, userId: user.id },
    });
    if (!row) throw new Error('This line was already removed.');
    await tx.agentMemory.delete({ where: { id: row.id } });
    return row;
  });
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
  input: {
    conversationId?: string | null;
    text: unknown;
    /** Each read as it starts, for the live "reading" line (WI-055). Never the result. */
    onRead?: (tool: string) => void;
    /** Each change as it starts (WI-102), for the same line. Never its arguments. */
    onWrite?: (tool: string) => void;
  },
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
      select: { role: true, content: true, metadata: true },
    });
    return { conversationId: id, history: history.reverse() };
  });
  const today = dayKey(now, user.timezone);
  const [rows, goal, style, nudges] = await Promise.all([
    memoryRows(user),
    // The nearest active goal with a date, else any active goal (WI-060).
    db().goal.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }],
      select: { title: true, targetDate: true, targetRole: true },
    }),
    rumiStyle(user),
    db().studyNudgeSetting.findUnique({
      where: { userId: user.id },
      select: { rumiLines: true },
    }),
  ]);
  // The lines Rumi wrote today (WI-101) travel as data while Rumi writes them.
  const written = nudges?.rumiLines ? await linesToday(user, today) : [];
  // The lines sent today are stamped once a day (WI-100), so expiry and eviction follow use.
  const dayStart = new Date(`${today}T00:00:00Z`);
  const active = rows.filter((r) => isActive(r, today));
  if (active.some((r) => !r.lastUsedAt || r.lastUsedAt < dayStart))
    await db().agentMemory.updateMany({
      where: {
        userId: user.id,
        id: { in: active.map((r) => r.id) },
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: dayStart } }],
      },
      data: { lastUsedAt: now },
    });
  const memory = memoryLines(rows, today);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt({
        today: dayKey(now, user.timezone),
        weekday: formatInTimeZone(now, user.timezone, 'EEEE'),
        time: hhmm(now, user.timezone),
        zone: user.timezone,
        memory,
        style,
        linesToday: written,
        planUntil: planWindow(dayKey(now, user.timezone)).last,
        goal: goal
          ? {
              title: goal.title,
              targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null,
              targetRole: goal.targetRole,
            }
          : null,
      }),
    },
    ...historyWindow(history),
  ];
  const started = Date.now();
  // Stored after the question even when the test clock (`now`) is ahead of the real one.
  const later = () => new Date(+now + Math.max(1, Date.now() - started));
  const used: string[] = [];
  // The ids this conversation's reads returned (WI-102): a write may name only these.
  const seen = new Set(
    history
      .filter((m) => m.role === 'ASSISTANT')
      .flatMap((m) => readSeen(m.metadata)),
  );
  const actions: WriteAction[] = [];
  const requests: ActionCard[] = [];
  const proposals: Proposal[] = [];
  const suggestions: Suggestion[] = [];
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
        if (!read.ok) result = { error: read.error };
        else {
          used.push(read.name);
          input.onRead?.(read.name);
          if (read.name === 'propose_blocks') {
            if (proposals.length >= PROPOSALS_PER_ANSWER)
              result = { error: 'One answer holds at most two plans.' };
            else {
              const made = await proposeBlocks(
                user,
                read.args as ProposeArgs,
                now,
              );
              if (made.proposal) proposals.push(made.proposal);
              result = made.result;
            }
          } else if (read.name === 'suggest_memory') {
            const args = read.args as { text: string; reason: string };
            if (suggestions.length >= SUGGESTIONS_PER_ANSWER)
              result = { error: 'One suggestion per answer.' };
            else {
              suggestions.push(newSuggestion(args.text, args.reason));
              result = {
                shown: true,
                note: 'Shown to the owner as a card; they keep or dismiss it.',
              };
            }
          } else if (isRequest(read.name)) {
            const missing = unseenId(read.name, read.args, seen);
            if (missing)
              result = {
                shown: false,
                error: `Read it first: ${missing} must come from a read in this conversation.`,
              };
            else if (requests.length >= REQUESTS_PER_ANSWER)
              result = {
                shown: false,
                error: `At most ${REQUESTS_PER_ANSWER} cards in one answer.`,
              };
            else {
              const made = await prepareRequest(
                user,
                read.name,
                read.args,
                now,
              );
              if (made.card) requests.push(made.card);
              result = made.result;
            }
          } else if (isWrite(read.name)) {
            const missing = unseenId(read.name, read.args, seen);
            if (missing)
              result = {
                done: false,
                error: `Read it first: ${missing} must come from a read in this conversation.`,
              };
            else {
              input.onWrite?.(read.name);
              const made = await runWrite(user, read.name, read.args, now, {
                round,
                maxRounds: MAX_ROUNDS,
                inAnswer: actions.length,
              });
              if (made.action) actions.push(made.action);
              result = made.result;
            }
          } else {
            result = await runTool(user, read.name, read.args, now);
            collectIds(result, seen);
          }
        }
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
      metadata: {
        tools: used,
        costMicros: spent,
        ...(proposals.length ? { proposals } : {}),
        ...(suggestions.length ? { suggestions } : {}),
        ...(actions.length ? { actions } : {}),
        ...(requests.length
          ? { requests: requests as Prisma.InputJsonValue[] }
          : {}),
        ...(seen.size ? { seen: [...seen].slice(-SEEN_MAX) } : {}),
      },
      createdAt: later(),
    },
  });
  await db().agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: saved.createdAt },
  });
  return { conversationId, message: saved };
}

export type AskResult =
  | {
      ok: true;
      conversationId: string;
      reply: {
        id: string;
        content: string;
        proposals: Proposal[];
        suggestions: Suggestion[];
        /** Lines Rumi kept after this answer (WI-100). */
        kept: Kept[];
        /** Changes Rumi made in this answer (WI-102), each with its Undo. */
        actions: WriteAction[];
        /** Cards Rumi made (WI-103) for the owner to apply. */
        requests: CardView[];
        tools: string[];
      };
      budget: string;
      /** Whether the month is near its cap; the chat shows the budget only then (WI-060). */
      nearCap: boolean;
    }
  | {
      ok: false;
      message: string;
      conversationId?: string;
      budget?: string;
      nearCap?: boolean;
    };

/**
 * One question to Rumi as the page needs it (WI-040, WI-055): the answer with its cards and
 * reads, and the month's budget line, or a plain message. Shared by the server action and the
 * streaming route, which passes `onRead` to show each read as it starts.
 */
export async function askRumi(
  user: ScheduleUser,
  conversationId: string | null,
  text: string,
  onRead?: (tool: string) => void,
  fetcher: Fetcher = fetch,
  /** Each change as it starts (WI-102). */
  onWrite?: (tool: string) => void,
): Promise<AskResult> {
  try {
    const result = await sendMessage(
      user,
      {
        conversationId: conversationId
          ? z.string().min(1).parse(conversationId)
          : null,
        text,
        onRead,
        onWrite,
      },
      new Date(),
      fetcher,
    );
    const state = await aiState(user);
    return {
      ok: true,
      conversationId: result.conversationId,
      reply: {
        id: result.message.id,
        content: result.message.content,
        ...readMetadata(result.message.metadata),
        tools: readTools(result.message.metadata),
      },
      budget: budgetLine(state.spent),
      nearCap: nearCap(state.spent),
    };
  } catch (error) {
    const state = await aiState(user).catch(() => null);
    const budget = state ? budgetLine(state.spent) : undefined;
    const near = state ? nearCap(state.spent) : false;
    if (error instanceof z.ZodError)
      return {
        ok: false,
        message: issueMessages(error.issues),
        budget,
        nearCap: near,
      };
    if (error instanceof AiRefusal || error instanceof AiUnavailable)
      return { ok: false, message: error.message, budget, nearCap: near };
    console.error(
      '[agent] chat failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false, message: UNAVAILABLE, budget, nearCap: near };
  }
}

/**
 * After an answer (WI-100): Rumi's notes from the owner's own words. The server action waits
 * for them; the streaming route sends the answer first and these after it.
 */
export async function noteMemories(
  user: ScheduleUser,
  result: AskResult,
  fetcher: Fetcher = fetch,
): Promise<Kept[]> {
  if (!result.ok) return [];
  return extractMemories(
    user,
    result.conversationId,
    result.reply.id,
    new Date(),
    fetcher,
  );
}
