/**
 * "Rumi knows" since WI-100 (ADR-030): the pure rules of the memory Rumi keeps itself.
 * Four kinds, two sources, caps and expiry, the gate that decides whether an owner message
 * is worth an extraction call, the extraction input (the owner's own words only), the strict
 * answer format, dedupe, and the lines the system prompt gets. Covered by
 * tests/agent-memory-domain.test.ts.
 */
import { z } from 'zod';
import { shiftDay } from '@/lib/day';
import type { OutputFormat } from '@/features/ai/domain';
import type { Message } from '@/features/ai/domain';

export const MEMORY_KINDS = [
  'GOAL',
  'HABIT',
  'PREFERENCE',
  'SITUATION',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemorySource = 'OWNER' | 'RUMI';
/** At most this many lines in all, this many kept by Rumi, each this long. */
export const MEMORY = { items: 40, rumi: 25, text: 200 } as const;
/** A situation lapses this many days after it was last sent; a goal a week after its date. */
const SITUATION_DAYS = 30;
const GOAL_GRACE_DAYS = 7;
/** Settings says "not mentioned since …" on a habit or preference after this long. */
export const STALE_DAYS = 60;
/** Extraction calls a day, and the share of the month's cap after which they stop. */
export const EXTRACT_RATE = { day: 20 } as const;
export const EXTRACT_CAP_SHARE = 0.9;
/** An owner message under this many characters is never worth a call. */
const EXTRACT_MIN_CHARS = 40;
/** How much of each owner message the extraction sees. */
const EXTRACT_CLIP = 1000;
const EXTRACT_MAX_TOKENS = 160;

export const KIND_LABELS: Record<MemoryKind, string> = {
  GOAL: 'Goal',
  HABIT: 'Habit',
  PREFERENCE: 'Preference',
  SITUATION: 'Situation',
};

export type MemoryRow = {
  id: string;
  text: string;
  kind: MemoryKind;
  source: MemorySource;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

/** The day a line of this kind lapses, as a DATE label; null for the kinds that never do. */
export function expiryFor(
  kind: MemoryKind,
  today: string,
  expiresInDays: number | null = null,
): string | null {
  if (kind === 'SITUATION')
    return shiftDay(today, expiresInDays ?? SITUATION_DAYS);
  if (kind === 'GOAL' && expiresInDays)
    return shiftDay(today, expiresInDays + GOAL_GRACE_DAYS);
  return null;
}
const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** A line still sent: not past its day. */
export const isActive = (row: { expiresAt: Date | null }, today: string) =>
  !row.expiresAt || dayOf(row.expiresAt)! >= today;

/** The words that mark a message as being about the owner, not a question for Rumi. */
const FIRST_PERSON =
  /\b(i|i'm|i’m|i am|my|me|mera|meri|mere|mujhe|main|mai|hum|usually|prefer|always|never|best|rest day|from now|goal|target|aim|aadat|pasand)\b/i;
/**
 * Whether an owner message is worth one extraction call: long enough, a statement rather than
 * a question, and about the owner. Cheap and deterministic, so most messages cost nothing.
 */
export function shouldExtract(text: string) {
  const t = text.trim();
  if (t.length < EXTRACT_MIN_CHARS) return false;
  if (t.endsWith('?')) return false;
  return FIRST_PERSON.test(t);
}

/**
 * What the extraction sees: the owner's own messages only, the last two, each clipped. Never
 * Rumi's replies and never a tool result, which is the one place a never-read field could
 * only ever have been typed by the owner anyway.
 */
export function extractionInput(
  history: { role: 'USER' | 'ASSISTANT'; content: string }[],
) {
  return history
    .filter((m) => m.role === 'USER')
    .slice(-2)
    .map((m) => m.content.trim().slice(0, EXTRACT_CLIP));
}

export const MEMORY_FORMAT: OutputFormat = {
  name: 'memories',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['memories'],
    properties: {
      memories: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'expiresInDays'],
          properties: {
            kind: { type: 'string', enum: [...MEMORY_KINDS] },
            text: { type: 'string', maxLength: MEMORY.text },
            expiresInDays: {
              type: ['integer', 'null'],
              minimum: 1,
              maximum: 365,
            },
          },
        },
      },
    },
  },
  maxTokens: EXTRACT_MAX_TOKENS,
  brief:
    'Your previous answer was cut off. Answer again with at most one memory, under 120 characters, and return only the JSON object.',
};

