import { z } from 'zod';
import { dateInput, shiftDay } from '@/features/schedule/domain';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const goalInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: text(1000),
  targetDate: z
    .union([z.literal(''), dateInput])
    .optional()
    .transform((v) => v || null),
  status: z
    .enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'])
    .default('ACTIVE'),
  priority: z.coerce.number().int().min(1).max(3).default(2),
});
export type GoalInput = z.infer<typeof goalInput>;

/** A prompt scenario: the owner picks one when copying a study prompt. */
export type Scenario = { id: string; name: string; intro: string };
/** A curated starting point shown read-only with an item. */
export type Reference = { label: string; url: string; kind?: string };

export const scenarioSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  intro: z.string().min(1).max(4000),
});
export const referenceSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  kind: z.string().max(80).optional(),
});

/** Offered when a roadmap has no scenarios of its own. */
export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: 'start',
    name: 'Start or continue',
    intro:
      'Teach this topic directly, intuition first, then the mechanism, trade-offs and failure modes. No diagnostic questions or compulsory quiz. Pause for my doubts; when I say continue, move on.',
  },
  {
    id: 'doubt',
    name: 'Explain my doubt differently',
    intro:
      'I am stuck on one part of this topic. Use the doubt below if given, otherwise ask what is unclear. Reteach it from first principles with a new example or dry run. Do not quiz me.',
  },
  {
    id: 'research',
    name: 'Research deeper',
    intro:
      'Go deeper on this topic and its gaps. Prefer official documentation and reliable engineering sources; treat community posts as opinion. Say so when browsing is unavailable; never invent sources.',
  },
  {
    id: 'questions',
    name: 'Interview questions',
    intro:
      'Give the highest-value SDE II interview questions for exactly this scope, with concise model answers, likely follow-ups and common traps, in one organized batch. Do not quiz me interactively.',
  },
  {
    id: 'summary',
    name: 'Revision summary',
    intro:
      'Summarize only what we actually covered: mental model, mechanism, key insights, misconceptions, open questions and a short revision sheet. Mark it studied, not verified.',
  },
  {
    id: 'pause',
    name: 'Pause and checkpoint',
    intro:
      'I am stopping now. Summarize what we covered, my unresolved doubts and the exact next step, then write a compact RESUME CONTEXT block I can paste into a new chat. Do not mark anything complete.',
  },
];

/**
 * The default study prompt. Placeholders: `{{topic}} {{section}} {{roadmap}} {{scope}}
 * {{checkpoint}} {{priority}} {{estimate}} {{references}} {{notes}} {{scenario}} {{extra}}`.
 */
export const DEFAULT_PROMPT_TEMPLATE = `STUDY SESSION — {{roadmap}}
Section: {{section}}
Topic: {{topic}}
Priority: {{priority}}
Scope to cover: {{scope}}
Done means: {{checkpoint}}

Reference starting points (verify; do not pretend to have read what you cannot open):
{{references}}

My notes so far:
{{notes}}

Teach in simple Hinglish with standard English technical terms, intuition before depth, aimed at an engineer with about four years of experience preparing for SDE II interviews. Do not ask diagnostic questions or force quizzes. Distinguish studied from verified.

WHAT I WANT NOW:
{{scenario}}
{{extra}}
Begin now.`;

/** Scenarios as the roadmap form edits them: `id | Name | intro`, one per line. */
export function parseScenarioLines(text: string): Scenario[] {
  const out: Scenario[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [id, name, ...rest] = line.split('|').map((p) => p.trim());
    if (!id || !name || !rest.length)
      throw new Error(
        `Scenario line needs "id | Name | instruction": ${line.slice(0, 60)}`,
      );
    out.push(
      scenarioSchema.parse({
        id: id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name,
        intro: rest.join(' | '),
      }),
    );
  }
  return out;
}
export const scenarioLines = (scenarios: Scenario[] | null | undefined) =>
  (scenarios ?? []).map((s) => `${s.id} | ${s.name} | ${s.intro}`).join('\n');

/** References as the item form edits them: `Label | https://url`, one per line. */
export function parseReferenceLines(text: string): Reference[] {
  const out: Reference[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [label, url, kind] = line.split('|').map((p) => p.trim());
    const target = url || label;
    if (!/^https?:\/\//.test(target))
      throw new Error(
        `Reference line needs "Label | https://url": ${line.slice(0, 60)}`,
      );
    out.push(
      referenceSchema.parse({
        label: url ? label : target,
        url: target,
        kind: kind || undefined,
      }),
    );
  }
  return out;
}
export const referenceLines = (refs: Reference[] | null | undefined) =>
  (refs ?? [])
    .map((r) => [r.label, r.url, r.kind].filter(Boolean).join(' | '))
    .join('\n');

export const PRIORITY_LABEL = { 1: 'P0', 2: 'P1', 3: 'P2' } as const;

export const roadmapInput = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  description: text(1000),
  goalId: z
    .string()
    .optional()
    .transform((v) => v || null),
  archived: z.boolean().default(false),
  /** Grill Me may send this roadmap's items (WI-031); absent on create, so owner-made ones start off. */
  studyAi: z.boolean().optional(),
  promptTemplate: text(20000),
  scenarios: z
    .string()
    .max(20000)
    .optional()
    .transform((v) => (v?.trim() ? parseScenarioLines(v) : null)),
});

