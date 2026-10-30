import type { ItemOp, ItemStatus } from './domain';

/**
 * The roadmap as an outline and a reading pane (WI-084): the pure rules for which item the
 * pane shows, which sections the outline opens, and where Prev and Next go.
 */
export type PaneRow = {
  id: string;
  section: string;
  status: ItemStatus;
  /** The outline lists the row; a row filtered out by search or Show is still readable. */
  shown: boolean;
};

/**
 * The item the pane shows on arrival: the one named in the hash, else the first item not done
 * in the section asked for, else the Continue item, else the first row the outline shows.
 */
export function initialItem(
  rows: PaneRow[],
  input: { hash: string | null; section: string | null; next: string | null },
) {
  const has = (id: string | null) => !!id && rows.some((r) => r.id === id);
  if (has(input.hash)) return input.hash;
  if (input.section) {
    const inSection = rows.filter(
      (r) => r.section === input.section && r.shown,
    );
    const open = inSection.find((r) => r.status !== 'DONE') ?? inSection[0];
    if (open) return open.id;
  }
  // Continue only when the outline shows it; under a filter the first shown row wins.
  const next = rows.find((r) => r.id === input.next);
  if (next?.shown) return next.id;
  return rows.find((r) => r.shown)?.id ?? null;
}

/** Prev and Next walk the rows the outline shows, in outline order. */
export function adjacent(rows: PaneRow[], id: string | null) {
  const shown = rows.filter((r) => r.shown || r.id === id);
  const i = shown.findIndex((r) => r.id === id);
  return {
    prev: i > 0 ? shown[i - 1] : null,
    next: i >= 0 && i < shown.length - 1 ? shown[i + 1] : null,
  };
}

/**
 * The sections open on arrival: the open item's, the one the link asked for, and every section
 * holding a match while a search is on (so the matches are all in view).
 */
export function openSections(
  rows: PaneRow[],
  input: { openId: string | null; section: string | null; q: string },
) {
  const open = new Set<string>();
  const current = rows.find((r) => r.id === input.openId);
  if (current) open.add(current.section);
  if (input.section) open.add(input.section);
  if (input.q) for (const r of rows) if (r.shown) open.add(r.section);
  // Nothing named: the first section with a row, so the outline never arrives collapsed.
  if (!open.size) {
    const first = rows.find((r) => r.shown) ?? rows[0];
    if (first) open.add(first.section);
  }
  return [...open];
}

/**
 * Where the pane goes when its item leaves the rows (removed, or filtered out and gone): the
 * next shown row after it in the old order, else the one before, else nothing.
 */
export function afterRemoval(
  before: PaneRow[],
  after: PaneRow[],
  openId: string | null,
) {
  if (!openId || after.some((r) => r.id === openId)) return openId;
  const stays = new Set(after.filter((r) => r.shown).map((r) => r.id));
  const i = before.findIndex((r) => r.id === openId);
  const next = before.slice(i + 1).find((r) => stays.has(r.id));
  const prev = [...before.slice(0, Math.max(i, 0))]
    .reverse()
    .find((r) => stays.has(r.id));
  return next?.id ?? prev?.id ?? after.find((r) => r.shown)?.id ?? null;
}

/**
 * The op a choice on the status control sends from the current status; null for the choice
 * already made. Done starts revision as before; Studying from done reopens.
 */
export function statusOp(
  choice: ItemStatus,
  current: ItemStatus,
): ItemOp | null {
  if (choice === current) return null;
  if (choice === 'NOT_STARTED') return 'unstart';
  if (choice === 'DONE') return 'done';
  return current === 'DONE' ? 'reopen' : 'start';
}

/**
 * Scope text as bullet lines (WI-085): the curriculum separates with newlines, " · " or, in one
 * line, a long comma list. A short single line stays one line.
 */
export function scopeLines(scope: string | null | undefined): string[] {
  const text = (scope ?? '').trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .flatMap((l) => l.split(/\s+·\s+/))
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0].length > 60 && !/[.;:]\s/.test(lines[0]))
    return lines[0]
      .split(/,\s+/)
      .map((l) => l.trim())
      .filter(Boolean);
  return lines;
}

