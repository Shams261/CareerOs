/**
 * The block row Today and Plan share (WI-021): a block's resolution, the words for it, the
 * title it shows, its meta line, and the facts of a day or a week. Pure; covered by
 * tests/schedule-row.test.ts and tests/today-domain.test.ts.
 */
import { hhmm, minutes } from '@/lib/time';
import { categoryGroup } from '@/features/review/domain';

export type SessionLike = { id: string; startedAt: Date; endedAt: Date | null };
export type BlockLike = {
  id: string;
  title: string;
  category: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
  interviewRoundId: string | null;
  sessions: SessionLike[];
};
/** What a row needs beyond the resolution inputs. */
export type RowBlock = BlockLike & {
  description?: string | null;
  skipReason?: string | null;
};

/** "59 min", "2h", "2h 15m": minutes as the owner reads them. */
export function formatDuration(n: number) {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60),
    m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type Resolution =
  | 'upcoming'
  | 'current'
  | 'in-progress'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'not-recorded'
  | 'needs-update';
/** A past block without a decision is "not recorded" or "recorded, needs update", never missed. */
export function blockResolution(block: BlockLike, now: Date): Resolution {
  if (block.status === 'COMPLETED') return 'done';
  if (block.status === 'SKIPPED') return 'skipped';
  if (block.status === 'CANCELLED') return 'cancelled';
  if (block.status === 'IN_PROGRESS') return 'in-progress';
  if (block.plannedEnd <= now)
    return block.sessions.length ? 'needs-update' : 'not-recorded';
  if (block.plannedStart <= now) return 'current';
  return 'upcoming';
}
export const resolutionText: Record<Resolution, string> = {
  upcoming: 'Upcoming',
  current: 'Now',
  'in-progress': 'In session',
  done: 'Done',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  'not-recorded': 'Not recorded',
  'needs-update': 'Recorded · Needs update',
};

/**
 * The title a row shows for a block. A block the Jobs round form created is named
 * "Company — Round"; with the company already on the meta line, the row and the launcher
 * show the round's title. A title the owner wrote stays as written.
 */
export function blockTitle(
  block: { title: string; interviewRoundId?: string | null },
  round: { title: string; company: string } | null | undefined,
) {
  return round && block.title === `${round.company} — ${round.title}`
    ? round.title
    : block.title;
}

const sessionLength = (n: number, ended: boolean) =>
  ended && n < 1 ? 'under a minute' : formatDuration(n);
/** Minutes recorded against a block; a running session counts up to `now`. */
export const recordedMinutes = (block: BlockLike, now: Date) =>
  block.sessions.reduce(
    (n, s) => n + minutes(s.startedAt, s.endedAt ?? now),
    0,
  );

/**
 * The row's second line: what was recorded for a decided block, the context and length
 * for one still ahead ("Two pointers · 60 min", "Example Labs · Until 10:30").
 */
export function rowMeta(
  block: RowBlock,
  round: { company: string } | null | undefined,
  now: Date,
  zone: string,
) {
  const resolution = blockResolution(block, now);
  const recorded = recordedMinutes(block, now);
  const kind = round
    ? round.company
    : block.description?.trim() || categoryGroup(block.category);
  // A kind that only repeats the title ("DSA · DSA") is left out (WI-058).
  const repeats =
    !round && kind.toLowerCase() === block.title.trim().toLowerCase();
  const context = (rest: string) => (repeats ? rest : `${kind} · ${rest}`);
  switch (resolution) {
    case 'done':
      return block.sessions.length
        ? `${sessionLength(recorded, true)} recorded`
        : 'Completed';
    case 'not-recorded':
      return 'No session recorded';
    case 'needs-update':
      return `${sessionLength(
        recorded,
        block.sessions.every((s) => s.endedAt),
      )} recorded`;
    case 'skipped':
      return `Skipped${block.skipReason ? `: ${block.skipReason}` : ''}`;
    case 'current':
    case 'in-progress':
      return context(`Until ${hhmm(block.plannedEnd, zone)}`);
    default:
      return context(
        formatDuration(minutes(block.plannedStart, block.plannedEnd)),
      );
  }
}

/** The facts of a set of blocks (a day or a week): counts as a record, never a score. */
export function blockFacts(blocks: BlockLike[], now: Date) {
  const live = blocks.filter((b) => b.status !== 'CANCELLED');
  const by = (r: Resolution) =>
    live.filter((b) => blockResolution(b, now) === r).length;
  return {
    planned: live.length,
    done: by('done'),
    skipped: by('skipped'),
    notRecorded: by('not-recorded'),
    needsUpdate: by('needs-update'),
    plannedMinutes: live.reduce(
      (n, b) => n + minutes(b.plannedStart, b.plannedEnd),
      0,
    ),
  };
}
/** "12 blocks planned · 4 done · 2 not recorded · 1 recorded, needs update · 14h 30m planned"; zeros stay out. */
export function factsLine(f: ReturnType<typeof blockFacts>) {
  if (!f.planned) return 'Nothing planned';
  const parts = [`${f.planned} block${f.planned === 1 ? '' : 's'} planned`];
  if (f.done) parts.push(`${f.done} done`);
  if (f.skipped) parts.push(`${f.skipped} skipped`);
  if (f.notRecorded) parts.push(`${f.notRecorded} not recorded`);
  if (f.needsUpdate) parts.push(`${f.needsUpdate} recorded, needs update`);
  parts.push(`${formatDuration(f.plannedMinutes)} planned`);
  return parts.join(' · ');
}
