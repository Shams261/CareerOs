import 'server-only';
import { aiPolicyLabel, typeText } from '@/features/jobs/formats';
/**
 * Ask Rumi's tools (WI-040, ADR-024): compact, owner-scoped, read-only summaries. Each reader
 * selects only the fields it sends, so the never-read list (notes, check-in notes, interview
 * reflections, compensation, contacts, descriptions, skip reasons, job descriptions) is
 * never even loaded. Blocks outside study and job search are sent as "busy". Roadmaps with
 * Study AI off and test-named records are left out. Covered by tests/agent-database.test.ts.
 */
import { db } from '@/server/db';
import { dayBounds, dayKey, hhmm, minutes } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { shiftDay } from '@/features/schedule/domain';
import type { ScheduleUser } from '@/features/schedule/service';
import { blockResolution, resolutionText } from '@/features/schedule/row';
import { categoryGroup } from '@/features/review/domain';
import { closedStages } from '@/features/jobs/domain';
import { DEFAULT_NUDGES } from '@/features/nudges/domain';
import { PATTERN_DAYS, patterns } from './plan-domain';
import { latestPrepDocs } from '@/features/prep/service';
import {
  ACTIVITY_DAYS,
  SCHEDULE_SPAN,
  titleVisible,
  type ToolName,
} from './domain';
import { FIND_LIMIT } from './write-domain';

const label = (d: Date) => d.toISOString().slice(0, 10);
const span = (s: Date, e: Date, zone: string) =>
  `${hhmm(s, zone)}–${hhmm(e, zone)}`;

const blockSelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  plannedStart: true,
  plannedEnd: true,
  interviewRoundId: true,
  sessions: { select: { id: true, startedAt: true, endedAt: true } },
  dailyPlan: { select: { date: true } },
} as const;
type Block = {
  id: string;
  title: string;
  category: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
  interviewRoundId: string | null;
  sessions: { id: string; startedAt: Date; endedAt: Date | null }[];
};

/** The owner's study categories (Study nudges setting), which decide whose titles are sent. */
export async function studyKinds(userId: string) {
  const row = await db().studyNudgeSetting.findUnique({
    where: { userId },
    select: { studyCategories: true },
  });
  return row?.studyCategories.length
    ? row.studyCategories
    : DEFAULT_NUDGES.studyCategories;
}

/** One block as sent: study and job blocks with kind, title and state; the rest only "busy". */
function blockOut(b: Block, now: Date, zone: string, study: string[]) {
  const time = span(b.plannedStart, b.plannedEnd, zone);
  if (!titleVisible(b.category, study) || isTestNamed(b.title))
    return { time, busy: true };
  const recorded = b.sessions.reduce(
    (n, s) => n + minutes(s.startedAt, s.endedAt ?? now),
    0,
  );
  return {
    // Visible blocks carry their id (WI-102), so a later card can name one it read.
    id: b.id,
    time,
    kind: categoryGroup(b.category),
    title: b.title,
    state: resolutionText[blockResolution(b, now)],
    ...(recorded ? { recordedMinutes: recorded } : {}),
  };
}
const byStart = (a: Block, b: Block) => +a.plannedStart - +b.plannedStart;
const live = (b: Block) => b.status !== 'CANCELLED';

async function getToday(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const [plan, running, study] = await Promise.all([
    db().dailyPlan.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(today) } },
      select: {
        reviewedAt: true,
        restAt: true,
        blocks: { select: blockSelect },
      },
    }),
    db().actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { category: true, startedAt: true },
    }),
    studyKinds(user.id),
  ]);
  const blocks = (plan?.blocks ?? []).filter(live).sort(byStart);
  return {
    day: today,
    time: hhmm(now, user.timezone),
    restDay: !!plan?.restAt,
    closed: !!plan?.reviewedAt,
    blocks: blocks.map((b) => blockOut(b, now, user.timezone, study)),
    running: running
      ? {
          kind: categoryGroup(running.category),
          since: hhmm(running.startedAt, user.timezone),
          minutes: minutes(running.startedAt, now),
        }
      : null,
  };
}

async function getSchedule(
  user: ScheduleUser,
  now: Date,
  { from, to }: { from: string; to: string },
) {
  const today = dayKey(now, user.timezone);
  const first = shiftDay(today, -ACTIVITY_DAYS),
    last = shiftDay(today, SCHEDULE_SPAN);
  if (from > to) [from, to] = [to, from];
  if (from < first) from = first;
  if (to > last) to = last;
  if (to > shiftDay(from, SCHEDULE_SPAN - 1))
    to = shiftDay(from, SCHEDULE_SPAN - 1);
  const [blocks, study] = await Promise.all([
    db().timeBlock.findMany({
      where: {
        dailyPlan: {
          userId: user.id,
          date: { gte: new Date(from), lte: new Date(to) },
        },
        status: { not: 'CANCELLED' },
      },
      select: blockSelect,
      orderBy: { plannedStart: 'asc' },
    }),
    studyKinds(user.id),
  ]);
  const days = new Map<string, ReturnType<typeof blockOut>[]>();
  for (const b of blocks) {
    const day = label(b.dailyPlan.date);
    days.set(day, [
      ...(days.get(day) ?? []),
      blockOut(b, now, user.timezone, study),
    ]);
  }
  return {
    from,
    to,
    days: [...days].map(([day, list]) => ({ day, blocks: list })),
  };
}

