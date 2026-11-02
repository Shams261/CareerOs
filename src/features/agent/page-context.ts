import 'server-only';
/**
 * The record on the page Rumi is opened on (WI-117), read for the owner only and only through
 * the fields Rumi may read anyway: never notes, job descriptions, compensation, contacts or
 * interview reflections. Test-named records and Study AI off roadmaps are left out, as in
 * Rumi's own reads. Covered by tests/agent-page.test.ts.
 */
import { db } from '@/server/db';
import { isTestNamed } from '@/lib/test-data';
import { dayKey, shortDate, hhmm } from '@/lib/time';
import { confidenceWord } from '@/features/dsa/words';
import type { ScheduleUser } from '@/server/lock';
import type { PageRef, Place } from './page-domain';

const PLACE_NAME: Record<Place, string> = {
  today: 'Today',
  plan: 'Plan (the week)',
  roadmap: 'Roadmap',
  practice: 'Practice',
  jobs: 'Jobs',
  review: 'Weekly review',
  other: 'another page',
};

/** One line of data about the page, and the ids it names (so a card may use them). */
export async function readPage(
  user: ScheduleUser,
  ref: PageRef,
  now = new Date(),
): Promise<{ line: string; ids: string[] }> {
  const place = (p: Place) => ({
    line: `The owner opened you on ${PLACE_NAME[p]}.`,
    ids: [],
  });
  if (ref.kind === 'place') return place(ref.place);
  if (ref.kind === 'problem') {
    const p = await db().dsaProblem.findFirst({
      where: { id: ref.id, userId: user.id, hiddenAt: null },
      select: {
        id: true,
        title: true,
        difficulty: true,
        platform: true,
        confidence: true,
        attemptsCount: true,
        lastAttemptedAt: true,
        nextRevisionAt: true,
        topic: { select: { name: true } },
      },
    });
    if (!p || isTestNamed(p.title)) return place('practice');
    const facts = [
      `"${p.title}" (problem id ${p.id})`,
      `${p.difficulty.toLowerCase()}, ${p.platform}`,
      `topic ${p.topic.name}`,
      p.attemptsCount
        ? `${p.attemptsCount} attempt${p.attemptsCount === 1 ? '' : 's'}, confidence ${confidenceWord(p.confidence)}`
        : 'not attempted yet',
      p.lastAttemptedAt
        ? `last attempted ${shortDate(dayKey(p.lastAttemptedAt, user.timezone))}`
        : null,
      p.nextRevisionAt
        ? `next revision ${shortDate(p.nextRevisionAt.toISOString().slice(0, 10))}`
        : null,
    ].filter(Boolean);
    return {
      line: `The owner opened you on a Practice problem; "this problem" means it: ${facts.join('; ')}.`,
      ids: [p.id],
    };
  }
  if (ref.kind === 'application') {
    const a = await db().jobApplication.findFirst({
      where: { id: ref.id, userId: user.id },
      select: {
        id: true,
        company: true,
        role: true,
        stage: true,
        formats: true,
        nextActionDate: true,
        rounds: {
          where: { status: 'SCHEDULED', scheduledStart: { gte: now } },
          orderBy: { scheduledStart: 'asc' },
          take: 3,
          select: { id: true, type: true, scheduledStart: true },
        },
      },
    });
    if (!a || isTestNamed(a.company) || isTestNamed(a.role))
      return place('jobs');
    const rounds = a.rounds.map(
      (r) =>
        `${r.type.toLowerCase().replaceAll('_', ' ')} round ${shortDate(dayKey(r.scheduledStart!, user.timezone))} ${hhmm(r.scheduledStart!, user.timezone)} (round id ${r.id})`,
    );
    const facts = [
      `${a.company}, ${a.role} (application id ${a.id})`,
      `stage ${a.stage.toLowerCase().replaceAll('_', ' ')}`,
      a.formats.length
        ? `formats ${a.formats.map((f) => f.toLowerCase().replaceAll('_', ' ')).join(', ')}`
        : null,
      a.nextActionDate
        ? `next action due ${shortDate(a.nextActionDate.toISOString().slice(0, 10))}`
        : null,
      rounds.length
        ? `upcoming: ${rounds.join('; ')}`
        : 'no interview scheduled',
    ].filter(Boolean);
    return {
      line: `The owner opened you on a job application; "this application" means it: ${facts.join('; ')}.`,
      ids: [a.id, ...a.rounds.map((r) => r.id)],
    };
  }
  const r = await db().roadmap.findFirst({
    where: { id: ref.id, userId: user.id, studyAi: true },
    select: {
      id: true,
      title: true,
      _count: { select: { items: true } },
    },
  });
  if (!r || isTestNamed(r.title)) return place('roadmap');
  return {
    line: `The owner opened you on a roadmap; "this roadmap" means it: "${r.title}" (roadmap id ${r.id}, ${r._count.items} items). Read it with get_roadmaps.`,
    ids: [r.id],
  };
}
