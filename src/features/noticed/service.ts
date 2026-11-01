import 'server-only';
/**
 * Rumi noticed (WI-043): loads the owner's last four weeks for the pure rules and records the
 * owner's answers. Read-only apart from `answerNoticed`; the load is a memoized snapshot.
 * Covered by tests/noticed-database.test.ts.
 */
import { db } from '@/server/db';
import { memo } from '@/server/memo';
import { dayBounds, dayKey } from '@/lib/time';
import { isTestNamed } from '@/lib/test-data';
import { shiftDay } from '@/features/schedule/domain';
import type { ScheduleUser } from '@/features/schedule/service';
import { isStudyCategory } from '@/features/nudges/domain';
import { studyKinds } from '@/features/agent/tools';
import { dsaSnapshot } from '@/features/dsa/service';
import { curriculumOrder, nextProblemFor } from '@/features/dsa/domain';
import {
  cleanCopy,
  hiddenUntil,
  INTERVIEW_DAYS,
  LOOK_BACK,
  noticed,
  type NoticedKind,
} from './domain';

const label = (d: Date) => d.toISOString().slice(0, 10);

async function loadNoticed(user: ScheduleUser, now: Date) {
  const today = dayKey(now, user.timezone);
  const first = shiftDay(today, -LOOK_BACK);
  const start = dayBounds(first, user.timezone).start;
  const kinds = ['DSA', 'Technical', ...(await studyKinds(user.id))];
  const study = (category: string) => isStudyCategory(category, kinds);
  const [
    sessions,
    blocks,
    routines,
    rounds,
    hidden,
    attempts,
    revisions,
    items,
    dsa,
  ] = await Promise.all([
    db().actualSession.findMany({
      where: { userId: user.id, startedAt: { gte: start, lte: now } },
      select: { category: true, startedAt: true, endedAt: true },
    }),
    db().timeBlock.findMany({
      where: {
        dailyPlan: {
          userId: user.id,
          date: { gte: new Date(first), lte: new Date(shiftDay(today, 1)) },
        },
      },
      select: {
        title: true,
        category: true,
        routineKey: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        dailyPlan: { select: { date: true } },
        _count: { select: { sessions: true } },
      },
    }),
    db().routineBlock.findMany({
      where: { userId: user.id, enabled: true },
      select: { id: true, title: true, category: true, startLocal: true },
    }),
    db().interviewRound.findMany({
      where: {
        userId: user.id,
        status: 'SCHEDULED',
        scheduledStart: {
          gt: now,
          lt: new Date(+now + (INTERVIEW_DAYS + 1) * 86400000),
        },
      },
      select: {
        id: true,
        title: true,
        applicationId: true,
        scheduledStart: true,
        application: { select: { company: true, role: true } },
        _count: { select: { prepItems: { where: { completed: false } } } },
      },
    }),
    db().noticedAnswer.findMany({
      where: { userId: user.id, hiddenUntil: { gte: new Date(today) } },
      select: { key: true, hiddenUntil: true },
    }),
    // The pattern coach (WI-106): attempts, revision steps due soon, items in progress.
    db().dsaAttempt.findMany({
      where: { userId: user.id, attemptedAt: { gte: start, lte: now } },
      select: {
        attemptedAt: true,
        confidenceAfter: true,
        problem: {
          select: {
            id: true,
            title: true,
            hiddenAt: true,
            topicId: true,
            topic: { select: { name: true } },
          },
        },
      },
    }),
    db().dsaProblem.findMany({
      where: {
        userId: user.id,
        hiddenAt: null,
        attemptsCount: { gt: 0 },
        nextRevisionAt: {
          gte: new Date(today),
          lte: new Date(shiftDay(today, 1)),
        },
      },
      select: {
        id: true,
        title: true,
        topicId: true,
        nextRevisionAt: true,
        topic: { select: { name: true } },
      },
    }),
    db().roadmapItem.findMany({
      where: {
        userId: user.id,
        status: 'IN_PROGRESS',
        roadmap: { archivedAt: null },
      },
      select: {
        id: true,
        title: true,
        section: true,
        roadmapId: true,
        updatedAt: true,
        roadmap: { select: { title: true } },
      },
    }),
    dsaSnapshot(user, now),
  ]);
  const mine = attempts.filter(
    (a) => !a.problem.hiddenAt && !isTestNamed(a.problem.title),
  );
  const ordered = curriculumOrder(dsa.problems, dsa.topics);
  // For each topic practised lately, the next problem outside it, as Practice would pick.
  const nextOutside = Object.fromEntries(
    [...new Set(mine.map((a) => a.problem.topicId))].map((topicId) => {
      const p = nextProblemFor(
        ordered.filter((x) => x.topicId !== topicId),
        dsa.topics.filter((t) => t.id !== topicId),
        null,
      );
      return [topicId, p ? { id: p.id, title: p.title } : null];
    }),
  );
  return noticed({
    now,
    zone: user.timezone,
    studyKinds: kinds,
    sessions: sessions.filter((s) => study(s.category)),
    blocks: blocks
      .filter((b) => study(b.category) && !isTestNamed(b.title))
      .map((b) => ({
        category: b.category,
        routineKey: b.routineKey,
        status: b.status,
        plannedStart: b.plannedStart,
        plannedEnd: b.plannedEnd,
        day: label(b.dailyPlan.date),
        recorded: b._count.sessions > 0,
      })),
    routines: routines.filter(
      (r) => study(r.category) && !isTestNamed(r.title),
    ),
    rounds: rounds
      .filter(
        (r) => !isTestNamed(r.title, r.application.company, r.application.role),
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        applicationId: r.applicationId,
        company: r.application.company,
        scheduledStart: r.scheduledStart,
        openPrep: r._count.prepItems,
      })),
    hidden: hidden.map((h) => ({ key: h.key, until: label(h.hiddenUntil) })),
    attempts: mine.map((a) => ({
      problemId: a.problem.id,
      topicId: a.problem.topicId,
      topic: a.problem.topic.name,
      day: dayKey(a.attemptedAt, user.timezone),
      confidence: a.confidenceAfter,
    })),
    revisions: revisions
      .filter((p) => !isTestNamed(p.title))
      .map((p) => ({
        problemId: p.id,
        title: p.title,
        topicId: p.topicId,
        topic: p.topic.name,
        dueOn: label(p.nextRevisionAt!),
      })),
    items: items
      .filter((i) => !isTestNamed(i.title, i.roadmap.title))
      .map((i) => ({
        id: i.id,
        title: i.title,
        href: `/roadmap/${i.roadmapId}?section=${encodeURIComponent(i.section)}#item-${i.id}`,
        since: dayKey(i.updatedAt, user.timezone),
      })),
    nextOutside,
  }).filter(cleanCopy);
}
/** Today's "Rumi noticed" cards, at most two. */
export const noticedFor = (user: ScheduleUser, now = new Date()) =>
  memo(user.id, `noticed:${dayKey(now, user.timezone)}`, () =>
    loadNoticed(user, now),
  );

/** The owner's answer: an action taken or Dismiss. Either hides the card for a few days. */
export async function answerNoticed(
  user: ScheduleUser,
  input: { key: string; kind: NoticedKind; acted: boolean },
  now = new Date(),
) {
  const until = new Date(hiddenUntil(dayKey(now, user.timezone), input.acted));
  const stamp = input.acted ? { actedAt: now } : { dismissedAt: now };
  await db().noticedAnswer.upsert({
    where: { userId_key: { userId: user.id, key: input.key } },
    create: {
      userId: user.id,
      key: input.key,
      kind: input.kind,
      hiddenUntil: until,
      ...stamp,
    },
    update: { hiddenUntil: until, ...stamp },
  });
}