export const itemKinds = ['CONCEPT', 'QUESTION'] as const;
export const itemStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const bulkItemsInput = z.object({
  roadmapId: z.string().min(1),
  section: z.string().trim().min(1).max(120),
  lines: z.string().min(1).max(20000),
});

/** `link` is `learning:<id>`, `dsa-topic:<id>`, `problem:<id>` or empty. */
export const itemInput = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  section: z.string().trim().min(1).max(120),
  kind: z.enum(itemKinds),
  scope: text(8000),
  checkpoint: text(4000),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  estimateMinutes: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(6000).optional(),
  ),
  references: z
    .string()
    .max(20000)
    .optional()
    .transform((v) => (v?.trim() ? parseReferenceLines(v) : null)),
  notes: text(20000),
  url: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ })])
    .optional()
    .transform((v) => v || null),
  askedNote: text(200),
  nextRevisionAt: z
    .union([z.literal(''), dateInput])
    .optional()
    .transform((v) => v || null),
  link: z
    .string()
    .regex(/^(|learning:[\w-]+|dsa-topic:[\w-]+|problem:[\w-]+)$/)
    .default(''),
});

export const itemOps = [
  'start',
  'done',
  'reopen',
  'revised',
  'asked',
  'unasked',
  'remove',
] as const;
export type ItemOp = (typeof itemOps)[number];

/**
 * One item per non-empty line. A leading `?` (or a trailing `?`) marks a question.
 * Leading list markers (`- `, `* `, `1. `) are stripped so a pasted outline works as is.
 */
export function parseBulkLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const question = line.startsWith('?') || line.endsWith('?');
      return {
        title: line.replace(/^\?\s*/, '').slice(0, 200),
        kind: question ? ('QUESTION' as const) : ('CONCEPT' as const),
      };
    });
}

export function nextStatus(op: ItemOp, current: ItemStatus): ItemStatus {
  if (op === 'start') return current === 'DONE' ? 'DONE' : 'IN_PROGRESS';
  if (op === 'done') return 'DONE';
  if (op === 'reopen') return 'IN_PROGRESS';
  return current;
}

export type ProgressItem = { status: ItemStatus; askedInInterview: boolean };
/** Counts only; no percentage score is shown to the owner. */
export function roadmapProgress(items: ProgressItem[]) {
  return {
    total: items.length,
    done: items.filter((i) => i.status === 'DONE').length,
    inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
    asked: items.filter((i) => i.askedInInterview).length,
  };
}

/** Days until a target date, in whole calendar days of the owner's zone. */
export function daysUntil(target: string, today: string) {
  return Math.round(
    (+new Date(`${target}T12:00:00Z`) - +new Date(`${today}T12:00:00Z`)) /
      86400000,
  );
}

export function targetLabel(target: string | null, today: string) {
  if (!target) return 'No target date';
  const days = daysUntil(target, today);
  if (days < 0)
    return `Target passed ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Target is today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} left`;
  return `${Math.round(days / 7)} weeks left`;
}

export type PromptItem = {
  title: string;
  section: string;
  scope?: string | null;
  checkpoint?: string | null;
  priority?: number;
  estimateMinutes?: number | null;
  references?: Reference[] | null;
  notes?: string | null;
  url?: string | null;
};
/**
 * Fills a roadmap's template with one item and the chosen scenario. Pure; unknown
 * placeholders stay in the text so a typo is visible rather than silently dropped.
 */
