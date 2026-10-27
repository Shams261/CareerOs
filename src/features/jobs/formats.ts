import { z } from 'zod';
import { aiPolicies, interviewTypes } from './domain';

/**
 * Interview formats (WI-047). A company's loop is a few of these; each points at the owner's
 * own imported roadmap material, by roadmap title, section and import slug, so practising a
 * format means opening the next item there. Pure: the service loads the items.
 */
export const practiceFormats = [
  'CODING',
  'AI_ASSISTED',
  'CODE_REVIEW',
  'DEBUGGING',
  'PRACTICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'ASSESSMENT',
] as const;
export type Format = (typeof practiceFormats)[number];
export const isFormat = (t: string): t is Format =>
  (practiceFormats as readonly string[]).includes(t);

/**
 * Every round type in the owner's words. The older ones read as `label` always made them (a
 * round's default title); the generic `label` would say "Ai assisted".
 */
export const typeLabel: Record<(typeof interviewTypes)[number], string> = {
  RECRUITER: 'Recruiter',
  ASSESSMENT: 'Assessment',
  CODING: 'Coding',
  SYSTEM_DESIGN: 'System design',
  BEHAVIORAL: 'Behavioral',
  HIRING_MANAGER: 'Hiring manager',
  FINAL: 'Final',
  OTHER: 'Other',
  AI_ASSISTED: 'AI-assisted coding',
  CODE_REVIEW: 'Code review',
  DEBUGGING: 'Bug squash / debugging',
  PRACTICAL: 'Practical / integration',
};
export const typeText = (t: string) =>
  typeLabel[t as keyof typeof typeLabel] ?? t;

export type AiPolicy = (typeof aiPolicies)[number];
export const aiPolicyLabel: Record<AiPolicy, string> = {
  UNKNOWN: 'Not known',
  ALLOWED: 'AI allowed',
  NOT_ALLOWED: 'AI not allowed',
};

export const formatsInput = z.object({
  id: z.string().min(1),
  formats: z.array(z.enum(practiceFormats)).max(practiceFormats.length),
});

const TECH = 'Technical mastery',
  DSA = 'DSA patterns',
  DESIGN = 'System design',
  STORIES = 'Behavioural and resume';
const DRILLS = 'Code review and bug squash drills',
  PRACTICE = 'Practical coding for product companies';

/** Where a format's material lives: a guide item, then the drills to work through. */
type Drills = {
  roadmap: string;
  section?: string;
  slugPrefix?: string;
  /** Only P0 problem items (DSA patterns). */
  p0Problems?: boolean;
  /** The company's own section in the behavioural roadmap ("Company: Stripe"). */
  companySection?: boolean;
};
export const FORMAT_PRACTICE: Record<
  Format,
  { guide: { roadmap: string; slug: string }; drills: Drills[] }
> = {
  CODING: {
    guide: { roadmap: TECH, slug: 'format-leetcode-onsite' },
    drills: [{ roadmap: DSA, p0Problems: true }],
  },
  AI_ASSISTED: {
    guide: { roadmap: TECH, slug: 'format-ai-assisted' },
    drills: [{ roadmap: DSA, section: PRACTICE }],
  },
  CODE_REVIEW: {
    guide: { roadmap: TECH, slug: 'format-code-review' },
    drills: [
      { roadmap: DSA, section: DRILLS, slugPrefix: 'drill-code-review' },
    ],
  },
  DEBUGGING: {
    guide: { roadmap: TECH, slug: 'format-bug-squash' },
    drills: [{ roadmap: DSA, section: DRILLS, slugPrefix: 'drill-bug' }],
  },
  PRACTICAL: {
    guide: { roadmap: TECH, slug: 'format-practical-coding' },
    drills: [{ roadmap: DSA, section: PRACTICE }],
  },
  SYSTEM_DESIGN: {
    guide: { roadmap: TECH, slug: 'format-system-design' },
    drills: [{ roadmap: DESIGN }],
  },
  BEHAVIORAL: {
    guide: { roadmap: TECH, slug: 'format-behavioural' },
    drills: [
      { roadmap: STORIES, companySection: true },
      { roadmap: STORIES, section: 'Stories' },
    ],
  },
  ASSESSMENT: {
    guide: { roadmap: TECH, slug: 'format-online-assessment' },
    drills: [{ roadmap: DSA, p0Problems: true }],
  },
};