const memorySchema = z.object({
  memories: z
    .array(
      z
        .object({
          kind: z.enum(MEMORY_KINDS),
          text: z.string().trim().min(8).max(MEMORY.text),
          expiresInDays: z.number().int().min(1).max(365).nullable(),
        })
        .strict(),
    )
    .max(2),
});
export type ExtractedMemory = z.infer<typeof memorySchema>['memories'][number];

/** Reads the extraction answer: JSON in the format, or the reason it was refused. */
export function readMemories(
  content: unknown,
):
  | { ok: true; value: ExtractedMemory[] }
  | { ok: false; issues: string; codes: string } {
  let raw: unknown;
  try {
    raw = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return { ok: false, issues: 'not JSON', codes: 'json' };
  }
  const parsed = memorySchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`)
        .join('; '),
      codes: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join(','),
    };
  return { ok: true, value: parsed.data.memories };
}

/** The extraction request: the persona's rules, the current list to avoid repeats, the owner's words as data. */
export function extractionMessages(
  persona: string,
  existing: string[],
  ownerTexts: string[],
): Message[] {
  return [
    {
      role: 'system',
      content: [
        persona,
        'Task: from the owner’s own messages below, keep at most two lines worth remembering about the owner for later conversations. Only what the owner states about themselves: a goal with its date, a habit (when or how they work), a lasting preference, or a current situation (an interview coming up, a week away). Never infer, never keep a question, a request to you, a fact about a third party, or anything already on the list. An empty list is the right answer for most messages.',
        'Write each line in the owner’s terms, under 200 characters, no quotation marks. kind is GOAL, HABIT, PREFERENCE or SITUATION. expiresInDays is a number of days only for a situation or a dated goal, else null.',
        'Return only a JSON object {"memories":[{"kind":…,"text":…,"expiresInDays":…}]}.',
        existing.length
          ? `Already on the list (do not repeat): ${existing.map((t) => `“${t}”`).join('; ')}`
          : 'The list is empty.',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify({ ownerMessages: ownerTexts }) },
  ];
}

/** Lowercase, no punctuation or accents, one space, no trailing period: the dedupe key. */
export function normaliseMemory(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const words = (t: string) =>
  new Set(
    normaliseMemory(t)
      .split(' ')
      .filter((w) => w.length > 2),
  );
/** The same line twice: equal once normalised, or sharing four fifths of their words. */
export function sameMemory(a: string, b: string) {
  const na = normaliseMemory(a),
    nb = normaliseMemory(b);
  if (na === nb) return true;
  const wa = words(a),
    wb = words(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  const union = wa.size + wb.size - shared;
  return union > 0 && shared / union >= 0.8;
}

/**
 * The lines the system prompt gets, active ones only, grouped by kind in a fixed order. A
 * situation says it may be dated; Rumi's own lines read like the owner's (both are the
 * owner's words).
 */
export function memoryLines(rows: MemoryRow[], today: string): string[] {
  const active = rows.filter((r) => isActive(r, today));
  const out: string[] = [];
  for (const kind of MEMORY_KINDS) {
    for (const r of active.filter((x) => x.kind === kind))
      out.push(
        kind === 'SITUATION' && r.expiresAt
          ? `${KIND_LABELS[kind]} (until ${dayOf(r.expiresAt)}): ${r.text}`
          : `${KIND_LABELS[kind]}: ${r.text}`,
      );
  }
  return out;
}

/**
 * Which Rumi-kept line goes when the Rumi cap is reached: the one not sent for longest (a
 * lapsed line is never sent), then the oldest, since every active line is sent together.
 */
export function stalest<T extends { lastUsedAt: Date | null; createdAt: Date }>(
  rows: T[],
): T | null {
  return (
    [...rows].sort(
      (a, b) =>
        +(a.lastUsedAt ?? a.createdAt) - +(b.lastUsedAt ?? b.createdAt) ||
        +a.createdAt - +b.createdAt,
    )[0] ?? null
  );
}

/** "12 lines · 7 by Rumi", "3 lines", "Nothing yet": the Settings row's line. */
export function memoryContext(rows: { source: MemorySource }[]) {
  if (!rows.length) return 'Nothing yet';
  const rumi = rows.filter((r) => r.source === 'RUMI').length;
  const lines = `${rows.length} ${rows.length === 1 ? 'line' : 'lines'}`;
  return rumi ? `${lines} · ${rumi} by Rumi` : lines;
}
