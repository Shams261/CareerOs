import 'server-only';
import { db } from '@/server/db';
import { aiConfig } from '@/lib/env';
import { dayKey } from '@/lib/time';
import { locked, type ScheduleUser } from '@/features/schedule/service';
import {
  AiRefusal,
  AiUnavailable,
  aiState,
  ask,
  ready,
  type CallWords,
  type Fetcher,
} from '@/features/ai/service';
import { underShare } from '@/features/ai/domain';
import { AGENT_NAME, PERSONA, readStyle, type RumiStyle } from './domain';
import {
  EXTRACT_CAP_SHARE,
  EXTRACT_RATE,
  expiryFor,
  extractionInput,
  extractionMessages,
  isActive,
  MEMORY,
  MEMORY_FORMAT,
  MEMORY_KINDS,
  readMemories,
  sameMemory,
  shouldExtract,
  stalest,
  type MemoryKind,
  type MemoryRow,
} from './memory-domain';

const WORDS: CallWords = {
  unavailable: `${AGENT_NAME} could not take notes right now.`,
  budgetUsed: () => 'Your monthly AI limit is reached.',
  tooMany: 'Enough notes for today.',
  log: '[agent] memory',
};

const select = {
  id: true,
  text: true,
  kind: true,
  source: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

/** Every line, oldest first, for Settings and the prompt (the prompt keeps the active ones). */
export const memoryRows = (user: ScheduleUser): Promise<MemoryRow[]> =>
  db().agentMemory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select,
  });

/** Rumi's settings for this owner, defaults when none were saved yet. */
export async function agentSetting(user: ScheduleUser) {
  const row = await db().agentSetting.findUnique({
    where: { userId: user.id },
  });
  return {
    memoryEnabled: row?.memoryEnabled ?? true,
    lineLanguage: row?.lineLanguage ?? 'en',
    voiceConsentAt: row?.voiceConsentAt ?? null,
    voiceLang: row?.voiceLang ?? 'en-IN',
    speakReplies: row?.speakReplies ?? false,
  };
}
export async function setMemoryEnabled(user: ScheduleUser, on: boolean) {
  await db().agentSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, memoryEnabled: on },
    update: { memoryEnabled: on },
  });
}
/**
 * Voice (WI-104): consent shows the microphone (the time it was given is kept), the language
 * it listens in, and whether replies are read aloud.
 */
export async function setVoiceSettings(
  user: ScheduleUser,
  v: { consent: boolean; lang: string; speakReplies: boolean },
  now = new Date(),
) {
  const row = await db().agentSetting.findUnique({
    where: { userId: user.id },
    select: { voiceConsentAt: true },
  });
  const voiceConsentAt = v.consent ? (row?.voiceConsentAt ?? now) : null;
  const data = {
    voiceConsentAt,
    voiceLang: v.lang,
    speakReplies: v.speakReplies,
  };
  await db().agentSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
}
/** The style chip (WI-100): one of firm, warm, brief, on the AI setting row. */
export async function rumiStyle(user: ScheduleUser): Promise<RumiStyle> {
  const row = await db().aiSetting.findUnique({
    where: { userId: user.id },
    select: { rumiStyle: true },
  });
  return readStyle(row?.rumiStyle);
}
export async function setRumiStyle(user: ScheduleUser, style: RumiStyle) {
  await db().aiSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, rumiStyle: style },
    update: { rumiStyle: style },
  });
}

export type Kept = { id: string; text: string; kind: MemoryKind };

type Tx = Parameters<Parameters<typeof locked>[1]>[0];
/**
 * Keeps one line under the owner lock: a duplicate of an existing line only refreshes it; at
 * the Rumi cap the line Rumi sent least recently gives way; owner lines are never evicted and
 * the list never passes its total. Returns the row kept, or null when nothing changed.
 */
