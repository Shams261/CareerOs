import { z } from 'zod';

/**
 * The roadmap bundle: everything `scripts/import-roadmap.ts` needs, as plain JSON. Built from
 * the owner's study materials by `scripts/build-roadmap-bundle.ts`; the file itself may hold
 * personal rehearsal text and is never committed.
 */
export type BundleReference = { label: string; url: string; kind?: string };
export type BundleScenario = { id: string; name: string; intro: string };
export type BundleItem = {
  /** Unique within the roadmap; the import key. */
  slug: string;
  title: string;
  kind: 'CONCEPT' | 'QUESTION';
  /** 1 = P0, 2 = P1, 3 = P2. */
  priority: 1 | 2 | 3;
  estimateMinutes?: number;
  scope?: string;
  checkpoint?: string;
  references?: BundleReference[];
  url?: string;
  /** Written only when the owner has not edited the item's notes yet. */
  notes?: string;
  sourceRef?: string;
  /** Links the item to the DsaTopic of that name (created by the same bundle). */
  dsaTopic?: string;
  /** Links the item to the DsaProblem with that URL (created by the same bundle). */
  problemUrl?: string;
};
export type BundleSection = { name: string; items: BundleItem[] };
export type BundleRoadmap = {
  title: string;
  description?: string;
  promptTemplate?: string;
  scenarios?: BundleScenario[];
  sections: BundleSection[];
};
export type BundleProblem = {
  title: string;
  problemUrl: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  topic: string;
  notes?: string;
};
export type Bundle = {
  format: 'silsila-roadmap-bundle';
  version: 1;
  builtAt: string;
  goal?: {
    title: string;
    category: string;
    targetDate?: string;
    description?: string;
  };
  roadmaps: BundleRoadmap[];
  dsa: {
    topics: { name: string; description?: string; ordering: number }[];
    problems: BundleProblem[];
  };
};

const reference = z.object({
  label: z.string(),
  url: z.string(),
  kind: z.string().optional(),
});
const item = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['CONCEPT', 'QUESTION']),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  estimateMinutes: z.number().int().optional(),
  scope: z.string().optional(),
  checkpoint: z.string().optional(),
  references: z.array(reference).optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  sourceRef: z.string().optional(),
  dsaTopic: z.string().optional(),
  problemUrl: z.string().optional(),
});
const bundleSchema = z.object({
  format: z.literal('silsila-roadmap-bundle'),
  version: z.literal(1),
  builtAt: z.string(),
  goal: z
    .object({
      title: z.string(),
      category: z.string(),
      targetDate: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  roadmaps: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      promptTemplate: z.string().optional(),
      scenarios: z
        .array(
          z.object({ id: z.string(), name: z.string(), intro: z.string() }),
        )
        .optional(),
      sections: z.array(z.object({ name: z.string(), items: z.array(item) })),
    }),
  ),
  dsa: z.object({
    topics: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        ordering: z.number().int(),
      }),
    ),
    problems: z.array(
      z.object({
        title: z.string(),
        problemUrl: z.string(),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
        topic: z.string(),
        notes: z.string().optional(),
      }),
    ),
  }),
}) satisfies z.ZodType<Bundle>;

/**
 * A bundle read from a file or from the stored curriculum (WI-139): checked against the
 * format instead of cast, so a hand-edited file or an old stored row fails here with the
 * path of the first problem, never halfway through a copy.
 */
export function readBundle(
  value: unknown,
): { ok: true; bundle: Bundle } | { ok: false; problem: string } {
  const r = bundleSchema.safeParse(value);
  if (r.success) return { ok: true, bundle: r.data };
  const first = r.error.issues[0];
  return {
    ok: false,
    problem: `${first?.path.join('.') || 'root'}: ${first?.message ?? 'invalid'}`,
  };
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

/** Counts for the console and the handoff. */
export function bundleCounts(bundle: Bundle) {
  return bundle.roadmaps.map((r) => ({
    roadmap: r.title,
    sections: r.sections.length,
    items: r.sections.reduce((n, s) => n + s.items.length, 0),
  }));
}

/** Fails on the mistakes that would make the import ambiguous. */
export function validateBundle(bundle: Bundle) {
  const problems: string[] = [];
  const titles = new Set<string>();
  for (const r of bundle.roadmaps) {
    if (titles.has(r.title))
      problems.push(`Duplicate roadmap title: ${r.title}`);
    titles.add(r.title);
    const slugs = new Set<string>();
    for (const s of r.sections)
      for (const i of s.items) {
        if (!i.slug)
          problems.push(`${r.title} / ${s.name} / ${i.title}: no slug`);
        if (slugs.has(i.slug))
          problems.push(`${r.title}: duplicate slug ${i.slug}`);
        slugs.add(i.slug);
        if (i.title.length > 200)
          problems.push(`${r.title}: title over 200 characters: ${i.slug}`);
        if (
          i.problemUrl &&
          !bundle.dsa.problems.some((p) => p.problemUrl === i.problemUrl)
        )
          problems.push(
            `${r.title}: ${i.slug} links to an unknown problem ${i.problemUrl}`,
          );
        if (i.dsaTopic && !bundle.dsa.topics.some((t) => t.name === i.dsaTopic))
          problems.push(
            `${r.title}: ${i.slug} links to an unknown topic ${i.dsaTopic}`,
          );
      }
  }
  const urls = new Set<string>();
  for (const p of bundle.dsa.problems) {
    if (urls.has(p.problemUrl))
      problems.push(`Duplicate problem URL ${p.problemUrl}`);
    urls.add(p.problemUrl);
    if (!bundle.dsa.topics.some((t) => t.name === p.topic))
      problems.push(`Problem ${p.title} names an unknown topic ${p.topic}`);
  }
  return problems;
}
