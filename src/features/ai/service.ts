import 'server-only';
import { z } from 'zod';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { aiConfig, type AiConfig } from '@/lib/env';
import { dayKey, shortDate } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { recordRun } from '@/server/jobs';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import { revisionDue } from '@/features/roadmap/service';
import {
  CHECK_MAX_AGE_MS,
  costMicros,
  BRIEF_RETRY,
  ENDPOINT,
  evaluateProvider,
  firstMessages,
  hasSubstance,
  MODEL,
  monthWindow,
  PROVIDER_NAME,
  RATE,
  readLadder,
  requestBody,
  reservationMicros,
  studyInput,
  TIMEOUT_MS,
  withinCap,
  hintMessages,
  HINTS_FORMAT,
  LADDER_FORMAT,
  problemInput,
  readHints,
  type Hints,
  type Ladder,
  type Message,
  type OutputFormat,
  type Ticks,
} from './domain';

export type Fetcher = typeof fetch;
/** A refusal the owner can act on; no request was sent. */
export class AiRefusal extends Error {
  name = 'AiRefusal';
}
/** The provider could not give a usable answer; the message stays general. */
export class AiUnavailable extends Error {
  name = 'AiUnavailable';
}
const UNAVAILABLE = 'Grill Me is unavailable right now.';

/** Spend this month (pending reservations included), in millionths of a US dollar. */
async function monthSpend(
  client: Pick<Prisma.TransactionClient, 'aiUsage'>,
  user: ScheduleUser,
  now: Date,
) {
  const w = monthWindow(dayKey(now, user.timezone), user.timezone);
  const sum = await client.aiUsage.aggregate({
    where: { userId: user.id, createdAt: { gte: w.start, lt: w.end } },
    _sum: { costMicros: true },
  });
  return { spent: sum._sum.costMicros ?? 0, resetDay: w.resetDay };
}

/** What the page needs to know: configured, switched on, blocked, and the month's spend. */
export async function aiState(user: ScheduleUser, now = new Date()) {
  const configured = !!aiConfig();
  if (!configured)
    return {
      configured,
      enabled: false,
      blocked: null,
      checkedAt: null,
      spent: 0,
      resetDay: monthWindow(dayKey(now, user.timezone), user.timezone).resetDay,
    };
  const [setting, spend] = await Promise.all([
    db().aiSetting.findUnique({ where: { userId: user.id } }),
    monthSpend(db(), user, now),
  ]);
  return {
    configured,
    enabled: setting?.enabled ?? true,
    blocked: setting?.blockedAt ? (setting.blockedReason ?? UNAVAILABLE) : null,
    checkedAt: setting?.checkedAt ?? null,
    ...spend,
  };
}

async function getJson(url: string, fetcher: Fetcher) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new AiUnavailable(`HTTP ${res.status}`);
  return res.json();
}
/** Runs the ADR-022 check against OpenRouter's public lists (no key is sent). */
export async function checkProvider(cfg: AiConfig, fetcher: Fetcher = fetch) {
  try {
    const [endpoints, zdr] = await Promise.all([
      getJson(`${cfg.baseUrl}/models/${MODEL}/endpoints`, fetcher),
      getJson(`${cfg.baseUrl}/endpoints/zdr`, fetcher),
    ]);
    return evaluateProvider(endpoints, zdr);
  } catch (error) {
    console.error(
      '[study] provider check failed',
      error instanceof Error ? error.name : 'Error',
    );
    return { ok: false as const, reason: 'OpenRouter could not be checked' };
  }
}

/**
 * Applies a check to one owner. A failure blocks Grill Me; only the owner's own "Check again"
 * lifts a block, and only when the check passes.
 */