/**
 * The facts a problem item's scope carries, written by the import as
 * "Easy · pattern: Arrays & Hashing", "Lists: NeetCode 150, Blind 75", "Asked at (Prashad): Google, Amazon".
 */
export function problemFacts(scope: string | null | undefined) {
  const facts = {
    difficulty: null as string | null,
    pattern: null as string | null,
    lists: [] as string[],
    companies: [] as string[],
  };
  for (const raw of (scope ?? '').split(/\r?\n/)) {
    for (const part of raw.split(/\s+·\s+/)) {
      const p = part.trim();
      const m = /^(pattern|lists?|asked at(?:\s*\([^)]*\))?)\s*:\s*(.+)$/i.exec(
        p,
      );
      if (m) {
        const key = m[1].toLowerCase();
        const values = m[2]
          .split(/,\s*/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (key === 'pattern') facts.pattern = m[2].trim();
        else if (key.startsWith('list')) facts.lists = values;
        else facts.companies = values;
      } else if (/^(easy|medium|hard)$/i.test(p)) facts.difficulty = p;
    }
  }
  return facts;
}

const KIND_BADGES: [RegExp, string][] = [
  [/video|youtube|lecture|playlist|channel/i, 'VIDEO'],
  [/rfc|spec|standard/i, 'SPEC'],
  [/doc|reference|manual|guide|guidance|cheat sheet|handbook/i, 'DOCS'],
  [/article|blog|post|essay/i, 'ARTICLE'],
  [/course|lesson|tutorial|class/i, 'COURSE'],
  [/book|chapter/i, 'BOOK'],
  [/repo|github|code/i, 'CODE'],
];
/** A short badge for a reference's kind: VIDEO, DOCS, SPEC, ARTICLE, COURSE, BOOK, CODE or LINK. */
export function kindBadge(kind?: string | null) {
  const k = (kind ?? '').trim();
  if (!k) return 'LINK';
  return KIND_BADGES.find(([re]) => re.test(k))?.[1] ?? 'LINK';
}

/** "Open on LeetCode" for a LeetCode link, "Open on NeetCode", else "Open link". */
export function linkTitle(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.endsWith('leetcode.com')) return 'Open on LeetCode';
    if (host.endsWith('neetcode.io')) return 'Open on NeetCode';
    if (host.endsWith('hackerrank.com')) return 'Open on HackerRank';
    return 'Open link';
  } catch {
    return 'Open link';
  }
}

export type BadgeInput = {
  status: ItemStatus;
  revision: 'none' | 'upcoming' | 'due' | 'overdue';
  /** "Revision due today", "Revision overdue by 2 days", "Revision due Oct 28". */
  revisionText: string | null;
  /** "Oct 28": the day the item was marked done. */
  doneLabel: string | null;
  /** "Nov 4": the next revision day. */
  revisionLabel: string | null;
};
/** The status badge: what the item is now, in a few words, and its tone. */
export function statusBadge(i: BadgeInput): {
  text: string;
  tone: 'quiet' | 'on' | 'due';
} {
  if (i.status === 'DONE') {
    if ((i.revision === 'due' || i.revision === 'overdue') && i.revisionText)
      return { text: i.revisionText, tone: 'due' };
    const done = i.doneLabel ? `Done ${i.doneLabel}` : 'Done';
    return {
      text: i.revisionLabel ? `${done} · revise ${i.revisionLabel}` : done,
      tone: 'on',
    };
  }
  if (i.status === 'IN_PROGRESS') return { text: 'Started', tone: 'on' };
  return { text: 'Not started', tone: 'quiet' };
}

/** The one primary action of the foot for the item's state. */
export function primaryAction(i: {
  status: ItemStatus;
  revision: BadgeInput['revision'];
  practice: boolean;
}): 'attempt' | 'revised' | 'done' | 'is-done' {
  if (i.practice) return 'attempt';
  if (i.status !== 'DONE') return 'done';
  return i.revision === 'due' || i.revision === 'overdue'
    ? 'revised'
    : 'is-done';
}
