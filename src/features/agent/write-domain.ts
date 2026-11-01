/**
 * Rumi's small writes (WI-102, ADR-030 class A): pure rules. A write runs at once inside the
 * answer, through the existing owner-scoped services, and leaves an action on the answer
 * with a persistent Undo. Covered by tests/agent-writes-domain.test.ts.
 */
import { z } from 'zod';

/** At most this many writes in one answer, and in the owner's day across answers. */
export const WRITES_PER_ANSWER = 2;
export const WRITES_PER_DAY = 20;
/** No write in the last rounds of an answer, so a change is always followed by its words. */
export const WRITE_FREE_ROUNDS = 2;
/** A block Rumi adds is at most this long. */
export const BLOCK_MAX_MINUTES = 180;
/** How many ids an answer keeps as "seen" for the answers after it. */
export const SEEN_MAX = 300;
/** `find_problems` returns at most this many problems. */
export const FIND_LIMIT = 8;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const noteArgs = z
  .object({ body: z.string().trim().min(1).max(500) })
  .strict();
export const blockArgs = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().trim().min(1).max(80),
    kind: z.string().trim().min(1).max(40),
    start: HHMM,
    end: HHMM,
  })
  .strict();
export const restArgs = z.object({}).strict();
export const findArgs = z
  .object({ text: z.string().trim().min(2).max(60) })
  .strict();
export type BlockArgs = z.infer<typeof blockArgs>;

export const WRITE_TOOLS = ['add_note', 'add_block', 'rest_today'] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];
export const isWrite = (name: string): name is WriteTool =>
  (WRITE_TOOLS as readonly string[]).includes(name);
/**
 * The arguments of each write that name a record. None of the class A writes does; the class
 * B cards of WI-103 name blocks, applications and problems, and each must have been read.
 */
export const WRITE_ID_ARGS: Record<WriteTool, string[]> = {
  add_note: [],
  add_block: [],
  rest_today: [],
};

/** The keys under which a read sends a record's id. */
const ID_KEYS = new Set(['id', 'problemId', 'applicationId', 'roundId']);
/** Every id a read returned, wherever it sits in the result. */
export function collectIds(value: unknown, into = new Set<string>()) {
  if (Array.isArray(value)) for (const v of value) collectIds(v, into);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (ID_KEYS.has(k) && typeof v === 'string' && v.length <= 60)
        into.add(v);
      else collectIds(v, into);
    }
  return into;
}
/** A copy of a read without its ids, for prompts that never need them (Rumi's line). */
export function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !ID_KEYS.has(k))
        .map(([k, v]) => [k, withoutIds(v)]),
    );
  return value;
}
/**
 * The first id argument the model names without having read it, or null. The model may only
 * name records it saw in this conversation's reads; anything else is refused unread.
 */
export function unseenId(
  tool: WriteTool,
  args: Record<string, unknown>,
  seen: ReadonlySet<string>,
) {
  for (const key of WRITE_ID_ARGS[tool]) {
    const v = args[key];
    if (typeof v !== 'string' || !seen.has(v)) return key;
  }
  return null;
}

/** Why a write cannot run now, or null: the round, the answer's cap and the day's cap. */
export function writeRefusal({
  round,
  maxRounds,
  inAnswer,
  today,
}: {
  round: number;
  maxRounds: number;
  inAnswer: number;
  today: number;
}) {
  if (round > maxRounds - WRITE_FREE_ROUNDS)
    return 'No more changes in this answer. Say what is done so far.';
  if (inAnswer >= WRITES_PER_ANSWER)
    return `At most ${WRITES_PER_ANSWER} changes in one answer. Say what is done; the owner can ask again.`;
  if (today >= WRITES_PER_DAY)
    return `${WRITES_PER_DAY} changes today already. Tell the owner where to make this one in Silsila.`;
  return null;
}

/** Minutes between two clock times on one day. */
export const spanMinutes = (start: string, end: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(end) - m(start);
};

const undoSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('remove-note'),
    payload: z.object({ id: z.string().min(1) }).strict(),
  }),
  z.object({
    kind: z.literal('cancel-block'),
    payload: z.object({ id: z.string().min(1) }).strict(),
  }),
  z.object({
    kind: z.literal('clear-rest-day'),
    payload: z
      .object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .strict(),
  }),
]);
/** One change Rumi made in an answer, kept on the answer with its Undo. */
export const actionSchema = z
  .object({
    id: z.string().min(1),
    tool: z.enum(WRITE_TOOLS),
    label: z.string().min(1).max(60),
    detail: z.string().max(600),
    undo: undoSchema,
    status: z.enum(['done', 'undone']),
  })
  .strict();
export type WriteAction = z.infer<typeof actionSchema>;
/** The undo kind each write leaves; anything else in stored metadata is never run. */
export const UNDO_FOR: Record<WriteTool, WriteAction['undo']['kind']> = {
  add_note: 'remove-note',
  add_block: 'cancel-block',
  rest_today: 'clear-rest-day',
};
/** A stored action may be undone only with the undo its own tool leaves. */
export const undoMatches = (a: WriteAction) => UNDO_FOR[a.tool] === a.undo.kind;
/** The actions stored on an answer; anything malformed or mismatched reads as nothing. */
export function readActions(raw: unknown): WriteAction[] {
  const list =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).actions
      : undefined;
  return (Array.isArray(list) ? list : []).flatMap((x) => {
    const r = actionSchema.safeParse(x);
    return r.success && undoMatches(r.data) ? [r.data] : [];
  });
}

/** The words while a write runs (the progress line), and on the row under the answer. */
export const WRITE_WORDS: Record<WriteTool, string> = {
  add_note: 'adding a note',
  add_block: 'adding a block',
  rest_today: 'marking a rest day',
};