async function applyCheck(
  userId: string,
  result: { ok: boolean; reason: string | null },
  byOwner: boolean,
  now: Date,
) {
  const block = result.ok
    ? byOwner
      ? { blockedAt: null, blockedReason: null }
      : {}
    : { blockedAt: now, blockedReason: result.reason };
  await db().aiSetting.upsert({
    where: { userId },
    create: { userId, checkedAt: now, ...block },
    update: { checkedAt: now, ...block },
  });
}
export async function checkAgain(
  user: ScheduleUser,
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal('Grill Me is not configured on this server.');
  const result = await checkProvider(cfg, fetcher);
  await applyCheck(user.id, result, true, now);
  return result;
}
/**
 * Once a day from the scheduler: the same check, applied to every owner who has used Grill
 * Me (a first use always checks first). It can block but never lifts a block.
 */
export async function dailyProviderCheck(
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const cfg = aiConfig();
  if (!cfg) return null;
  const last = await db().jobRun.findUnique({
    where: { name: 'ai-provider-check' },
  });
  if (last?.lastStartedAt && +now - +last.lastStartedAt < 20 * 3600_000)
    return null;
  return recordRun('ai-provider-check', async () => {
    const result = await checkProvider(cfg, fetcher);
    await db().aiSetting.updateMany({
      data: result.ok
        ? { checkedAt: now }
        : { checkedAt: now, blockedAt: now, blockedReason: result.reason },
    });
    return { ok: result.ok };
  });
}

const settle = (
  id: string,
  data: {
    outcome: 'OK' | 'FAILED';
    costMicros: number;
    inputTokens?: number;
    outputTokens?: number;
    durationMs: number;
  },
) => db().aiUsage.update({ where: { id }, data });

/** The owner's switch and the provider check, before any AI request. */
async function ready(
  user: ScheduleUser,
  cfg: AiConfig,
  now: Date,
  fetcher: Fetcher,
) {
  let setting = await db().aiSetting.findUnique({ where: { userId: user.id } });
  if (setting && !setting.enabled)
    throw new AiRefusal('Grill Me is turned off in Settings.');
  if (!setting?.checkedAt || +now - +setting.checkedAt > CHECK_MAX_AGE_MS) {
    await applyCheck(user.id, await checkProvider(cfg, fetcher), false, now);
    setting = await db().aiSetting.findUnique({ where: { userId: user.id } });
  }
  if (setting?.blockedAt) throw new AiRefusal(UNAVAILABLE);
}

/**
 * One AI answer in a strict format, shared by Grill Me (WI-031) and the problem hints
 * (WI-032). Each call is reserved in the ledger under the owner lock before it is sent, so
 * the cap and the rate limits hold; the answer must come from the pinned provider; a
 * malformed answer gets one retry (a cut-off one is asked again, briefly). Nothing of the
 * prompt or the answer is stored.
 */