export function renderPrompt(
  template: string | null | undefined,
  roadmap: { title: string },
  item: PromptItem,
  scenario: Scenario,
  extra = '',
) {
  const refs = [
    ...(item.references ?? []).map(
      (r) => `- ${r.label}: ${r.url}${r.kind ? ` (${r.kind})` : ''}`,
    ),
    ...(item.url ? [`- Link: ${item.url}`] : []),
  ];
  const values: Record<string, string> = {
    topic: item.title,
    section: item.section,
    roadmap: roadmap.title,
    scope: item.scope?.trim() || 'Not written down; use the topic title.',
    checkpoint:
      item.checkpoint?.trim() || 'I can explain it and apply it without notes.',
    priority: PRIORITY_LABEL[(item.priority ?? 2) as 1 | 2 | 3],
    estimate: item.estimateMinutes
      ? `${item.estimateMinutes} minutes`
      : 'not set',
    references: refs.length ? refs.join('\n') : '- none listed',
    notes: item.notes?.trim() || '- none yet',
    scenario: scenario.intro,
    extra: extra.trim()
      ? `\nADDITIONAL CONTEXT / DOUBT / LINK:\n${extra.trim()}\n`
      : '',
  };
  return (template?.trim() || DEFAULT_PROMPT_TEMPLATE)
    .replace(/\{\{\s*([a-z]+)\s*\}\}/g, (m, key: string) => values[key] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type SummaryItem = {
  id: string;
  title: string;
  section: string;
  status: ItemStatus;
  priority: number;
  ordering: number;
  createdAt: Date;
};
/** Sections in the order their first item was added, with done / total counts. */
export function sectionSummary(items: SummaryItem[]) {
  const order = new Map<
    string,
    { name: string; total: number; done: number }
  >();
  for (const item of [...items].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const s = order.get(item.section) ?? {
      name: item.section,
      total: 0,
      done: 0,
    };
    s.total += 1;
    if (item.status === 'DONE') s.done += 1;
    order.set(item.section, s);
  }
  return [...order.values()];
}
/**
 * "Continue": the first item in progress, else the first not started, walking sections in
 * their order and items in theirs. Null once everything is done.
 */
export function nextItem(items: SummaryItem[]) {
  const sections = sectionSummary(items).map((s) => s.name);
  const rank = (i: SummaryItem) => [
    sections.indexOf(i.section),
    i.ordering,
    +i.createdAt,
  ];
  const sorted = [...items].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const pick =
    sorted.find((i) => i.status === 'IN_PROGRESS') ??
    sorted.find((i) => i.status === 'NOT_STARTED');
  return pick
    ? {
        id: pick.id,
        title: pick.title,
        section: pick.section,
        status: pick.status,
      }
    : null;
}

/** Days until the next revision after each pass: Done → 7, then 14, 30, and 60 from there on. */
export const REVISION_DAYS = [7, 14, 30, 60] as const;
/**
 * The next revision after a pass at `stage` (0 = just marked done). Dates are calendar labels
 * in the owner's zone; `today` is a YYYY-MM-DD day key.
 */
export function scheduleRevision(stage: number, today: string) {
  const index = Math.min(Math.max(stage, 0), REVISION_DAYS.length - 1);
  return {
    revisionStage: index + 1,
    nextRevisionAt: new Date(shiftDay(today, REVISION_DAYS[index])),
  };
}
export type RevisionItem = { nextRevisionAt: Date | null; status: ItemStatus };
export const revisionDay = (d: Date) => d.toISOString().slice(0, 10);
export function revisionState(item: RevisionItem, today: string) {
  if (!item.nextRevisionAt || item.status !== 'DONE') return 'none';
  const due = revisionDay(item.nextRevisionAt);
  return due < today ? 'overdue' : due === today ? 'due' : 'upcoming';
}
/** Items due or overdue for revision, most overdue first. */
export function revisionQueue<T extends RevisionItem & { id: string }>(
  items: T[],
  today: string,
) {
  return items
    .filter((i) => ['due', 'overdue'].includes(revisionState(i, today)))
    .sort(
      (a, b) =>
        +a.nextRevisionAt! - +b.nextRevisionAt! || a.id.localeCompare(b.id),
    );
}

/**
 * One record line per goal for the Roadmap overview (WI-023): the target, the items done
 * and the week's recorded time. Counts, never a pace or a score.
 */
export function goalLine(
  g: {
    title: string;
    targetDate: Date | null;
    roadmap: { total: number; done: number };
    week: { actual: number };
  },
  today: string,
  duration: (minutes: number) => string,
) {
  const parts = [
    g.title,
    targetLabel(g.targetDate?.toISOString().slice(0, 10) ?? null, today),
  ];
  if (g.roadmap.total)
    parts.push(`${g.roadmap.done} of ${g.roadmap.total} items done`);
  if (g.week.actual > 0) parts.push(`${duration(g.week.actual)} this week`);
  return parts.join(' · ');
}
/** The first live roadmap with something to continue; the overview's one primary. */
export function continueTarget<
  T extends {
    id: string;
    archivedAt: Date | null;
    next: { id: string; title: string; section: string } | null;
  },
>(roadmaps: T[]) {
  const r = roadmaps.find((x) => !x.archivedAt && x.next);
  return r && r.next
    ? {
        roadmapId: r.id,
        title: r.next.title,
        href: `/roadmap/${r.id}?section=${encodeURIComponent(r.next.section)}#item-${r.next.id}`,
      }
    : null;
}
