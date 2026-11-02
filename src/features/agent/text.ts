/**
 * Rumi's words on screen (WI-123: split from `domain.ts` so client code never bundles the
 * tool schemas). Pure; covered by tests/agent-domain.test.ts.
 */
import { AGENT_NAME } from './constants';

export type Span = { text: string; bold: boolean };
export type TextBlock =
  { type: 'p'; spans: Span[] } | { type: 'ul' | 'ol'; items: Span[][] };
/** `**bold**` only; backticks and stray markers become plain text. */
function spans(line: string): Span[] {
  const out: Span[] = [];
  const parts = line.replace(/`/g, '').split(/\*\*(.+?)\*\*/g);
  parts.forEach((text, i) => {
    const clean = text.replace(/\*\*/g, '');
    if (clean) out.push({ text: clean, bold: i % 2 === 1 });
  });
  return out;
}
/**
 * The model's text as paragraphs and lists, nothing more. It never produces HTML: React
 * renders every span as text, so markup in a reply shows as characters, never as elements.
 */
export function renderText(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', spans: spans(para.join(' ')) });
    para = [];
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line || /^```/.test(line)) {
      flush();
      continue;
    }
    if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const item = spans((bullet ?? numbered)![1]);
      const last = blocks.at(-1);
      if (last && last.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
      continue;
    }
    // A heading or a table row reads as a plain line.
    para.push(line.replace(/^#+\s*/, '').replace(/^\|(.*)\|$/, '$1'));
  }
  flush();
  return blocks;
}

/** What each read tool is called under an answer (WI-055); cards are not reads. */
export const READ_WORDS: Record<string, string> = {
  get_today: 'today',
  get_schedule: 'your schedule',
  get_activity: 'recorded activity',
  get_roadmaps: 'roadmaps',
  get_practice: 'practice',
  get_jobs: 'jobs',
  get_patterns: 'your patterns',
  get_prep_docs: 'prep docs',
  find_problems: 'practice',
  find_items: 'roadmaps',
};

/**
 * "Read: today, roadmaps" under an answer, from the tools it used, in the order first used.
 * Null when the answer read nothing, so a reply from the conversation alone shows no line.
 */
export function readLine(tools: readonly string[]) {
  const words = [...new Set(tools.map((t) => READ_WORDS[t]).filter(Boolean))];
  return words.length ? `Read: ${words.join(', ')}` : null;
}

/** The progress line while an answer is on its way: the reads so far, or the first wait. */
export function readingLine(tools: readonly string[]) {
  const words = [...new Set(tools.map((t) => READ_WORDS[t]).filter(Boolean))];
  return words.length
    ? `${AGENT_NAME} is reading ${words.join(', ')}…`
    : `${AGENT_NAME} is reading your records…`;
}

export const WRITE_TOOLS = ['add_note', 'add_block', 'rest_today'] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];
export const isWrite = (name: string): name is WriteTool =>
  (WRITE_TOOLS as readonly string[]).includes(name);
/** The words while a write runs (the progress line), and on the row under the answer. */
export const WRITE_WORDS: Record<WriteTool, string> = {
  add_note: 'adding a note',
  add_block: 'adding a block',
  rest_today: 'marking a rest day',
};

/** The words on a card. */
export const REQUEST_WORDS: Record<
  string,
  { eyebrow: string; apply: string; done: string }
> = {
  move_block: { eyebrow: 'Move', apply: 'Move block', done: 'Moved.' },
  delete_block: { eyebrow: 'Delete', apply: 'Delete block', done: 'Deleted.' },
  change_stage: {
    eyebrow: 'Stage',
    apply: 'Change stage',
    done: 'Stage changed.',
  },
  log_attempt: {
    eyebrow: 'Attempt',
    apply: 'Record attempt',
    done: 'Recorded. Attempts stay as recorded.',
  },
  write_review: {
    eyebrow: 'Review',
    apply: 'Save review',
    done: 'Review saved.',
  },
  mark_item: { eyebrow: 'Roadmap', apply: 'Mark item', done: 'Marked.' },
  add_application: {
    eyebrow: 'Jobs',
    apply: 'Add application',
    done: 'Added to Jobs.',
  },
  add_round: {
    eyebrow: 'Interview',
    apply: 'Add interview',
    done: 'Interview added.',
  },
  set_goal: { eyebrow: 'Goal', apply: 'Set goal', done: 'Goal set.' },
};

export type LinePart = 'morning' | 'midday' | 'evening';
export const PART_WORDS: Record<LinePart, string> = {
  morning: 'Morning',
  midday: 'Afternoon',
  evening: 'Evening',
};
/** The card's heading when Rumi wrote the line. */
export const lineHeading = (part: LinePart, agent: string) =>
  `${agent} · ${PART_WORDS[part]}`;
