import 'server-only';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { dayKey, hhmm } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import type { ScheduleUser } from '@/features/schedule/service';
import {
  AiRefusal,
  AiUnavailable,
  aiState,
  ask,
  ready,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { CAP_MICROS } from '@/features/ai/domain';
import { AGENT_NAME, PERSONA, readStyle, type ToolName } from './domain';
import {
  LINE_CAP_SHARE,
  LINE_FORMAT,
  LINE_READS,
  LINE_TRIES,
  lineMessages,
  readLine,
  readText,
  rumiStateOf,
  type LinePart,
} from './line-domain';
export { rumiStateOf, type RumiState } from './line-domain';
import { isActive, memoryLines } from './memory-domain';
import { agentSetting, memoryRows } from './memory-service';
import { runTool } from './tools';
import { readLineLanguage } from '@/features/nudges/domain';

const WORDS: CallWords = {
  unavailable: `${AGENT_NAME} could not write the line.`,
  budgetUsed: () => 'This month’s AI budget is used.',
  log: '[agent] line',
};
/** The part of the day a row is, from its type. */
export const partOf = (type: string): LinePart | null =>
  type === 'STUDY_MORNING'
    ? 'morning'
    : type === 'STUDY_MIDDAY'
      ? 'midday'
      : type === 'STUDY_EVENING'
        ? 'evening'
        : null;
const metaOf = (metadata: unknown) =>
  metadata && typeof metadata === 'object'
    ? (metadata as Record<string, unknown>)
    : {};

/**
 * Writes Rumi's line on at most one pending row per run (WI-101): outside every owner lock,
 * after the reminder loop and before push. Code runs the part's reads, one strict call writes
 * the line, `lineOk` checks it (inside `ask`'s read, so a rejected line gets one retry), and
 * the row's body is replaced. A blocked provider, the cap, a refusal or a second failure
 * leaves the template: the row is marked `fallback` so push stops waiting.
 */
export async function writeRumiLines(
  now = new Date(),
  fetcher: Fetcher = fetch,
) {
  const row = await db().notificationLog.findFirst({
    where: {
      type: { in: ['STUDY_MORNING', 'STUDY_MIDDAY', 'STUDY_EVENING'] },
      readAt: null,
      metadata: { path: ['rumi'], equals: 'pending' },
    },
    orderBy: { scheduledFor: 'asc' },
    include: { user: { select: { id: true, timezone: true, name: true } } },
  });
  if (!row) return { written: 0, fallback: 0 };
  const part = partOf(row.type)!;
  const meta = metaOf(row.metadata);
  const tries = Number(meta.rumiTries ?? 0) + 1;
  const settle = async (body: string | null) => {
    await db().notificationLog.update({
      where: { id: row.id },
      data: body
        ? { body, metadata: { ...meta, rumi: 'written', rumiTries: tries } }
        : {
            metadata: {
              ...meta,
              rumi: tries >= LINE_TRIES ? 'fallback' : 'pending',
              rumiTries: tries,
            },
          },
    });
    const fallback = !body && tries >= LINE_TRIES;
    console.info(
      `[agent] line made ${JSON.stringify({ part, written: !!body, fallback, tries })}`,
    );
    return body
      ? { written: 1, fallback: 0 }
      : { written: 0, fallback: fallback ? 1 : 0 };
  };
  try {
    const line = await writeLine(row.user, part, now, fetcher);
    return settle(line);
  } catch (error) {
    if (!(error instanceof AiRefusal))
      console.error(
        '[agent] line failed',
        error instanceof AiUnavailable || error instanceof Error
          ? error.name
          : 'Error',
      );
    return settle(null);
  }
}

/** One line for one owner and part, or null when AI is off, blocked or near the cap. */
async function writeLine(
  user: ScheduleUser & { name: string | null },
  part: LinePart,
  now: Date,
  fetcher: Fetcher,
): Promise<string | null> {
  const cfg = aiConfig();
  if (!cfg) return null;
  const state = await aiState(user, now);
  if (state.spent >= CAP_MICROS * LINE_CAP_SHARE) return null;
  await ready(user, cfg, now, fetcher, { requireEnabled: false });
  const today = dayKey(now, user.timezone);
  const reads: Record<string, string> = {};
  for (const [name, args] of LINE_READS[part]) {
    const filled =
      name === 'get_schedule'
        ? { from: shiftDay(today, 1), to: shiftDay(today, 1) }
        : args;
    reads[name] = readText(await runTool(user, name as ToolName, filled, now));
  }
  const [rows, goal, setting, ai] = await Promise.all([
    memoryRows(user),
    db().goal.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: [{ targetDate: { sort: 'asc', nulls: 'last' } }],
      select: { title: true, targetDate: true, targetRole: true },
    }),
    agentSetting(user),
    db().aiSetting.findUnique({
      where: { userId: user.id },
      select: { rumiStyle: true },
    }),
  ]);
  const memory = memoryLines(
    rows.filter((r) => isActive(r, today)),
    today,
  );
  const readsText = Object.values(reads).join('\n');
  return ask<string>({
    user,
    cfg,
    feature: 'AGENT_LINE',
    messages: lineMessages({
      part,
      persona: PERSONA,
      style: readStyle(ai?.rumiStyle),
      language: readLineLanguage(setting.lineLanguage),
      today,
      weekday: formatInTimeZone(now, user.timezone, 'EEEE'),
      time: hhmm(now, user.timezone),
      name: user.name?.split(' ')[0] ?? null,
      goal: goal
        ? `${goal.title}${goal.targetDate ? `, by ${goal.targetDate.toISOString().slice(0, 10)}` : ''}${goal.targetRole ? `, aiming at ${goal.targetRole}` : ''}`
        : null,
      memory,
      reads,
    }),
    format: LINE_FORMAT,
    read: readLine(readsText),
    now,
    fetcher,
    failure: WORDS.unavailable,
    words: WORDS,
  });
}

/** The lines Rumi wrote today, as data for the chat (WI-101). */
export async function linesToday(user: ScheduleUser, day: string) {
  const rows = await db().notificationLog.findMany({
    where: {
      userId: user.id,
      type: { in: ['STUDY_MORNING', 'STUDY_MIDDAY', 'STUDY_EVENING'] },
      dedupeKey: { endsWith: `:${day}` },
      metadata: { path: ['rumi'], equals: 'written' },
    },
    orderBy: { scheduledFor: 'asc' },
    select: { type: true, body: true },
  });
  return rows.map((r) => `${partOf(r.type) ?? r.type}: ${r.body}`);
}

/** Written against fallback over the last days, for Settings (the owner's rating aid). */
export async function lineStats(user: ScheduleUser, now: Date, days = 14) {
  const rows = await db().notificationLog.findMany({
    where: {
      userId: user.id,
      type: { in: ['STUDY_MORNING', 'STUDY_MIDDAY', 'STUDY_EVENING'] },
      scheduledFor: { gte: new Date(+now - days * 86_400_000) },
    },
    select: { metadata: true },
  });
  const states = rows.map((r) => rumiStateOf(r.metadata));
  return {
    written: states.filter((s) => s === 'written').length,
    total: states.filter((s) => s === 'written' || s === 'fallback').length,
  };
}
