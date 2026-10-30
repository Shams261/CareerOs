import type { ItemStatus } from './domain';

/**
 * The roadmap as weeks (WI-088): a roadmap opens to its sections on the Roadmap page, a section
 * (a week) is its own page, and an item opens in place on that page. These are the pure rules:
 * which section a page shows, which item is open on arrival, and where the open row goes after
 * a mark or a removal.
 */
export type PaneRow = {
  id: string;
  section: string;
  status: ItemStatus;
  /** The page lists the row; a row filtered out by search or Show is still readable. */
  shown: boolean;
};

/**
 * The section a roadmap page shows: the one asked for (`?section=`) when it exists; under a
 * filter (Show or a search) the first section with a shown row; else the current section (the
 * one holding the Continue item); else the first section.
 */
export function weekSection(
  sections: string[],
  input: {
    asked: string | null;
    filtered: boolean;
    rows: PaneRow[];
    current: string | null;
  },
) {
  if (input.asked && sections.includes(input.asked)) return input.asked;
  if (input.filtered) {
    const first = input.rows.find((r) => r.shown);
    if (first) return first.section;
  }
  if (input.current && sections.includes(input.current)) return input.current;
  return sections[0] ?? null;
}

/**
 * Under a filter, the next section after `name` (wrapping round) that holds a shown row, so
 * "N more in other weeks" can take the owner there (WI-089); null when no other section has one.
 */
export function nextSectionWithMatch(
  sections: string[],
  rows: PaneRow[],
  name: string | null,
) {
  const i = name ? sections.indexOf(name) : -1;
  const order = [
    ...sections.slice(i + 1),
    ...sections.slice(0, Math.max(i, 0)),
  ];
  return (
    order.find(
      (s) => s !== name && rows.some((r) => r.section === s && r.shown),
    ) ?? null
  );
}

/** The sections before and after `name`, for ← Week 1 / Week 3 → on a week page. */
export function neighbourSections(sections: string[], name: string | null) {
  const i = name ? sections.indexOf(name) : -1;
  return {
    prev: i > 0 ? sections[i - 1] : null,
    next: i >= 0 && i < sections.length - 1 ? sections[i + 1] : null,
  };
}

/**
 * The item open on arrival: the one named in the hash, else the first shown item not done in
 * the section, else the Continue item when the page shows it, else the first shown row.
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
  // Continue only when the page shows it; under a filter the first shown row wins.
  const next = rows.find((r) => r.id === input.next);
  if (next?.shown) return next.id;
  return rows.find((r) => r.shown)?.id ?? null;
}

/** Prev and Next walk the rows the page shows, in page order. */
export function adjacent(rows: PaneRow[], id: string | null) {
  const shown = rows.filter((r) => r.shown || r.id === id);
  const i = shown.findIndex((r) => r.id === id);
  return {
    prev: i > 0 ? shown[i - 1] : null,
    next: i >= 0 && i < shown.length - 1 ? shown[i + 1] : null,
  };
}

/**
 * Where the open row goes once its item is marked done (WI-088): the next shown row after it
 * that is not done, so the study loop reads open → study → done → next; the same row when
 * nothing is left after it.
 */
export function afterDone(rows: PaneRow[], id: string | null) {
  if (!id) return id;
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return id;
  const next = rows
    .slice(i + 1)
    .find((r) => r.shown && r.status !== 'DONE' && r.id !== id);
  return next?.id ?? id;
}

/**
 * Where the open row goes when its item leaves the rows (removed, or filtered out and gone):
 * the next shown row after it in the old order, else the one before, else nothing.
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
