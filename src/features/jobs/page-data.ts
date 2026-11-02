import 'server-only';
import { db } from '@/server/db';
import type { ScheduleUser } from '@/server/lock';
import { dayKey, shortDate } from '@/lib/time';
import { aiConfig } from '@/lib/env';
import { isTestNamed } from '@/lib/test-data';
import { dueContext } from '@/features/attention/domain';
import { prepDocs } from '@/features/prep/service';
import { estimateMicros, searchQueries } from '@/features/prep/domain';
import { applicationDetail, loopPractice } from './service';
import {
  calendarDate,
  followUpState,
  isOpen,
  label,
  ownerLabel,
  pagePrimary,
  resultNeeded,
} from './domain';
import type { LinkOption } from './forms';

/**
 * Everything an application page shows, read in one place (WI-126). Null when the id is not
 * the owner's. The lists beside the application need only its id, so they load alongside it
 * (WI-061).
 */
export async function applicationPage(
  user: ScheduleUser,
  id: string,
  now: Date,
) {
  const ai = !!aiConfig();
  const side = Promise.all([
    db().learningTopic.findMany({
      where: { userId: user.id, subject: { status: { not: 'ARCHIVED' } } },
      include: { subject: true },
      orderBy: [{ subject: { ordering: 'asc' } }, { ordering: 'asc' }],
    }),
    db().dsaProblem.findMany({
      where: { userId: user.id, hiddenAt: null },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
    db().dsaTopic.findMany({
      orderBy: { ordering: 'asc' },
      select: { id: true, name: true },
    }),
    // Prepare with Rumi (WI-042): the docs, and what a new one would send.
    ai ? prepDocs(user, id) : [],
    ai
      ? db().roadmapItem.count({
          where: {
            userId: user.id,
            roadmap: { studyAi: true, archivedAt: null },
          },
        })
      : 0,
    ai
      ? db().dsaProblem.count({
          where: { userId: user.id, hiddenAt: null },
        })
      : 0,
  ]);
  side.catch(() => undefined);
  const app = await applicationDetail(user, id);
  if (!app) return null;
  const zone = user.timezone,
    today = dayKey(now, zone),
    follow = followUpState(app, today),
    open = isOpen(app.stage);
  const [[topics, problems, dsaTopics, docs, studyItems, problemCount], loop] =
    await Promise.all([
      side,
      // Practise for this loop (WI-047).
      open ? loopPractice(user, app, now) : [],
    ]);
  // The rounds a doc would use: the upcoming ones, else every scheduled one (as `material`).
  const scheduled = app.rounds.filter((r) => r.status === 'SCHEDULED');
  const upcoming = scheduled.filter((r) => r.scheduledStart >= now);
  const prepRounds = upcoming.length ? upcoming : scheduled;
  const prepQueries = searchQueries({
    company: app.company,
    role: app.role,
    roundTypes: [...prepRounds.map((r) => r.type), ...app.formats],
  });
  const links: LinkOption[] = [
    ...topics.map((t) => ({
      value: `learning:${t.id}`,
      label: `Learning · ${t.subject.name} — ${t.title}`,
    })),
    ...dsaTopics.map((t) => ({
      value: `dsa-topic:${t.id}`,
      label: `DSA topic · ${t.name}`,
    })),
    ...problems.map((p) => ({
      value: `problem:${p.id}`,
      label: `DSA problem · ${p.title}`,
    })),
  ];
  // Prepare with Rumi sits inside the next upcoming round when there is one, else in the rail
  // (WI-058): the doc belongs beside the interview it prepares for.
  const showPrep = ai && open && !isTestNamed(app.company, app.role);
  const hasAction = !!(app.nextAction || app.nextActionDate);
  const details = (
    [
      [
        'Applied',
        app.appliedAt
          ? `${shortDate(calendarDate(app.appliedAt))}${app.source ? ` via ${app.source}` : ''}`
          : app.source
            ? `Not yet · ${app.source}`
            : null,
      ],
      [
        'Where',
        [
          app.location,
          app.workArrangement !== 'UNKNOWN' ? label(app.workArrangement) : null,
          app.employmentType,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      ],
      [
        'Recruiter',
        app.recruiterName
          ? `${app.recruiterName}${app.recruiterContact ? ` · ${app.recruiterContact}` : ''}`
          : null,
      ],
      ['Hiring contact', app.hiringContact],
      [
        'Priority',
        app.priority === 1 ? 'High' : app.priority === 3 ? 'Low' : null,
      ],
      ['Notes', app.notes],
      ['Offer / compensation', app.compensationNotes],
    ] as [string, string | null | undefined][]
  ).filter((row): row is [string, string] => !!row[1]);
  return {
    app,
    now,
    zone,
    today,
    follow,
    open,
    primary: pagePrimary(app, now, zone),
    // The earliest interview whose result is still due carries the page's primary action.
    resultRound: resultNeeded(app.rounds, now).sort(
      (a, b) => +a.scheduledStart - +b.scheduledStart,
    )[0],
    loop,
    docs,
    links,
    showPrep,
    prepRound: showPrep ? upcoming[0] : undefined,
    prepPreview: {
      queries: prepQueries,
      rounds: prepRounds.length,
      roadmapItems: Math.min(studyItems, 60),
      problems: Math.min(problemCount, 40),
      hasJobDescription: !!app.jobDescription?.trim(),
      estimateMicros: estimateMicros(prepQueries.length),
    },
    hasCreated: app.activities.some((a) => a.type === 'CREATED'),
    hasAction,
    moveContext: [
      follow.state === 'overdue' || follow.state === 'today'
        ? dueContext(follow.date, today)
        : follow.state === 'upcoming'
          ? `Due ${shortDate(follow.date)}`
          : 'No date set',
      ownerLabel(app.actionOwner),
    ].join(' · '),
    details,
  };
}
export type ApplicationView = NonNullable<
  Awaited<ReturnType<typeof applicationPage>>
>;
