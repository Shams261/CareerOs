/**
 * Rumi's bigger changes as one-press cards (WI-103, ADR-030 class B): pure rules. Rumi asks;
 * the card is checked when it is made and stored on the answer; only the owner's press
 * applies it, after the target is checked again under the owner lock against the snapshot
 * the card was made from. Covered by tests/agent-cards.test.ts.
 */
import { z } from 'zod';
import { interviewTypes } from '@/features/jobs/domain';
import { REQUEST_WORDS } from './text';

/** At most this many cards in one answer. */
export const REQUESTS_PER_ANSWER = 2;
const ID = z.string().min(1).max(60);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const CONFIDENCE_WORDS = ['shaky', 'okay', 'solid'] as const;
export const SOLVED_WORDS = ['yes', 'partial', 'no'] as const;
/** The stages Rumi may name, as the Jobs page names them. */
export const STAGE_ARGS = [
  'SAVED',
  'APPLIED',
  'RECRUITER_SCREEN',
  'ASSESSMENT',
  'TECHNICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'FINAL',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
] as const;

export const requestArgs = {
  move_block: z
    .object({ blockId: ID, day: DAY, start: HHMM, end: HHMM })
    .strict(),
  delete_block: z.object({ blockId: ID }).strict(),
  change_stage: z
    .object({ applicationId: ID, stage: z.enum(STAGE_ARGS) })
    .strict(),
  log_attempt: z
    .object({
      problemId: ID,
      confidence: z.enum(CONFIDENCE_WORDS),
      solved: z.enum(SOLVED_WORDS),
      minutes: z.number().int().min(1).max(600).optional(),
    })
    .strict(),
  write_review: z
    .object({
      day: DAY,
      notes: z.string().trim().min(1).max(1000),
      blocker: z.string().trim().max(500).optional(),
      carryForward: z.string().trim().max(500).optional(),
      rating: z.number().int().min(1).max(5).optional(),
    })
    .strict(),
  // WI-118: four more cards.
  mark_item: z.object({ itemId: ID, mark: z.enum(['start', 'done']) }).strict(),
  add_application: z
    .object({
      company: z.string().trim().min(1).max(120),
      role: z.string().trim().min(1).max(160),
      stage: z.enum(['SAVED', 'APPLIED']).optional(),
      appliedOn: DAY.optional(),
    })
    .strict(),
  add_round: z
    .object({
      applicationId: ID,
      type: z.enum(interviewTypes),
      day: DAY,
      start: HHMM,
      end: HHMM.optional(),
      title: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  set_goal: z
    .object({
      title: z.string().trim().min(1).max(160),
      targetDate: DAY.optional(),
      targetRole: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
} as const;
export type RequestKind = keyof typeof requestArgs;
// The card words live in text.ts (client-safe); every kind must have them.
const _cardWords: Record<RequestKind, unknown> = REQUEST_WORDS;
void _cardWords;
export const REQUEST_KINDS = Object.keys(requestArgs) as RequestKind[];
export const isRequest = (name: string): name is RequestKind =>
  (REQUEST_KINDS as string[]).includes(name);
/** The arguments of each card that name a record; each must come from a read. */
export const REQUEST_ID_ARGS: Record<RequestKind, string[]> = {
  move_block: ['blockId'],
  delete_block: ['blockId'],
  change_stage: ['applicationId'],
  log_attempt: ['problemId'],
  write_review: [],
  mark_item: ['itemId'],
  add_application: [],
  add_round: ['applicationId'],
  set_goal: [],
};
/** The undo each kind leaves once applied; an attempt has none (attempts are append-only). */
export const REQUEST_UNDO: Record<RequestKind, string | null> = {
  move_block: 'restore-block-slot',
  delete_block: 'restore-block',
  change_stage: 'restore-stage',
  log_attempt: null,
  write_review: 'unreview-day',
  mark_item: 'restore-roadmap-state',
  add_application: 'remove-application',
  add_round: 'remove-round',
  set_goal: 'remove-goal',
};

/** Shaky, Okay, Solid as the stored confidence; yes, partial, no as the stored outcome. */
export const confidenceOf = (w: (typeof CONFIDENCE_WORDS)[number]) =>
  w === 'shaky' ? 'RED' : w === 'okay' ? 'YELLOW' : 'GREEN';
export const solvedOf = (w: (typeof SOLVED_WORDS)[number]) =>
  w === 'yes' ? 'YES' : w === 'partial' ? 'PARTIAL' : 'NO';
/** The attempt rule Practice applies: on your own needs Okay or Solid, otherwise not Solid. */
export const attemptFits = (
  confidence: (typeof CONFIDENCE_WORDS)[number],
  solved: (typeof SOLVED_WORDS)[number],
) => (solved === 'yes' ? confidence !== 'shaky' : confidence !== 'solid');

const undoSchema = z
  .object({ kind: z.string().min(1).max(40), payload: z.unknown() })
  .strict();
export const requestSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(REQUEST_KINDS as [RequestKind, ...RequestKind[]]),
    args: z.record(z.string(), z.unknown()),
    summary: z.array(z.string().max(300)).max(6),
    snapshot: z.record(z.string(), z.string().nullable()),
    status: z.enum(['shown', 'applied', 'dismissed']),
    undo: undoSchema.optional(),
  })
  .strict();
export type ActionCard = z.infer<typeof requestSchema>;
/** A card as the page gets it: everything but the stored undo. */
export type CardView = Omit<ActionCard, 'undo'> & { canUndo: boolean };

/**
 * The cards stored on an answer, in full (for the server). Anything malformed, with arguments
 * its kind does not accept or an undo its kind does not leave, reads as nothing.
 */
export function readRequests(raw: unknown): ActionCard[] {
  const list =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).requests
      : undefined;
  return (Array.isArray(list) ? list : []).flatMap((x) => {
    const r = requestSchema.safeParse(x);
    if (!r.success) return [];
    if (!requestArgs[r.data.kind].safeParse(r.data.args).success) return [];
    if (r.data.undo && r.data.undo.kind !== REQUEST_UNDO[r.data.kind])
      return [];
    return [r.data];
  });
}
/** The cards for the page, without their undo payloads. */
export const cardViews = (raw: unknown): CardView[] =>
  readRequests(raw).map(({ undo, ...card }) => ({
    ...card,
    canUndo: card.status === 'applied' && !!undo,
  }));

/** The review fields as the owner edits them on the card (the draft is only a start). */
export const reviewFields = z.object({
  notes: z.string().trim().min(1, 'Write a line first.').max(2000),
  blocker: z.string().trim().max(500).default(''),
  carryForward: z.string().trim().max(500).default(''),
  rating: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(5)])
    .default(''),
});
