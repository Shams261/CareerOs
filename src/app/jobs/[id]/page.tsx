import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { dayKey, shortDate, weekdayDate } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure, DisclosureTabs } from '@/components/disclosure';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { applicationDetail } from '@/features/jobs/service';
import {
  calendarDate,
  followUpState,
  interviewTime,
  isOpen,
  label,
  nextRound,
  ownerLabel,
  roundEnd,
} from '@/features/jobs/domain';
import {
  DetailsForm,
  FollowUpDoneForm,
  FollowUpForm,
  NoteForm,
  PrepForm,
  PrepToggle,
  RescheduleForm,
  ResultForm,
  RoundDetailsForm,
  RoundForm,
  ScheduleInterviewForm,
  StageForm,
  ZoneOptions,
  type LinkOption,
} from '@/features/jobs/forms';
import { ArrowLeft, Check, Circle, AlertTriangle } from 'lucide-react';
export const metadata = { title: 'Jobs' };

export default async function Application({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params,
    app = await applicationDetail(user, id);
  if (!app) notFound();
  const now = new Date(),
    zone = user.timezone,
    today = dayKey(now, zone),
    follow = followUpState(app, today),
    upcoming = nextRound(app.rounds, now),
    at = (d: Date) => formatInTimeZone(d, zone, 'MMM d, h:mm a');
  const [topics, problems, dsaTopics] = await Promise.all([
    db().learningTopic.findMany({
      where: { userId: user.id, subject: { status: { not: 'ARCHIVED' } } },
      include: { subject: true },
      orderBy: [{ subject: { ordering: 'asc' } }, { ordering: 'asc' }],
    }),
    db().dsaProblem.findMany({
      where: { userId: user.id },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
    db().dsaTopic.findMany({
      orderBy: { ordering: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
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
  const describe = (a: (typeof app.activities)[number]) => {
    switch (a.type) {
      case 'CREATED':
        return `Added as ${label(a.toStage ?? 'SAVED')}`;
      case 'STAGE_CHANGED':
        return `${label(a.fromStage ?? '')} to ${label(a.toStage ?? '')}`;
      case 'INTERVIEW_SCHEDULED':
        return `Interview scheduled: ${a.note ?? ''}${a.newStart ? ` for ${at(a.newStart)}` : ''}`;
      case 'INTERVIEW_RESCHEDULED':
        return `Interview rescheduled: ${a.previousStart ? at(a.previousStart) : '?'} to ${a.newStart ? at(a.newStart) : '?'}`;
      case 'INTERVIEW_RESULT':
        return `Interview result — ${a.note ?? ''}`;
      case 'FOLLOW_UP_SET':
        return 'Next action updated';
      case 'FOLLOW_UP_DONE':
        return 'Next action completed';
      case 'NOTE':
        return 'Note';
    }
  };
  const hasCreated = app.activities.some((a) => a.type === 'CREATED');
  return (
    <>
      <ZoneOptions />
      <Link className="link" href="/jobs">
        <ArrowLeft size={14} aria-hidden="true" /> Jobs
      </Link>
      <p className="eyebrow mt-4">
        {app.company}
        {app.location ? ` · ${app.location}` : ''}
        {app.workArrangement !== 'UNKNOWN'
          ? ` · ${label(app.workArrangement)}`
          : ''}
      </p>
      <h1>{app.role}</h1>
      <div className="status-line summary-line mb-7">
        <span className="pill">{label(app.stage)}</span>
        <Disclosure variant="link" label="Change stage">
          <StageForm app={app} />
        </Disclosure>
        {(app.nextAction || app.nextActionDate) && (
          <span>
            <strong>{app.nextAction ?? 'Follow up'}</strong>
            {follow.state === 'overdue'
              ? ` · overdue by ${follow.days} day${follow.days === 1 ? '' : 's'}`
              : follow.state === 'today'
                ? ' · due today'
                : follow.state === 'upcoming'
                  ? ` · due ${shortDate(follow.date)}`
                  : ''}
          </span>
        )}
        {upcoming && (
          <span>
            Next interview: {upcoming.title} · {interviewTime(upcoming, zone)}
          </span>
        )}
        <span>
          Applied{' '}
          {app.appliedAt ? shortDate(calendarDate(app.appliedAt)) : 'not yet'}
          {app.source ? ` via ${app.source}` : ''}
        </span>
        {app.jobUrl && (
          <ResourceLink url={app.jobUrl}>Job posting</ResourceLink>
        )}
      </div>
      <div className="grid-main">
        <section>
          <section className="card" aria-labelledby="next-heading">
            <h2 id="next-heading">Next action</h2>
            {app.nextAction || app.nextActionDate ? (
              <>
                <p>
                  <strong>{app.nextAction ?? 'Follow up'}</strong>
                </p>
                <p className="muted">
                  {follow.state === 'overdue'
                    ? `Overdue by ${follow.days} day${follow.days === 1 ? '' : 's'} (due ${shortDate(follow.date)})`
                    : follow.state === 'today'
                      ? 'Due today'
                      : follow.state === 'upcoming'
                        ? `Due ${shortDate(follow.date)}`
                        : 'No due date'}{' '}
                  · {ownerLabel(app.actionOwner)}
                </p>
              </>
            ) : (
              <p className="muted">
                No next action. {ownerLabel(app.actionOwner)}.
              </p>
            )}
            {!isOpen(app.stage) && <p className="muted">Closed application.</p>}
            <FeedbackOutlet channel="next-action" />
            <DisclosureTabs
              className="mt-4"
              items={[
                ...(app.nextAction || app.nextActionDate
                  ? [
                      {
                        label: 'Mark done',
                        content: <FollowUpDoneForm app={app} />,
                      },
                    ]
                  : []),
                {
                  label: 'Edit next action',
                  content: <FollowUpForm app={app} />,
                },
              ]}
            />
          </section>

          <section className="card" aria-labelledby="interviews-heading">
            <h2 id="interviews-heading">Interviews</h2>
            {!app.rounds.length && <p className="muted">No interviews yet.</p>}
            {app.rounds.map((r) => {
              const prep = r.prepItems.filter((p) => p.kind === 'PREP'),
                gaps = r.prepItems.filter((p) => p.kind === 'GAP'),
                awaitingResult = r.status === 'SCHEDULED' && roundEnd(r) <= now;
              return (
                <article
                  className="learning-history"
                  id={`round-${r.id}`}
                  key={r.id}
                >
                  <h3>
                    {r.title}{' '}
                    <span className="pill">
                      {awaitingResult ? 'Result needed' : label(r.status)}
                    </span>
                  </h3>
                  <p className="muted">
                    {label(r.type)} · {interviewTime(r, zone)}
                    {r.interviewers ? ` · With ${r.interviewers}` : ''}
                    {r.location ? ` · ${r.location}` : ''}
                  </p>
                  {r.scheduleBlock ? (
                    <p className="muted">
                      On schedule ·{' '}
                      <Link
                        className="link"
                        href={`/today?date=${dayKey(r.scheduleBlock.plannedStart, zone)}`}
                      >
                        {weekdayDate(
                          dayKey(r.scheduleBlock.plannedStart, zone),
                        )}
                      </Link>
                      {r.scheduleBlock.status === 'CANCELLED'
                        ? ' (cancelled)'
                        : ''}
                    </p>
                  ) : (
                    r.status === 'SCHEDULED' && (
                      <ScheduleInterviewForm roundId={r.id} />
                    )
                  )}
                  {r.meetingUrl && (
                    <p>
                      <ResourceLink url={r.meetingUrl}>
                        Meeting link
                      </ResourceLink>
                    </p>
                  )}
                  {r.notes && <p className="learning-notes">{r.notes}</p>}
                  {(r.outcomeNotes ||
                    r.topicsAsked ||
                    r.wentWell ||
                    r.toImprove) && (
                    <dl className="job-facts">
                      {[
                        ['How it went', r.outcomeNotes],
                        ['Topics asked', r.topicsAsked],
                        ['Went well', r.wentWell],
                        ['To improve', r.toImprove],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="muted">{k}</dt>
                            <dd className="learning-notes">{v}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                  <h4 className="mt-4">Preparation</h4>
                  {prep.length ? (
                    <ul className="plain-list">
                      {prep.map((p) => (
                        <li className="prep-item" key={p.id}>
                          <span>
                            {p.completed ? (
                              <Check size={14} aria-hidden="true" />
                            ) : (
                              <Circle size={14} aria-hidden="true" />
                            )}{' '}
                            {p.completed ? 'Done: ' : 'To do: '}
                            {p.title}
                            <PrepLink item={p} />
                          </span>
                          <PrepToggle
                            id={p.id}
                            completed={p.completed}
                            title={p.title}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No prep items.</p>
                  )}
                  {gaps.length > 0 && (
                    <>
                      <h4 className="mt-4">Weak areas to study</h4>
                      <ul className="plain-list">
                        {gaps.map((p) => (
                          <li className="prep-item" key={p.id}>
                            <span>
                              {p.completed ? (
                                <Check size={14} aria-hidden="true" />
                              ) : (
                                <AlertTriangle size={14} aria-hidden="true" />
                              )}{' '}
                              {p.completed ? 'Addressed: ' : 'Open: '}
                              {p.title}
                              <PrepLink item={p} />
                            </span>
                            <PrepToggle
                              id={p.id}
                              completed={p.completed}
                              title={p.title}
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <FeedbackOutlet channel={`round-${r.id}`} />
                  {awaitingResult && (
                    <Disclosure
                      label="Log the result"
                      variant="primary"
                      defaultOpen
                      className="mt-4"
                    >
                      <ResultForm round={r} stage={app.stage} />
                    </Disclosure>
                  )}
                  <DisclosureTabs
                    className="mt-3"
                    items={[
                      {
                        label: 'Add prep item',
                        content: (
                          <PrepForm roundId={r.id} kind="PREP" links={links} />
                        ),
                      },
                      {
                        label: 'Add weak area',
                        content: (
                          <PrepForm roundId={r.id} kind="GAP" links={links} />
                        ),
                      },
                      ...(awaitingResult
                        ? []
                        : [
                            {
                              label:
                                r.status === 'COMPLETED'
                                  ? 'Edit reflection'
                                  : 'Log result',
                              content: (
                                <ResultForm round={r} stage={app.stage} />
                              ),
                            },
                          ]),
                      ...(r.status !== 'COMPLETED'
                        ? [
                            {
                              label: 'Reschedule',
                              content: <RescheduleForm round={r} />,
                            },
                          ]
                        : []),
                      {
                        label: 'Edit details',
                        content: <RoundDetailsForm round={r} />,
                      },
                    ]}
                  />
                </article>
              );
            })}
            {isOpen(app.stage) && (
              <Disclosure label="Add interview" className="mt-4">
                <RoundForm applicationId={app.id} zone={zone} />
              </Disclosure>
            )}
          </section>

          <section className="card flat" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading">Timeline</h2>
            <ol className="plain-list">
              {app.activities.map((a) => (
                <li className="dsa-item" key={a.id}>
                  <strong>{shortDate(dayKey(a.occurredAt, zone))}</strong> —{' '}
                  {describe(a)}
                  {a.note &&
                    !['INTERVIEW_RESULT', 'INTERVIEW_SCHEDULED'].includes(
                      a.type,
                    ) && <p className="muted learning-notes">{a.note}</p>}
                </li>
              ))}
            </ol>
            {!hasCreated && (
              <p className="muted">Earlier events were not recorded.</p>
            )}
            <Disclosure variant="link" label="Add a note" className="mt-3">
              <NoteForm id={app.id} />
            </Disclosure>
          </section>
        </section>
        <aside>
          <section className="card flat">
            <h2>Contacts</h2>
            <p>Recruiter: {app.recruiterName ?? 'Not added'}</p>
            {app.recruiterContact && (
              <p className="muted">{app.recruiterContact}</p>
            )}
            <p>Hiring contact: {app.hiringContact ?? 'Not added'}</p>
          </section>
          <section className="card flat">
            <h2>Notes</h2>
            <p className="learning-notes">{app.notes ?? 'No notes yet.'}</p>
            {app.compensationNotes && (
              <>
                <h3 className="mt-4">Offer / compensation</h3>
                <p className="learning-notes">{app.compensationNotes}</p>
              </>
            )}
            {app.jobDescription && (
              <Disclosure
                variant="link"
                label="Job description"
                className="mt-4"
              >
                <p className="learning-notes">{app.jobDescription}</p>
              </Disclosure>
            )}
            {app.resources.map((r) => (
              <p key={r.id}>
                <ResourceLink url={r.url}>{r.title}</ResourceLink>
              </p>
            ))}
          </section>
          <Disclosure label="Edit application">
            <section className="card">
              <DetailsForm app={app} />
            </section>
          </Disclosure>
        </aside>
      </div>
    </>
  );
}

function PrepLink({
  item,
}: {
  item: {
    learningTopic: {
      id: string;
      title: string;
      subject: { name: string };
    } | null;
    dsaProblem: { id: string; title: string } | null;
    dsaTopic: { id: string; name: string } | null;
  };
}) {
  if (item.learningTopic)
    return (
      <>
        {' · '}
        <Link className="link" href={`/learn/topics/${item.learningTopic.id}`}>
          {item.learningTopic.subject.name} — {item.learningTopic.title}
        </Link>
      </>
    );
  if (item.dsaProblem)
    return (
      <>
        {' · '}
        <Link className="link" href={`/dsa/${item.dsaProblem.id}`}>
          DSA: {item.dsaProblem.title}
        </Link>
      </>
    );
  if (item.dsaTopic)
    return <span className="muted"> · DSA topic: {item.dsaTopic.name}</span>;
  return null;
}