async function ask<T>({
  user,
  cfg,
  feature,
  messages,
  format,
  read,
  now,
  fetcher,
}: {
  user: ScheduleUser;
  cfg: AiConfig;
  feature: 'GRILL_ITEM' | 'GRILL_PROBLEM';
  messages: Message[];
  format: OutputFormat;
  read: (
    content: unknown,
  ) => { ok: true; value: T } | { ok: false; issues: string; codes: string };
  now: Date;
  fetcher: Fetcher;
}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reserve = reservationMicros(messages, format.maxTokens);
    const usage = await locked(user.id, async (tx) => {
      const hour = new Date(+now - 3600_000),
        day = new Date(+now - 24 * 3600_000);
      const [lastHour, lastDay, spend] = await Promise.all([
        tx.aiUsage.count({
          where: { userId: user.id, createdAt: { gte: hour } },
        }),
        tx.aiUsage.count({
          where: { userId: user.id, createdAt: { gte: day } },
        }),
        monthSpend(tx, user, now),
      ]);
      if (lastHour >= RATE.hour || lastDay >= RATE.day)
        throw new AiRefusal(
          'That is enough Grill Me for now. Try again in a while.',
        );
      if (!withinCap(spend.spent, reserve))
        throw new AiRefusal(
          `This month’s AI budget is used. Grill Me returns on ${shortDate(spend.resetDay)}.`,
        );
      return tx.aiUsage.create({
        data: {
          userId: user.id,
          feature,
          model: MODEL,
          provider: ENDPOINT,
          costMicros: reserve,
          createdAt: now,
        },
      });
    });
    const started = Date.now();
    let body: {
      provider?: unknown;
      usage?: unknown;
      choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    };
    try {
      const res = await fetcher(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Silsila',
        },
        body: JSON.stringify(requestBody(messages, format)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new AiUnavailable(`HTTP ${res.status}`);
      body = await res.json();
    } catch (error) {
      await settle(usage.id, {
        outcome: 'FAILED',
        costMicros: 0,
        durationMs: Date.now() - started,
      });
      console.error(
        '[study] grill failed',
        error instanceof Error ? error.name : 'Error',
      );
      throw new AiUnavailable(UNAVAILABLE);
    }
    const cost = costMicros(body.usage);
    const durationMs = Date.now() - started;
    if (body.provider !== PROVIDER_NAME) {
      // Answered outside the pinned endpoint: count it, block AI until the owner checks again.
      await settle(usage.id, {
        outcome: 'FAILED',
        costMicros: cost.micros,
        inputTokens: cost.input,
        outputTokens: cost.output,
        durationMs,
      });
      await applyCheck(
        user.id,
        {
          ok: false,
          reason: 'A request was answered outside the pinned endpoint',
        },
        false,
        now,
      );
      console.error('[study] grill failed ProviderMismatch');
      throw new AiUnavailable(UNAVAILABLE);
    }
    const content = body.choices?.[0]?.message?.content;
    const result = read(content);
    await settle(usage.id, {
      outcome: result.ok ? 'OK' : 'FAILED',
      costMicros: cost.micros,
      inputTokens: cost.input,
      outputTokens: cost.output,
      durationMs,
    });
    if (result.ok) {
      console.info(
        `[study] grill made ${JSON.stringify({ model: MODEL, provider: ENDPOINT, tokens: cost.input + cost.output, ms: durationMs })}`,
      );
      return result.value;
    }
    const cutOff = body.choices?.[0]?.finish_reason === 'length';
    console.error(
      `[study] grill failed ${cutOff ? 'CutOff' : `InvalidLadder ${result.codes}`}`,
    );
    // The rejected answer is never sent back: the retry asks again, saying what to fix.
    messages.push({
      role: 'user',
      content: cutOff
        ? BRIEF_RETRY
        : `Your previous answer did not match the rules: ${result.issues}. Answer again from the start, following every rule, and return only the JSON object.`,
    });
  }
  throw new AiUnavailable(
    'Couldn’t build a useful ladder for this item. Try again later.',
  );
}

/** Grill Me on one roadmap item (WI-031): the owner's ticked fields, five rungs back. */
export async function grill(
  user: ScheduleUser,
  itemId: string,
  ticks: Ticks,
  now = new Date(),
  fetcher: Fetcher = fetch,
): Promise<Ladder> {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(UNAVAILABLE);
  const item = await db().roadmapItem.findFirst({
    where: { id: itemId, userId: user.id },
    include: { roadmap: { select: { title: true, studyAi: true } } },
  });
  if (!item)
    throw new AiRefusal('This item no longer exists. Reload the page.');
  if (!item.roadmap.studyAi)
    throw new AiRefusal('Study AI is off for this roadmap.');
  if (isTestNamed(item.title, item.roadmap.title))
    throw new AiRefusal('Grill Me skips test records.');
  await ready(user, cfg, now, fetcher);
  const payload = studyInput(item, ticks);
  if (!hasSubstance(payload))
    throw new AiRefusal(
      'Add a scope or “done when” line for better questions.',
    );
  return ask({
    user,
    cfg,
    feature: 'GRILL_ITEM',
    messages: firstMessages(payload),
    format: LADDER_FORMAT,
    read: (c) => {
      const r = readLadder(c);
      return r.ok ? { ok: true, value: r.ladder } : r;
    },
    now,
    fetcher,
  });
}