export async function keepLineIn(
  tx: Tx,
  user: ScheduleUser,
  line: {
    text: string;
    kind: MemoryKind;
    source: 'OWNER' | 'RUMI';
    expiresAt: string | null;
    messageId?: string | null;
  },
  now: Date,
) {
  const rows = await tx.agentMemory.findMany({
    where: { userId: user.id },
    select,
  });
  const twin = rows.find((r) => sameMemory(r.text, line.text));
  if (twin) {
    await tx.agentMemory.update({
      where: { id: twin.id },
      data: { lastUsedAt: now },
    });
    return null;
  }
  const rumi = rows.filter((r) => r.source === 'RUMI');
  if (line.source === 'RUMI' && rumi.length >= MEMORY.rumi) {
    const gone = stalest(rumi);
    if (gone) await tx.agentMemory.delete({ where: { id: gone.id } });
  } else if (rows.length >= MEMORY.items) {
    if (line.source === 'OWNER')
      throw new Error(
        `${AGENT_NAME} keeps up to ${MEMORY.items} lines. Remove one first.`,
      );
    const gone = stalest(rumi);
    if (!gone) return null;
    await tx.agentMemory.delete({ where: { id: gone.id } });
  }
  return tx.agentMemory.create({
    data: {
      userId: user.id,
      text: line.text,
      kind: line.kind,
      source: line.source,
      expiresAt: line.expiresAt ? new Date(line.expiresAt) : null,
      messageId: line.messageId ?? null,
      lastUsedAt: now,
    },
    select,
  });
}

/**
 * After an answer (WI-100): one small call that reads only the owner's own last messages and
 * keeps at most two lines, behind a deterministic gate so most messages cost nothing. Any
 * failure is logged by name and swallowed: the owner already has the answer.
 */
export async function extractMemories(
  user: ScheduleUser,
  conversationId: string,
  messageId: string,
  now = new Date(),
  fetcher: Fetcher = fetch,
): Promise<Kept[]> {
  try {
    const cfg = aiConfig();
    if (!cfg) return [];
    const setting = await agentSetting(user);
    if (!setting.memoryEnabled) return [];
    const history = await db().agentMessage.findMany({
      where: { conversationId, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { role: true, content: true },
    });
    const texts = extractionInput(history.reverse());
    const latest = texts.at(-1);
    if (!latest || !shouldExtract(latest)) return [];
    const state = await aiState(user, now);
    if (!underShare(state.spent, state.limit, EXTRACT_CAP_SHARE)) return [];
    await ready(user, cfg, now, fetcher, { requireEnabled: false });
    const today = dayKey(now, user.timezone);
    const existing = (await memoryRows(user)).filter((r) => isActive(r, today));
    const found = await ask({
      user,
      cfg,
      feature: 'AGENT_MEMORY',
      messages: extractionMessages(
        PERSONA,
        existing.map((r) => r.text),
        texts,
      ),
      format: MEMORY_FORMAT,
      read: readMemories,
      now,
      fetcher,
      failure: WORDS.unavailable,
      words: WORDS,
      perFeatureDay: EXTRACT_RATE.day,
    });
    if (!found.length) return [];
    const kept = await locked(user.id, async (tx) => {
      const out: Kept[] = [];
      for (const m of found.slice(0, 2)) {
        const row = await keepLineIn(
          tx,
          user,
          {
            text: m.text,
            kind: MEMORY_KINDS.includes(m.kind) ? m.kind : 'PREFERENCE',
            source: 'RUMI',
            expiresAt: expiryFor(m.kind, today, m.expiresInDays),
            messageId,
          },
          now,
        );
        if (row) out.push({ id: row.id, text: row.text, kind: row.kind });
      }
      if (out.length) {
        const message = await tx.agentMessage.findFirst({
          where: { id: messageId, userId: user.id },
          select: { metadata: true },
        });
        const meta =
          message?.metadata && typeof message.metadata === 'object'
            ? (message.metadata as Record<string, unknown>)
            : {};
        await tx.agentMessage.update({
          where: { id: messageId },
          data: { metadata: { ...meta, kept: out } },
        });
      }
      return out;
    });
    console.info(
      `[agent] memory noted ${JSON.stringify({ added: kept.length, found: found.length })}`,
    );
    return kept;
  } catch (error) {
    if (!(error instanceof AiRefusal))
      console.error(
        '[agent] memory failed',
        error instanceof AiUnavailable || error instanceof Error
          ? error.name
          : 'Error',
      );
    return [];
  }
}

/** Settings → "Forget everything Rumi noted": the owner's own lines stay. */
export async function forgetRumiMemories(user: ScheduleUser) {
  const gone = await db().agentMemory.deleteMany({
    where: { userId: user.id, source: 'RUMI' },
  });
  return gone.count;
}

/** The daily sweep (beside the provider check): lines past their day go, for every owner. */
export async function pruneMemories(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const gone = await db().agentMemory.deleteMany({
    where: { expiresAt: { lt: new Date(today) } },
  });
  if (gone.count) console.info(`[agent] memory pruned ${gone.count}`);
  return gone.count;
}
