/**
 * Pure parsers for the owner's study materials → bundle roadmaps. No I/O here: the builder
 * reads files and the tests feed small fixtures. Heuristics are documented beside each parser;
 * the bundle is reviewed by eye once and the importer re-runs safely.
 */
import {
  slugify,
  type BundleItem,
  type BundleReference,
  type BundleRoadmap,
  type BundleScenario,
  type BundleSection,
} from './roadmap-bundle';

const PRIORITY = { P0: 1, P1: 2, P2: 3 } as const;
export const priorityOf = (text: string | undefined): 1 | 2 | 3 =>
  PRIORITY[(text?.match(/P[012]/)?.[0] ?? 'P1') as keyof typeof PRIORITY];

/* ---------------------------------------------------------------- inline-script literals */

/**
 * Returns the source text of `const <name>=` in an inline script: a bracket-matched `[...]` /
 * `{...}` or a quoted / backtick string. Strings inside the literal may contain brackets.
 */
export function extractLiteral(source: string, name: string) {
  const match = new RegExp(`\\bconst\\s+${name}\\s*=\\s*`).exec(source);
  if (!match) throw new Error(`Literal ${name} not found`);
  const start = match.index + match[0].length;
  const open = source[start];
  if (open === '`' || open === '"' || open === "'") {
    let i = start + 1;
    for (; i < source.length; i++) {
      if (source[i] === '\\') i++;
      else if (source[i] === open) break;
    }
    return source.slice(start, i + 1);
  }
  if (open !== '[' && open !== '{')
    throw new Error(`Literal ${name} is not a value`);
  let depth = 0,
    quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Literal ${name} is not closed`);
}

/** Every single-quoted JS string in a literal, unescaped, in order. */
export function singleQuotedStrings(literal: string) {
  const out: string[] = [];
  let i = 0;
  while (i < literal.length) {
    if (literal[i] === "'") {
      let s = '';
      i++;
      while (i < literal.length && literal[i] !== "'") {
        if (literal[i] === '\\') {
          i++;
          s += literal[i] === 'n' ? '\n' : literal[i];
        } else s += literal[i];
        i++;
      }
      out.push(s);
    }
    i++;
  }
  return out;
}

/** A backtick string literal → its text (template literals in the trackers hold no `${}`). */
export const templateText = (literal: string) =>
  literal.startsWith('`') ? literal.slice(1, -1) : JSON.parse(literal);

/** `[{id:'a',name:'b',intro:'c'}, …]` or `[['a','b','c'], …]` → scenarios. */
export function parseScenarioLiteral(literal: string): BundleScenario[] {
  const strings = singleQuotedStrings(literal);
  const out: BundleScenario[] = [];
  for (let i = 0; i + 2 < strings.length; i += 3)
    out.push({ id: strings[i], name: strings[i + 1], intro: strings[i + 2] });
  return out;
}

/* ---------------------------------------------------------------- backend tracker (HTML) */

type BackendTopic = {
  id: string;
  title: string;
  scope: string;
  priority: string;
  checkpoint: string;
};
type BackendWeek = {
  week: number;
  title: string;
  outcome: string;
  topics: BackendTopic[];
};

/** The backend tracker's `[WEEK]`-style placeholders → the app's `{{…}}` ones. */
export function normaliseBackendTemplate(starter: string) {
  const text = starter
    .replaceAll('[WEEK]', '{{section}}')
    .replaceAll('[TOPIC]', '{{topic}}')
    .replaceAll('[PASTE ROADMAP SCOPE]', '{{scope}}')
    .replaceAll('[PASTE ROADMAP CHECKPOINT]', '{{checkpoint}}')
    .replaceAll('[PRIORITY]', '{{priority}}')
    .replaceAll('[CURATED REFERENCES]', '{{references}}')
    .replaceAll('[USER REFERENCES]', '{{extra}}')
    .replace(/^Start Week \{\{section\}\} — /, 'Start {{section}} — ');
  return `${text.trim()}\n\nSCENARIO FOR THIS SESSION:\n{{scenario}}`;
}

export function parseBackendTracker(html: string): BundleRoadmap {
  const weeks = JSON.parse(extractLiteral(html, 'weeks')) as BackendWeek[];
  const extras = JSON.parse(extractLiteral(html, 'extras')) as [
    string,
    string,
  ][];
  const refs = JSON.parse(extractLiteral(html, 'curatedReferences')) as Record<
    string,
    { name: string; url: string; type?: string }[]
  >;
  const scenarios = parseScenarioLiteral(
    extractLiteral(html, 'scenarioDefinitions'),
  );
  const promptTemplate = normaliseBackendTemplate(
    templateText(extractLiteral(html, 'starter')),
  );
  const sections: BundleSection[] = weeks.map((w) => ({
    name: `Week ${w.week} · ${w.title}`,
    items: w.topics.map((t) => ({
      slug: t.id,
      title: t.title,
      kind: 'CONCEPT' as const,
      priority: priorityOf(t.priority),
      scope: t.scope,
      checkpoint: t.checkpoint,
      references: (refs[t.id] ?? []).map((r) => ({
        label: r.name,
        url: r.url,
        kind: r.type,
      })),
      sourceRef: `Backend playbook week ${w.week}: ${w.outcome}`,
    })),
  }));
  sections.push({
    name: 'Beyond week 8',
    items: extras.map(([title, scope]) => ({
      slug: `beyond-${slugify(title)}`,
      title,
      kind: 'CONCEPT' as const,
      priority: 3,
      scope,
      checkpoint:
        'Can explain the area and name where it would matter in a design or incident.',
      sourceRef: 'Backend playbook: Beyond week 8',
    })),
  });
  return {
    title: 'Backend engineering',
    description:
      'The eight-week backend playbook (Node.js / TypeScript / PostgreSQL) with its curated references and study scenarios. Each week is a section; each topic carries its scope and interview-readiness checkpoint.',
    promptTemplate,
    scenarios,
    sections,
  };
}

/* ---------------------------------------------------------------- system design tracker (HTML) */

type SdItem = {
  id: string;
  unit: string;
  section: string;
  title: string;
  kind: string;
  scope: string;
  refs: [string, string][];
};
type SdData = {
  items: SdItem[];
  units: { id: string; title: string }[];
  resource: { official: [string, string][]; supplementary: [string, string][] };
  extras: [string, string][];
};

const SD_CHECKPOINT: Record<string, string> = {
  concept:
    'Can explain the problem, the simplest design, where it breaks at scale, the mechanism, trade-offs and failure modes, and when to bring it up in an interview.',
  technology:
    'Can say what the technology guarantees, how it fails, and when to choose it over the alternatives in a design.',
  pattern:
    'Can apply the pattern to an unseen problem and defend it against the alternatives.',
  practice:
    'Designed it independently with the delivery framework (requirements, entities/APIs, high-level design, deep dives) and defended the trade-offs.',
  design:
    'Designed it independently with the delivery framework and handled the follow-up deep dives.',
  framework: 'Can run the delivery framework from memory on a new question.',
  orientation:
    'Can say what the interview assesses and how the course is organised.',
};

export const SD_PROMPT_TEMPLATE = `SYSTEM DESIGN — HELLO INTERVIEW
Course: https://www.hellointerview.com/learn/courses/system-design
Section: {{section}}
Selected lesson: {{topic}}
Expected scope: {{scope}}
Done means: {{checkpoint}}

REFERENCE STARTING POINTS (browse/verify, do not pretend to access locked lessons):
{{references}}

IMPORTANT: Follow my permanent Claude Project Instructions and the uploaded system_design_claude_context.md. Treat Hello Interview as the primary curriculum and the above references as starting points, not a ceiling. When web research is available, independently find topic-specific reputable articles, relevant videos and official docs. Explain in simple Hinglish, building intuition before technical depth. Never claim the course lesson or external video was read unless you actually accessed it.

SELECTED SCENARIO INSTRUCTION:
{{scenario}}
{{extra}}
Do not repeat all project instructions back to me. Begin the requested action now.`;

export function parseSystemDesignTracker(html: string): BundleRoadmap {
  const data = JSON.parse(extractLiteral(html, 'DATA')) as SdData;
  const scenarios = parseScenarioLiteral(extractLiteral(html, 'scenarios'));
  const official = data.resource.official[0];
  const sections: BundleSection[] = data.units.map((u) => ({
    name: `${u.id} · ${u.title}`,
    items: data.items
      .filter((i) => i.unit === u.id)
      .map((i) => ({
        slug: i.id,
        title: i.title,
        kind: (i.kind === 'practice' || i.kind === 'design'
          ? 'QUESTION'
          : 'CONCEPT') as 'QUESTION' | 'CONCEPT',
        priority: (i.kind === 'orientation' ? 2 : 1) as 1 | 2,
        scope: `${i.scope} (lesson type: ${i.kind})`,
        checkpoint: SD_CHECKPOINT[i.kind] ?? SD_CHECKPOINT.concept,
        references: [
          { label: official[0], url: official[1], kind: 'course' },
          ...i.refs.map(([label, url]) => ({ label, url })),
        ],
        sourceRef: `Hello Interview ${i.id} (${i.kind})`,
      })),
  }));
  sections.unshift({
    name: 'How to use this roadmap',
    items: [
      {
        slug: 'how-to-use',
        title: 'Sources and how to study this roadmap',
        kind: 'CONCEPT',
        priority: 2,
        scope:
          'Hello Interview is the roadmap and design framework; official docs give the technical guarantees; videos give intuition; community reports are anecdotal. Studied is not Verified: Verified needs independent design or reasoning against unseen cases.',
        checkpoint: 'Read once.',
        references: [
          ...data.resource.official.map(([label, url]) => ({
            label,
            url,
            kind: 'official',
          })),
          ...data.resource.supplementary.map(([label, url]) => ({
            label,
            url,
            kind: 'supplementary',
          })),
        ],
        sourceRef: 'System design tracker: references tab',
      },
    ],
  });
  sections.push({
    name: 'Extended depth',
    items: data.extras.map(([title, scope]) => ({
      slug: `extra-${slugify(title)}`,
      title,
      kind: 'CONCEPT' as const,
      priority: 3,
      scope,
      checkpoint: 'Can explain it and say where it would change a design.',
      sourceRef: 'System design tracker: extended depth',
    })),
  });
  return {
    title: 'System design',
    description:
      'The Hello Interview course outline, unit by unit, with the extended-depth topics. Lessons are concepts, technologies, patterns and practice designs; practice designs are questions.',
    promptTemplate: SD_PROMPT_TEMPLATE,
    scenarios,
    sections,
  };
}

/* ---------------------------------------------------------------- technical roadmap (Markdown) */

/**
 * `## X. Area` → section, `### X1. Topic — P0 (note)` → item. Plain bullets become the scope;
 * **Practice** / **Sample** / **Interview** bullets become the checkpoint. Sections without
 * `###` headings (how to prioritise, the sequence, mastery evidence) become single items.
 */
export function parseTechnicalRoadmap(markdown: string): BundleRoadmap {
  const sections: BundleSection[] = [];
  const guide: BundleItem[] = [];
  let section: BundleSection | null = null;
  let sectionBody: string[] = [];
  let sectionTitle = '';
  let item: {
    title: string;
    priority: 1 | 2 | 3;
    scope: string[];
    check: string[];
    note: string;
  } | null = null;
  const flushItem = () => {
    if (!item || !section) return;
    section.items.push({
      slug: slugify(
        item.title.split('.')[0] +
          '-' +
          item.title.split('.').slice(1).join(' '),
      ),
      title: item.title,
      kind: 'CONCEPT',
      priority: item.priority,
      scope: item.scope.join('\n'),
      checkpoint: item.check.join('\n') || undefined,
      sourceRef: `Technical roadmap ${item.title.split('.')[0]}${item.note ? ` (${item.note})` : ''}`,
    });
    item = null;
  };
  const flushSection = () => {
    flushItem();
    if (section && section.items.length) sections.push(section);
    else if (sectionTitle && sectionBody.join('').trim())
      guide.push({
        slug: `guide-${slugify(sectionTitle)}`,
        title: sectionTitle,
        kind: 'CONCEPT',
        priority: 2,
        scope: sectionBody.join('\n').trim(),
        checkpoint: 'Read once; apply when a posting or a week needs it.',
        sourceRef: 'Technical roadmap: guidance',
      });
    section = null;
    sectionBody = [];
    sectionTitle = '';
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h2 = /^## (.+)$/.exec(line);
    const h3 = /^### (.+)$/.exec(line);
    if (h2) {
      flushSection();
      sectionTitle = h2[1].replace(/^[A-Z]\. /, '').trim();
      section = { name: h2[1].trim(), items: [] };
      continue;
    }
    if (h3) {
      flushItem();
      const [head, ...rest] = h3[1].split(' — ');
      const tail = rest.join(' — ');
      item = {
        title: head.trim(),
        priority: priorityOf(tail),
        scope: [],
        check: [],
        note: tail
          .replace(/P[012]/, '')
          .replace(/^\s*\(|\)\s*$/g, '')
          .trim(),
      };
      continue;
    }
    if (item) {
      const bullet = /^- (.+)$/.exec(line);
      if (!bullet) continue;
      const text = bullet[1].replace(/\*\*/g, '');
      if (/^(Practice|Sample|Interview)\b/.test(text)) item.check.push(text);
      else item.scope.push(`• ${text}`);
    } else if (section) sectionBody.push(line);
  }
  flushSection();
  if (guide.length)
    sections.push({ name: 'How to use this roadmap', items: guide });
  return {
    title: 'Technical mastery',
    description:
      'Full-stack and backend fundamentals for SDE II loops (areas A–E of the technical roadmap) plus the interview formats you will meet. P0 first; a job posting reorders the rest.',
    sections,
  };
}

/* ---------------------------------------------------------------- DSA pattern book (pdftotext) */

export type BookChapter = {
  number: number;
  title: string;
  pages: string;
  intro: string;
  recognise: string;
  headings: string[];
};

/** Chapters from `pdftotext -layout` output: titles from the table of contents, bodies after it. */
export function parsePatternBook(text: string): BookChapter[] {
  const lines = text.split(/\r?\n/);
  const titles = new Map<number, string>();
  const starts: { number: number; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = /^\s*Chapter (\d+): (.+?)\s*$/.exec(l);
    if (!m) return;
    const n = Number(m[1]);
    if (!titles.has(n)) titles.set(n, m[2]);
    else starts.push({ number: n, line: i });
  });
  const marker = (i: number) =>
    /DSA Pattern Bible \| Page (\d+)/.exec(lines[i])?.[1];
  // The footer "Page N" closes page N, so a chapter's first page is the next marker after its
  // heading; its last page is the marker at or after its final line, else the previous one.
  const pageAt = (line: number, direction: 1 | -1) => {
    for (let i = line; i >= 0 && i < lines.length; i += direction) {
      const m = marker(i);
      if (!m) continue;
      if (direction === 1) return Number(m);
      // Searching back: text after the footer sits on the next page; trailing blanks do not.
      return lines.slice(i + 1, line + 1).some((l) => l.trim())
        ? Number(m) + 1
        : Number(m);
    }
    return null;
  };
  return starts.map((s, idx) => {
    const end = starts[idx + 1]?.line ?? lines.length;
    const body = lines.slice(s.line + 1, end).map((l) => l.replace(/\s+$/, ''));
    // The heading can wrap onto a second line; drop it when the TOC already holds the title.
    const title = titles.get(s.number) ?? body[0];
    let i = 0;
    while (i < body.length && title.endsWith(body[i].trim()) && body[i].trim())
      i++;
    const prose = (from: number) => {
      const out: string[] = [];
      for (let j = from; j < body.length; j++) {
        const t = body[j].trim();
        if (!t) {
          if (out.length) break;
          continue;
        }
        if (/^\s{2,}\S/.test(body[j]) && /[;{}=]|\/\//.test(t)) break;
        if (/Pattern Pehchaano Jab:/.test(t)) break;
        out.push(t);
        if (out.length >= 6) break;
      }
      return out.join(' ');
    };
    const intro = prose(i);
    const rec = body.findIndex((l) => /Pattern Pehchaano Jab:/.test(l));
    let recognise = '';
    if (rec >= 0) {
      const parts = [body[rec].trim()];
      for (
        let j = rec + 1;
        j < body.length && body[j].trim() && !/^\S/.test(body[j]);
        j++
      )
        parts.push(body[j].trim());
      recognise = parts.join(' ');
    }
    const headings = body
      .filter(
        (l) =>
          /^\S/.test(l) &&
          l.length <= 72 &&
          !/[;{}=()]|\/\/|\|/.test(l) &&
          !/[.:!?]$/.test(l.trim()) &&
          /^[A-Z0-9]/.test(l) &&
          l.split(' ').length <= 10 &&
          !title.includes(l.trim()),
      )
      .map((l) => l.trim());
    const first = pageAt(s.line, 1),
      last = pageAt(end - 1, 1) ?? pageAt(end - 1, -1);
    return {
      number: s.number,
      title,
      pages:
        first && last
          ? first === last
            ? `p. ${first}`
            : `pp. ${first}–${last}`
          : '',
      intro,
      recognise,
      headings: [...new Set(headings)],
    };
  });
}

/* ---------------------------------------------------------------- behavioural handbook (pdftotext) */

export type HandbookStory = {
  code: string;
  competencies: string;
  title: string;
  body: string;
};
export type HandbookPart = { number: string; title: string; body: string };
export type Handbook = {
  stories: HandbookStory[];
  parts: HandbookPart[];
  matrix: { competency: string; best: string; backup: string }[];
  addendum: { title: string; body: string }[];
};

const FOOTER = /^\s*BEHAVIORAL \+ RESUME DEEP DIVE \| 2026.*\d+ \/ \d+\s*$/;
const STORY = /^\s*((?:1V|AC|ACC|PROJ)-\d\d) \/ (.+?)\s*$/;
const PART = /^\s{0,4}(0[1-9]|10) ([A-Za-z0-9].+?)\s*$/;
const ADDENDUM = /^\s*ANSWERED FOLLOW-UPS \| INTERVIEW ADDENDUM/;
const ADDENDUM_HEAD = /^\s{0,2}([A-Za-z0-9+ ]{3,40}) \| ([^|]{3,80})$/;

/** Collapses layout spacing while keeping bullets and blank-line paragraphs. */
export function cleanBlock(lines: string[]) {
  const out: string[] = [];
  for (const raw of lines) {
    if (FOOTER.test(raw)) continue;
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const last = out[out.length - 1];
    // A wrapped line continues the one above, except after a finished bullet or a worksheet
    // blank (`____`), which end a line on their own.
    const finished =
      last !== undefined &&
      ((/^[•\-]\s/.test(last) && /[.?!”"]$/.test(last) && /^[A-Z“"]/.test(t)) ||
        /[”]$/.test(last) ||
        /_{4,}$/.test(last));
    if (
      /^[•\-]\s/.test(t) ||
      /^\d+\.\s/.test(t) ||
      /^[“]/.test(t) ||
      /_{4,}/.test(t) ||
      !out.length ||
      last === '' ||
      finished
    )
      out.push(t);
    else out[out.length - 1] += ' ' + t;
  }
  return out.join('\n').trim();
}

export function parseHandbook(text: string): Handbook {
  const lines = text.split(/\r?\n/);
  const addendumAt = lines.findIndex((l) => ADDENDUM.test(l));
  const main = addendumAt >= 0 ? lines.slice(0, addendumAt) : lines;
  const addendumLines = addendumAt >= 0 ? lines.slice(addendumAt + 1) : [];
  // Parts 01…10: the second occurrence of each heading is the body (the first is the contents).
  const partStarts: { number: string; title: string; line: number }[] = [];
  const seen = new Set<string>();
  main.forEach((l, i) => {
    const m = PART.exec(l);
    if (!m || /^\s*\d+ \d+/.test(l)) return;
    if (seen.has(m[1])) partStarts.push({ number: m[1], title: m[2], line: i });
    else seen.add(m[1]);
  });
  if (!partStarts.length)
    main.forEach((l, i) => {
      const m = PART.exec(l);
      if (m) partStarts.push({ number: m[1], title: m[2], line: i });
    });
  // Stories sit between part 02 and part 03.
  const storyStarts: { code: string; competencies: string; line: number }[] =
    [];
  main.forEach((l, i) => {
    const m = STORY.exec(l);
    if (m) storyStarts.push({ code: m[1], competencies: m[2], line: i });
  });
  const parts: HandbookPart[] = partStarts.map((p, idx) => {
    let end = partStarts[idx + 1]?.line ?? main.length;
    const story = storyStarts.find((s) => s.line > p.line && s.line < end);
    if (story) end = story.line;
    return {
      number: p.number,
      title: p.title,
      body: cleanBlock(main.slice(p.line + 1, end)),
    };
  });
  const part03 = partStarts.find((p) => p.number === '03')?.line ?? main.length;
  const stories: HandbookStory[] = storyStarts.map((s, idx) => {
    const end = Math.min(storyStarts[idx + 1]?.line ?? part03, part03);
    const body = main.slice(s.line + 1, end);
    const title =
      body.find((l) => l.trim() && !FOOTER.test(l))?.trim() ?? s.code;
    return {
      code: s.code,
      competencies: s.competencies,
      title,
      body: cleanBlock(
        body.slice(
          body.indexOf(body.find((l) => l.trim() === title) ?? '') + 1,
        ),
      ),
    };
  });
  // The selection matrix: rows "Competency   Best   Backup"; a wrapped competency name
  // continues on the next line without story codes.
  const matrix: Handbook['matrix'] = [];
  const m03 = parts.find((p) => p.number === '03');
  if (m03) {
    const rows = main.slice(
      partStarts.find((p) => p.number === '03')!.line,
      partStarts.find((p) => p.number === '04')?.line ?? main.length,
    );
    for (const raw of rows) {
      const cells = raw.trim().split(/\s{3,}/);
      const codes = cells.filter((c) => /^(1V|AC|ACC|PROJ)-\d\d/.test(c));
      if (cells.length >= 3 && codes.length === 2)
        matrix.push({ competency: cells[0], best: codes[0], backup: codes[1] });
      else if (
        matrix.length &&
        cells.length === 1 &&
        raw.trim() &&
        /^\s{3,5}\S/.test(raw) &&
        !/Where the evidence|Competency/.test(raw) &&
        !/^[•]/.test(raw.trim()) &&
        matrix[matrix.length - 1].competency.endsWith('/')
      )
        matrix[matrix.length - 1].competency += ' ' + cells[0];
    }
  }
  const addendum: Handbook['addendum'] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const raw of addendumLines) {
    const h = ADDENDUM_HEAD.exec(raw);
    if (h && !/^\d+\. /.test(raw.trim()) && !FOOTER.test(raw)) {
      if (current)
        addendum.push({
          title: current.title,
          body: cleanBlock(current.lines),
        });
      current = { title: `${h[1].trim()} · ${h[2].trim()}`, lines: [] };
    } else if (current) current.lines.push(raw);
  }
  if (current)
    addendum.push({ title: current.title, body: cleanBlock(current.lines) });
  return { stories, parts, matrix, addendum };
}

/** Bullet lines of a cleaned block, grouped under the plain line above them. */
export function groupedBullets(body: string) {
  const groups: { heading: string; bullets: string[] }[] = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    const b = /^[•\-]\s*(.+)$/.exec(line);
    if (b) {
      if (!groups.length) groups.push({ heading: '', bullets: [] });
      groups[groups.length - 1].bullets.push(b[1]);
    } else if (/^[A-Z]/.test(line) && line.length < 80 && !/[.]$/.test(line))
      groups.push({ heading: line, bullets: [] });
  }
  return groups.filter((g) => g.bullets.length);
}

/** Makes a reference list from label/url pairs; invalid URLs are dropped rather than imported. */
export const refs = (pairs: [string, string, string?][]): BundleReference[] =>
  pairs
    .filter(([, url]) => /^https?:\/\//.test(url))
    .map(([label, url, kind]) => ({ label, url, kind }));
