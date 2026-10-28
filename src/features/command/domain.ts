/**
 * The command bar (WI-036, a Version 2 Phase 4 hypothesis): one list of things to open or do,
 * found by typing. Pure: what a command is, how typed words match it, and how results are
 * ranked and grouped. Covered by tests/command.test.ts.
 */

export const GROUPS = [
  'Today',
  'Roadmap',
  'Practice',
  'Jobs',
  'Go to',
  'Rumi',
  'Note',
] as const;
export type Group = (typeof GROUPS)[number];

/**
 * What running a command does after the bar closes: open `href`, then (once that page shows
 * it) open a side panel by its `data-panel` name or press a control by its selector. `note`
 * saves the typed words as a note to self instead; `ask` hands them to Ask Rumi (WI-040).
 */
export type Command = {
  id: string;
  group: Group;
  verb: string;
  title: string;
  meta?: string;
  href?: string;
  panel?: string;
  /** A `data-panel-focus` target inside the panel (WI-059: Log time). */
  focus?: string;
  press?: string;
  note?: string;
  ask?: string;
  /** Extra words that find it ("search", "week") without being shown. */
  keywords?: string;
  /** Listed only when a typed word starts its verb ("grill"), so it never crowds Open. */
  explicit?: boolean;
};

export const NOTE_MAX = 500;
const MAX_PER_GROUP = 5;

/** Lower case, accents dropped, split on anything that is not a letter or digit. */
export const words = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** The typed words worth sending to a database search (two letters or more, at most four). */
export const searchTerms = (query: string) =>
  [...new Set(words(query).filter((w) => w.length >= 2))].slice(0, 4);

/**
 * How well a command matches the typed words, or null when one of them matches nothing. A word
 * that starts a word of the command counts more than one found inside a word (three letters
 * or more). A match at the start of the title, and a shorter title, rank first.
 */
export function score(command: Command, query: string): number | null {
  const typed = words(query);
  if (!typed.length) return command.explicit ? null : 0;
  const verb = words(command.verb);
  if (command.explicit && !typed.some((w) => verb.some((v) => v.startsWith(w))))
    return null;
  const title = words(command.title);
  const all = [
    ...verb,
    ...title,
    ...words(command.meta ?? ''),
    ...words(command.keywords ?? ''),
  ];
  let total = 0;
  for (const w of typed) {
    if (all.some((a) => a.startsWith(w))) total += 2;
    else if (w.length >= 3 && all.some((a) => a.includes(w))) total += 1;
    else return null;
  }
  if (title[0]?.startsWith(typed[0])) total += 1;
  return total - Math.min(1, title.length / 40);
}

/**
 * The commands that match, best first within each group, groups in a fixed order and at most
 * five each. With nothing typed, everything given is listed in its own order.
 */
export function rankCommands(commands: Command[], query: string): Command[] {
  const scored = commands
    .map((c, i) => ({ c, i, s: score(c, query) }))
    .filter((x): x is { c: Command; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const seen = new Set<string>();
  return GROUPS.flatMap((g) =>
    scored
      .filter((x) => x.c.group === g)
      .map((x) => x.c)
      .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
      .slice(0, MAX_PER_GROUP),
  );
}

/** "Add a note · “…”" for the typed words, offered last whenever something is typed. */
export function noteCommand(query: string): Command | null {
  const body = query.trim().replace(/\s+/g, ' ');
  if (!body || body.length > NOTE_MAX) return null;
  return {
    id: 'note',
    group: 'Note',
    verb: 'Add a note',
    title: `“${body}”`,
    note: body,
  };
}

/** "Ask Rumi · “…”" for the typed words, offered beside the note whenever something is typed. */
export function askCommand(query: string): Command | null {
  const body = query.trim().replace(/\s+/g, ' ');
  if (!body || body.length > NOTE_MAX) return null;
  return {
    id: 'ask',
    group: 'Rumi',
    verb: 'Ask Rumi',
    title: `“${body}”`,
    ask: body,
  };
}

/** The places in the navigation and the pages beside them, always available. */
export const PLACES: Command[] = [
  ['/rumi', 'Ask Rumi', 'assistant chat ai'],
  ['/today', 'Today', 'day agenda'],
  ['/calendar', 'Plan', 'week calendar routines'],
  ['/roadmap', 'Roadmap', 'study revision'],
  ['/dsa', 'Practice', 'dsa problems'],
  ['/jobs', 'Jobs', 'applications interviews'],
  ['/review', 'Weekly review', 'week'],
  ['/settings', 'Settings', 'reminders theme calendar'],
  ['/review/look-back', 'Look back', 'season moments month'],
  ['/roadmap/deck', 'Revision deck', 'cards revise'],
  ['/dsa/drill', 'Pattern drill', 'which pattern practice'],
].map(([href, title, keywords]) => ({
  id: `go:${href}`,
  group: 'Go to' as const,
  verb: 'Go to',
  title,
  href,
  keywords,
}));

/** "Recruiter screen" from `RECRUITER_SCREEN`. */
export const stageWords = (stage: string) => {
  const w = stage.toLowerCase().replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** The key that opens the bar, as this device writes it. */
export const openKeyLabel = (platform: string) =>
  /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K';