async function getActivity(
  user: ScheduleUser,
  now: Date,
  { days }: { days: number },
) {
  const today = dayKey(now, user.timezone);
  const first = shiftDay(today, -(days - 1));
  const start = dayBounds(first, user.timezone).start;
  const [sessions, blocks, done, study] = await Promise.all([
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: { gte: start, lte: now } },
      select: { category: true, startedAt: true, endedAt: true },
    }),
    db().timeBlock.findMany({
      where: {
        dailyPlan: {
          userId: user.id,
          date: { gte: new Date(first), lte: new Date(today) },
        },
        status: { not: 'CANCELLED' },
      },
      select: blockSelect,
      orderBy: { plannedStart: 'asc' },
    }),
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        status: 'DONE',
        completedAt: { gte: start, lte: now },
        roadmap: { studyAi: true, archivedAt: null },
      },
      select: {
        title: true,
        completedAt: true,
        roadmap: { select: { title: true } },
      },
    }),
    studyKinds(user.id),
  ]);
  type Day = {
    day: string;
    minutes: Record<string, number>;
    studyBlocks: { title: string; kind: string; state: string }[];
    roadmapDone: Record<string, number>;
  };
  const out = new Map<string, Day>();
  const at = (day: string) => {
    if (!out.has(day))
      out.set(day, { day, minutes: {}, studyBlocks: [], roadmapDone: {} });
    return out.get(day)!;
  };
  // Every study kind is named, at 0 when nothing was recorded, so Rumi can name a gap ("no
  // System design in 4 days") instead of only the kinds that have minutes.
  const kinds = [...new Set(['DSA', 'Technical', ...study].map(categoryGroup))];
  const totals: Record<string, number> = Object.fromEntries(
    kinds.map((k) => [k, 0]),
  );
  const lastRecorded: Record<string, string | null> = Object.fromEntries(
    kinds.map((k) => [k, null]),
  );
  for (const s of sessions) {
    const kind = categoryGroup(s.category);
    const m = minutes(s.startedAt, s.endedAt ?? now);
    const day = dayKey(s.startedAt, user.timezone);
    const d = at(day);
    d.minutes[kind] = (d.minutes[kind] ?? 0) + m;
    totals[kind] = (totals[kind] ?? 0) + m;
    if (!lastRecorded[kind] || lastRecorded[kind]! < day)
      lastRecorded[kind] = day;
  }
  for (const b of blocks) {
    if (!titleVisible(b.category, study) || isTestNamed(b.title)) continue;
    at(label(b.dailyPlan.date)).studyBlocks.push({
      title: b.title,
      kind: categoryGroup(b.category),
      state: resolutionText[blockResolution(b, now)],
    });
  }
  const roadmapTotals: Record<string, number> = {};
  for (const i of done) {
    if (isTestNamed(i.title, i.roadmap.title)) continue;
    const d = at(dayKey(i.completedAt!, user.timezone));
    d.roadmapDone[i.roadmap.title] = (d.roadmapDone[i.roadmap.title] ?? 0) + 1;
    roadmapTotals[i.roadmap.title] = (roadmapTotals[i.roadmap.title] ?? 0) + 1;
  }
  return {
    from: first,
    to: today,
    studyKinds: kinds,
    totalMinutes: totals,
    lastRecordedOn: lastRecorded,
    roadmapItemsDone: roadmapTotals,
    days: [...out.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

async function getRoadmaps(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const roadmaps = await db().roadmap.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: { ordering: 'asc' },
    select: {
      title: true,
      studyAi: true,
      items: {
        select: {
          title: true,
          section: true,
          status: true,
          priority: true,
          ordering: true,
          nextRevisionAt: true,
        },
        orderBy: [{ section: 'asc' }, { ordering: 'asc' }],
      },
    },
  });
  const shared = roadmaps.filter((r) => r.studyAi && !isTestNamed(r.title));
  return {
    hiddenRoadmaps: roadmaps.length - shared.length,
    hiddenNote:
      'Roadmaps with Study AI off in their settings are not shared with the assistant.',
    roadmaps: shared.map((r) => {
      const items = r.items.filter((i) => !isTestNamed(i.title));
      const next =
        items.find((i) => i.status === 'IN_PROGRESS') ??
        [...items]
          .filter((i) => i.status === 'NOT_STARTED')
          .sort((a, b) => a.priority - b.priority)[0];
      const due = items
        .filter(
          (i) =>
            i.status === 'DONE' &&
            i.nextRevisionAt &&
            label(i.nextRevisionAt) <= today,
        )
        .sort((a, b) => +a.nextRevisionAt! - +b.nextRevisionAt!);
      return {
        title: r.title,
        done: items.filter((i) => i.status === 'DONE').length,
        left: items.filter((i) => i.status !== 'DONE').length,
        inProgress: items.filter((i) => i.status === 'IN_PROGRESS').length,
        next: next
          ? {
              title: next.title,
              section: next.section,
              priority: `P${next.priority}`,
            }
          : null,
        dueForRevision: due.length,
        firstDue: due.slice(0, 5).map((i) => ({
          title: i.title,
          dueOn: label(i.nextRevisionAt!),
        })),
      };
    }),
  };
}