/**
 * Five hints on a Practice problem (WI-032): only its title, difficulty, platform and topic
 * are sent; hints never carry a solution or code.
 */
export async function problemHints(
  user: ScheduleUser,
  problemId: string,
  now = new Date(),
  fetcher: Fetcher = fetch,
): Promise<Hints> {
  const cfg = aiConfig();
  if (!cfg) throw new AiRefusal(UNAVAILABLE);
  const problem = await db().dsaProblem.findFirst({
    where: { id: problemId, userId: user.id },
    include: { topic: { select: { name: true } } },
  });
  if (!problem)
    throw new AiRefusal('This problem no longer exists. Reload the page.');
  if (isTestNamed(problem.title, problem.topic.name))
    throw new AiRefusal('Grill Me skips test records.');
  await ready(user, cfg, now, fetcher);
  return ask({
    user,
    cfg,
    feature: 'GRILL_PROBLEM',
    messages: hintMessages(
      problemInput({ ...problem, topic: problem.topic.name }),
    ),
    format: HINTS_FORMAT,
    read: (c) => {
      const r = readHints(c);
      return r.ok ? { ok: true, value: r.hints } : r;
    },
    now,
    fetcher,
  });
}

export const cardInput = z.object({
  itemId: z.string().min(1),
  question: z.string().trim().min(8).max(300),
  change: z.string().trim().max(160).optional().default(''),
  points: z.array(z.string().trim().min(2).max(220)).min(3).max(5),
});
/** Keep as card: the owner's chosen rung becomes a revision card on the item. */
export async function keepCard(user: ScheduleUser, raw: unknown) {
  const input = cardInput.parse(raw);
  const item = await db().roadmapItem.findFirst({
    where: { id: input.itemId, userId: user.id },
    select: { id: true },
  });
  if (!item) throw new Error('This item no longer exists. Reload the page.');
  const existing = await db().revisionCard.findUnique({
    where: {
      roadmapItemId_question: {
        roadmapItemId: item.id,
        question: input.question,
      },
    },
  });
  if (existing) return { card: existing, created: false };
  const card = await db().revisionCard.create({
    data: {
      userId: user.id,
      roadmapItemId: item.id,
      question: input.question,
      change: input.change || null,
      points: input.points,
    },
  });
  return { card, created: true };
}
export async function removeCard(user: ScheduleUser, id: string) {
  const card = await db().revisionCard.findFirst({
    where: { id, userId: user.id },
  });
  if (!card) throw new Error('This card was already removed.');
  await db().revisionCard.delete({ where: { id: card.id } });
  return card;
}

/**
 * Today's revision deck (WI-032): the cards the owner kept, on roadmap items due for revision
 * today or overdue, in the items' due order. Only kept cards; nothing is generated here.
 */
export async function revisionDeck(user: ScheduleUser, now = new Date()) {
  const due = (await revisionDue(user, now)).filter(
    (i) => i._count.revisionCards > 0,
  );
  if (!due.length) return { items: [], cards: [] };
  const order = new Map(due.map((i, n) => [i.id, n]));
  const cards = await db().revisionCard.findMany({
    where: { userId: user.id, roadmapItemId: { in: due.map((i) => i.id) } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      roadmapItemId: true,
      question: true,
      change: true,
      points: true,
    },
  });
  cards.sort(
    (a, b) => order.get(a.roadmapItemId)! - order.get(b.roadmapItemId)!,
  );
  return {
    items: due.map((i) => ({
      id: i.id,
      title: i.title,
      href: `/roadmap/${i.roadmap.id}?section=${encodeURIComponent(i.section)}&show=revision#item-${i.id}`,
      roadmap: i.roadmap.title,
    })),
    cards,
  };
}