export type FormatItem = {
  id: string;
  roadmapId: string;
  roadmapTitle: string;
  section: string;
  slug: string | null;
  title: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  priority: number;
  ordering: number;
  dsaProblemId: string | null;
  /** When the item turned Done; the weekly mix counts this week's (WI-048). */
  completedAt?: Date | null;
};

/** "Stripe" matches "Company: Stripe" and "Company: Canadian scale-ups (Clio, Cohere, 1Password)". */
export function companyMatches(section: string, company: string) {
  if (!section.startsWith('Company: ')) return false;
  const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const name = words(company);
  if (!name.length) return false;
  const inSection = words(section.slice('Company: '.length));
  return inSection.some(
    (_, i) => inSection.slice(i, i + name.length).join(' ') === name.join(' '),
  );
}

function matches(d: Drills, i: FormatItem, company: string) {
  if (i.roadmapTitle !== d.roadmap) return false;
  if (d.p0Problems) return i.priority === 1 && !!i.dsaProblemId;
  if (d.companySection) return companyMatches(i.section, company);
  if (d.section && i.section !== d.section) return false;
  if (d.slugPrefix && !i.slug?.startsWith(d.slugPrefix)) return false;
  return true;
}

export type FormatPractice = {
  format: Format;
  guide: FormatItem | null;
  /** The first item not done, in the drills' order. */
  next: FormatItem | null;
  done: number;
  total: number;
};

/** A format's drill items: each set in roadmap order, the sets in turn, an item once. */
export function formatSet(
  format: Format,
  items: FormatItem[],
  company: string,
) {
  const set: FormatItem[] = [];
  for (const d of FORMAT_PRACTICE[format].drills)
    for (const i of items
      .filter((x) => matches(d, x, company))
      .sort((a, b) => a.ordering - b.ordering))
      if (!set.includes(i)) set.push(i);
  return set;
}

/**
 * One format's material from the owner's items: each drill set in roadmap order (`ordering`
 * runs across a roadmap's sections), the sets one after another, an item counted once.
 */
export function formatPractice(
  format: Format,
  items: FormatItem[],
  company: string,
): FormatPractice {
  const { guide } = FORMAT_PRACTICE[format];
  const set = formatSet(format, items, company);
  return {
    format,
    guide:
      items.find(
        (i) => i.roadmapTitle === guide.roadmap && i.slug === guide.slug,
      ) ?? null,
    next: set.find((i) => i.status !== 'DONE') ?? null,
    done: set.filter((i) => i.status === 'DONE').length,
    total: set.length,
  };
}

/**
 * The formats of a loop: the ones the owner ticked on the application, then the types of its
 * rounds still to come, in `practiceFormats` order, with the AI policy those rounds state.
 */
export function loopFormats(
  formats: readonly string[],
  rounds: {
    type: string;
    aiPolicy: string;
    status: string;
    scheduledStart: Date;
  }[],
  now: Date,
) {
  const upcoming = rounds.filter(
    (r) => r.status === 'SCHEDULED' && r.scheduledStart >= now,
  );
  const wanted = new Set([...formats, ...upcoming.map((r) => r.type)]);
  return practiceFormats
    .filter((f) => wanted.has(f))
    .map((format) => {
      const theirs = upcoming
        .filter((r) => r.type === format)
        .sort((a, b) => +a.scheduledStart - +b.scheduledStart);
      const stated = [
        ...new Set(
          theirs.map((r) => r.aiPolicy).filter((p) => p !== 'UNKNOWN'),
        ),
      ] as AiPolicy[];
      return {
        format,
        nextRound: theirs[0]?.scheduledStart ?? null,
        aiPolicy: stated.length === 1 ? stated[0] : null,
      };
    });
}

/** The roadmap titles, sections and slugs to load for these formats, as one query's filter. */
export function formatSources(formats: Format[]) {
  const guides = formats.map((f) => FORMAT_PRACTICE[f].guide);
  const drills = formats.flatMap((f) => FORMAT_PRACTICE[f].drills);
  return { guides, drills };
}