async function getPractice(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const [problems, attempts] = await Promise.all([
    db().dsaProblem.findMany({
      where: { userId: user.id, hiddenAt: null },
      select: { title: true, confidence: true, nextRevisionAt: true },
    }),
    db().dsaAttempt.findMany({
      where: { userId: user.id },
      orderBy: { attemptedAt: 'desc' },
      take: 20,
      select: {
        attemptedAt: true,
        confidenceAfter: true,
        solvedIndependently: true,
        durationMinutes: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            topic: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  const mine = problems.filter((p) => !isTestNamed(p.title));
  const count = (c: string) => mine.filter((p) => p.confidence === c).length;
  return {
    problems: mine.length,
    confidence: {
      red: count('RED'),
      yellow: count('YELLOW'),
      green: count('GREEN'),
    },
    dueForRevision: mine.filter(
      (p) => p.nextRevisionAt && label(p.nextRevisionAt) <= today,
    ).length,
    lastAttempts: attempts
      .filter((a) => !isTestNamed(a.problem.title))
      .slice(0, 10)
      .map((a) => ({
        on: dayKey(a.attemptedAt, user.timezone),
        problemId: a.problem.id,
        problem: a.problem.title,
        difficulty: a.problem.difficulty.toLowerCase(),
        topic: a.problem.topic.name,
        confidence: a.confidenceAfter.toLowerCase(),
        solved: a.solvedIndependently.toLowerCase().replace(/_/g, ' '),
        ...(a.durationMinutes ? { minutes: a.durationMinutes } : {}),
      })),
  };
}

async function getJobs(user: ScheduleUser, now: Date) {
  const apps = await db().jobApplication.findMany({
    where: { userId: user.id, stage: { notIn: [...closedStages] } },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      company: true,
      role: true,
      stage: true,
      appliedAt: true,
      nextActionDate: true,
      actionOwner: true,
      formats: true,
      rounds: {
        where: { status: 'SCHEDULED', scheduledStart: { gte: now } },
        orderBy: { scheduledStart: 'asc' },
        select: {
          id: true,
          title: true,
          type: true,
          aiPolicy: true,
          scheduledStart: true,
          prepItems: {
            orderBy: { ordering: 'asc' },
            select: { title: true, kind: true, completed: true },
          },
        },
      },
    },
  });
  return {
    applications: apps
      .filter((a) => !isTestNamed(a.company, a.role))
      .map((a) => ({
        applicationId: a.id,
        company: a.company,
        role: a.role,
        stage: a.stage.toLowerCase().replace(/_/g, ' '),
        ...(a.appliedAt ? { appliedOn: label(a.appliedAt) } : {}),
        ...(a.nextActionDate
          ? {
              nextActionOn: label(a.nextActionDate),
              nextActionBy: a.actionOwner.toLowerCase(),
            }
          : {}),
        // The loop's formats and each round's AI rule (WI-047), only when the owner set them.
        ...(a.formats.length
          ? { formats: a.formats.map((f) => typeText(f).toLowerCase()) }
          : {}),
        upcomingRounds: a.rounds.map((r) => ({
          roundId: r.id,
          title: r.title,
          type: r.type.toLowerCase().replace(/_/g, ' '),
          ...(r.aiPolicy !== 'UNKNOWN'
            ? { ai: aiPolicyLabel[r.aiPolicy].toLowerCase() }
            : {}),
          on: dayKey(r.scheduledStart, user.timezone),
          at: hhmm(r.scheduledStart, user.timezone),
          prep: r.prepItems
            .filter((p) => !isTestNamed(p.title))
            .slice(0, 12)
            .map((p) => ({
              title: p.title,
              kind: p.kind.toLowerCase().replace(/_/g, ' '),
              done: p.completed,
            })),
        })),
      })),
  };
}

/** Best hours and recorded share of planned time over the last 28 days (WI-041). */
export async function getPatterns(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const first = shiftDay(today, -(PATTERN_DAYS - 1));
  const start = dayBounds(first, user.timezone).start;
  const [sessions, blocks, study] = await Promise.all([
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: { gte: start, lte: now } },
      select: { category: true, startedAt: true, endedAt: true },
    }),
    db().timeBlock.findMany({
      where: {
        dailyPlan: { userId: user.id },
        status: { not: 'CANCELLED' },
        plannedStart: { gte: start },
        plannedEnd: { lte: now },
      },
      select: {
        category: true,
        title: true,
        plannedStart: true,
        plannedEnd: true,
      },
    }),
    studyKinds(user.id),
  ]);
  const studied = sessions.filter((s) => titleVisible(s.category, study));
  return patterns(
    {
      sessions: studied,
      planned: blocks.filter(
        (b) => titleVisible(b.category, study) && !isTestNamed(b.title),
      ),
    },
    now,
    user.timezone,
  );
}

/**
 * `find_items` (WI-118): up to eight items of the owner's Study AI roadmaps whose title holds
 * every word, with their id, so a card can mark one. Item notes are never read.
 */
async function findItems(user: ScheduleUser, { text }: { text: string }) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db().roadmapItem.findMany({
    where: {
      userId: user.id,
      roadmap: { studyAi: true, archivedAt: null },
      AND: words.map((w) => ({
        title: { contains: w, mode: 'insensitive' as const },
      })),
    },
    orderBy: [{ section: 'asc' }, { ordering: 'asc' }],
    take: FIND_LIMIT * 2,
    select: {
      id: true,
      title: true,
      section: true,
      status: true,
      dsaProblemId: true,
      roadmap: { select: { title: true } },
    },
  });
  return {
    items: rows
      .filter((i) => !isTestNamed(i.title) && !isTestNamed(i.roadmap.title))
      .slice(0, FIND_LIMIT)
      .map((i) => ({
        itemId: i.id,
        title: i.title,
        roadmap: i.roadmap.title,
        section: i.section,
        status: i.status.toLowerCase().replaceAll('_', ' '),
        ...(i.dsaProblemId ? { followsPractice: true } : {}),
      })),
  };
}

