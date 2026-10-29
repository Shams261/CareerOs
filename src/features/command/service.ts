import 'server-only';
import { db } from '@/server/db';
import { dayKey, hhmm } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import type { ScheduleUser } from '@/features/schedule/service';
import { closeDayOpen } from '@/features/close-day/domain';
import { stopTime } from '@/features/close-day/service';
import { aiState } from '@/features/ai/service';
import { sourcePlan } from '@/features/listen/domain';
import { searchTerms, stageWords, type Command } from './domain';

const TAKE = 12;

/**
 * Today's commands for the bar when it opens (WI-036): back to a running session, a focus
 * session for each block still to do today, review or close the day, add a block. Three
 * small reads; nothing is cached or written.
 */
export async function todayCommands(
  user: ScheduleUser,
  now = new Date(),
): Promise<Command[]> {
  const today = dayKey(now, user.timezone);
  const [running, plan, stop] = await Promise.all([
    db().actualSession.findFirst({
      where: { userId: user.id, endedAt: null },
      select: { task: { select: { title: true } } },
    }),
    db().dailyPlan.findFirst({
      where: { userId: user.id, date: new Date(today) },
      select: {
        reviewedAt: true,
        checkIn: { select: { id: true } },
        blocks: {
          where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
          orderBy: { plannedStart: 'asc' },
          select: {
            id: true,
            title: true,
            plannedStart: true,
            plannedEnd: true,
            _count: { select: { sessions: true } },
          },
        },
      },
    }),
    stopTime(user.id),
  ]);
  // One practice problem to record (WI-059): the oldest revision due, if any.
  const due = await db().dsaProblem.findFirst({
    where: {
      userId: user.id,
      hiddenAt: null,
      nextRevisionAt: { lte: new Date(today) },
    },
    orderBy: { nextRevisionAt: 'asc' },
    select: { id: true, title: true },
  });
  const out: Command[] = [];
  if (running)
    out.push({
      id: 'focus:running',
      group: 'Today',
      verb: 'Back to focus',
      title: running.task?.title ?? 'Running session',
      href: '/focus',
      keywords: 'start session timer',
    });
  else
    for (const b of plan?.blocks ?? []) {
      if (+b.plannedEnd <= +now) continue;
      out.push({
        id: `focus:${b.id}`,
        group: 'Today',
        verb: 'Start focus',
        title: b.title,
        meta: `${hhmm(b.plannedStart, user.timezone)}–${hhmm(b.plannedEnd, user.timezone)}`,
        href: `/focus?block=${b.id}`,
        keywords: 'session timer begin',
      });
    }
  // Blocks that ended without a record: Log time opens their details on the form (WI-059).
  const logs: Command[] = [];
  for (const b of plan?.blocks ?? []) {
    if (+b.plannedEnd > +now || b._count.sessions) continue;
    logs.push({
      id: `log:${b.id}`,
      group: 'Today',
      verb: 'Log time',
      title: b.title,
      meta: `${hhmm(b.plannedStart, user.timezone)}–${hhmm(b.plannedEnd, user.timezone)}`,
      href: '/today',
      panel: `block:${b.id}`,
      focus: 'log',
      keywords: 'record session done mark',
    });
  }
  const addRoutine: Command = {
    id: 'plan:add-routine',
    group: 'Today',
    verb: 'Add routine',
    title: '',
    href: '/calendar',
    panel: 'routines',
    keywords: 'routine weekly repeat plan',
  };
  // An empty day starts with a routine, not with its review.
  if (!plan?.blocks.length) out.push(addRoutine);
  const reviewed = !!plan?.reviewedAt && !!plan.checkIn;
  const closing = closeDayOpen({
    day: today,
    today,
    now,
    zone: user.timezone,
    stopTime: stop,
    reviewed,
  });
  out.push(
    {
      id: 'today:review',
      group: 'Today',
      verb: closing ? 'Close the day' : reviewed ? 'Edit review' : 'Review day',
      title: '',
      href: '/today',
      panel: 'review',
      keywords: 'review close check-in evening',
    },
    {
      id: 'today:add-block',
      group: 'Today',
      verb: 'Add a block',
      title: '',
      href: '/today',
      press: '[data-shortcut="add-block"]',
      keywords: 'new plan one-time',
    },
    ...logs,
    ...(plan?.blocks.length ? [addRoutine] : []),
    {
      id: 'jobs:add-application',
      group: 'Jobs',
      verb: 'Add application',
      title: '',
      href: '/jobs',
      press: '[data-shortcut="add-application"]',
      keywords: 'job apply company role new',
    },
    ...(due
      ? [
          {
            id: `practice:attempt:${due.id}`,
            group: 'Practice' as const,
            verb: 'Record an attempt',
            title: due.title,
            meta: 'revision due',
            href: `/dsa/${due.id}#attempt-heading`,
            keywords: 'practice problem attempt dsa log',
          },
        ]
      : []),
  );
  return out;
}