/**
 * `find_problems` (WI-102): up to eight of the owner's visible problems whose title holds
 * every word, with their id, so a later card can name one it read.
 */
async function findProblems(user: ScheduleUser, { text }: { text: string }) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db().dsaProblem.findMany({
    where: {
      userId: user.id,
      hiddenAt: null,
      AND: words.map((w) => ({
        title: { contains: w, mode: 'insensitive' as const },
      })),
    },
    orderBy: { title: 'asc' },
    take: FIND_LIMIT * 2,
    select: {
      id: true,
      title: true,
      difficulty: true,
      confidence: true,
      attemptsCount: true,
      nextRevisionAt: true,
      topic: { select: { name: true } },
    },
  });
  return {
    problems: rows
      .filter((p) => !isTestNamed(p.title))
      .slice(0, FIND_LIMIT)
      .map((p) => ({
        problemId: p.id,
        title: p.title,
        topic: p.topic.name,
        difficulty: p.difficulty.toLowerCase(),
        ...(p.attemptsCount
          ? {
              confidence: p.confidence.toLowerCase(),
              attempts: p.attemptsCount,
            }
          : { attempts: 0 }),
        ...(p.nextRevisionAt ? { revisionOn: label(p.nextRevisionAt) } : {}),
      })),
  };
}

/** Runs one validated tool for the signed-in owner. */
export function runTool(
  user: ScheduleUser,
  name: ToolName,
  args: Record<string, unknown>,
  now: Date,
): Promise<unknown> {
  switch (name) {
    case 'get_today':
      return getToday(user, now);
    case 'get_schedule':
      return getSchedule(user, now, args as { from: string; to: string });
    case 'get_activity':
      return getActivity(user, now, args as { days: number });
    case 'get_roadmaps':
      return getRoadmaps(user, now);
    case 'get_practice':
      return getPractice(user, now);
    case 'get_jobs':
      return getJobs(user, now);
    case 'get_patterns':
      return getPatterns(user, now);
    case 'get_prep_docs':
      return latestPrepDocs(user);
    case 'find_problems':
      return findProblems(user, args as { text: string });
    case 'find_items':
      return findItems(user, args as { text: string });
    default:
      // Cards and writes, not reads: the message loop handles them (WI-041, WI-102, WI-103).
      return Promise.resolve({ error: 'Not a read tool.' });
  }
}