const contains = (field: string, terms: string[]) =>
  terms.map((t) => ({
    [field]: { contains: t, mode: 'insensitive' as const },
  }));

/**
 * The owner's roadmap items, Practice problems and applications whose names contain any typed
 * word, as commands; the bar ranks them with everything else. A roadmap item also offers Grill
 * me when the server has AI on and that roadmap allows it (never for test-named records).
 */
export async function searchCommands(
  user: ScheduleUser,
  query: string,
  now = new Date(),
): Promise<Command[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const [items, problems, applications] = await Promise.all([
    db().roadmapItem.findMany({
      where: { userId: user.id, OR: contains('title', terms) },
      orderBy: [{ status: 'asc' }, { ordering: 'asc' }],
      take: TAKE,
      select: {
        id: true,
        title: true,
        section: true,
        status: true,
        nextRevisionAt: true,
        references: true,
        dsaProblemId: true,
        roadmap: { select: { id: true, title: true, studyAi: true } },
      },
    }),
    db().dsaProblem.findMany({
      where: {
        userId: user.id,
        hiddenAt: null,
        OR: contains('title', terms),
      },
      orderBy: { title: 'asc' },
      take: TAKE,
      select: {
        id: true,
        title: true,
        difficulty: true,
        topic: { select: { name: true } },
      },
    }),
    db().jobApplication.findMany({
      where: {
        userId: user.id,
        OR: [...contains('company', terms), ...contains('role', terms)],
      },
      orderBy: { updatedAt: 'desc' },
      take: TAKE,
      select: { id: true, company: true, role: true, stage: true },
    }),
  ]);
  const ai = items.some((i) => i.roadmap.studyAi)
    ? await aiState(user, now)
    : null;
  const grillOn = !!ai && ai.configured && ai.enabled && !ai.blocked;
  const today = dayKey(now, user.timezone);
  const out: Command[] = [];
  for (const i of items) {
    const href = `/roadmap/${i.roadmap.id}?section=${encodeURIComponent(i.section)}#item-${i.id}`;
    const due =
      i.nextRevisionAt && i.nextRevisionAt.toISOString().slice(0, 10) <= today;
    const meta = `${i.roadmap.title} · ${i.section}${due ? ' · revision due' : i.status === 'DONE' ? ' · done' : ''}`;
    if (grillOn && i.roadmap.studyAi && !isTestNamed(i.title, i.roadmap.title))
      out.push({
        id: `grill:${i.id}`,
        group: 'Roadmap',
        verb: 'Grill me',
        title: i.title,
        meta,
        href,
        press: `#item-${i.id} [data-grill-open]`,
        explicit: true,
      });
    if (
      grillOn &&
      i.roadmap.studyAi &&
      !isTestNamed(i.title, i.roadmap.title) &&
      sourcePlan(i.references).fetch.length
    )
      out.push({
        id: `listen:${i.id}`,
        group: 'Roadmap',
        verb: 'Listen',
        title: i.title,
        meta,
        href,
        press: `#item-${i.id} [data-listen-open]`,
        explicit: true,
      });
    // A problem item is the same thing as its Practice problem: one row, the problem's (WI-046).
    if (i.dsaProblemId) continue;
    out.push({
      id: `item:${i.id}`,
      group: 'Roadmap',
      verb: 'Open',
      title: i.title,
      meta,
      href,
    });
  }
  for (const p of problems)
    out.push({
      id: `problem:${p.id}`,
      group: 'Practice',
      verb: 'Open',
      title: p.title,
      meta: `${stageWords(p.difficulty)} · ${p.topic.name}`,
      href: `/dsa/${p.id}`,
    });
  for (const a of applications)
    out.push({
      id: `job:${a.id}`,
      group: 'Jobs',
      verb: 'Open',
      title: a.company,
      meta: `${a.role} · ${stageWords(a.stage)}`,
      href: `/jobs/${a.id}`,
    });
  return out;
}
