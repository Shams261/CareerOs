import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { applicationDetail } from '@/features/jobs/service';
import {
  calendarDate,
  followUpState,
  interviewTime,
  isOpen,
  label,
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
        return `${label(a.fromStage ?? '')} → ${label(a.toStage ?? '')}`;
      case 'INTERVIEW_SCHEDULED':
        return `Interview scheduled: ${a.note ?? ''}${a.newStart ? ` for ${at(a.newStart)}` : ''}`;
      case 'INTERVIEW_RESCHEDULED':
        return `Interview rescheduled: ${a.previousStart ? at(a.previousStart) : '?'} → ${a.newStart ? at(a.newStart) : '?'}`;
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
        ← Job search
      </Link>
      <p className="eyebrow mt-4">
        {app.company}
        {app.location ? ` · ${app.location}` : ''}
        {app.workArrangement !== 'UNKNOWN'
          ? ` · ${label(app.workArrangement)}`
          : ''}
      </p>
      <h1>{app.role}</h1>
      <p className="muted mb-7">
        Stage: <strong>{label(app.stage)}</strong> · Applied:{' '}
        {app.appliedAt ? calendarDate(app.appliedAt) : 'not yet'}
        {app.source ? ` · Source: ${app.source}` : ''}
        {app.employmentType ? ` · ${app.employmentType}` : ''} · Priority:{' '}
        {['High', 'Normal', 'Low'][app.priority - 1]}
        {app.jobUrl && (
          <>
            {' · '}
            <ResourceLink url={app.jobUrl}>Open job posting</ResourceLink>
          </>
        )}
      </p>
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
                    ? `OVERDUE BY ${follow.days} DAY${follow.days === 1 ? '' : 'S'} (due ${follow.date})`
                    : follow.state === 'today'
                      ? 'Due today'
                      : follow.state === 'upcoming'
                        ? `Due ${follow.date}`
                        : 'No due date'}{' '}
                  · {ownerLabel(app.actionOwner)}
                </p>
              </>
            ) : (
              <p className="muted">
                No next action. {ownerLabel(app.actionOwner)}.
              </p>
            )}
            {!isOpen(app.stage) && (
              <p className="muted">
                This application is closed; it stays here for reference and
                never appears in attention lists.
              </p>
            )}
            {(app.nextAction || app.nextActionDate) && (
              <details className="mt-4">
                <summary>Mark done and set the next step</summary>
                <FollowUpDoneForm app={app} />
              </details>
            )}
            <details className="mt-3">
              <summary>Edit next action / waiting state</summary>
              <FollowUpForm app={app} />
            </details>
          </section>

          <section className="card" aria-labelledby="interviews-heading">
            <h2 id="interviews-heading">Interviews</h2>
            {!app.rounds.length && (
              <p className="muted">No interview rounds yet.</p>
            )}
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
                        {dayKey(r.scheduleBlock.plannedStart, zone)}
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
                            {p.completed ? '✓ Done: ' : '○ To do: '}
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
                              {p.completed ? '✓ Addressed: ' : '△ Open: '}
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
                  <details className="mt-3">
                    <summary>Add prep item</summary>
                    <PrepForm roundId={r.id} kind="PREP" links={links} />
                  </details>
                  <details className="mt-3">
                    <summary>Add weak area (learning feedback)</summary>
                    <p className="muted">
                      Links a learning topic or DSA item for later study. It
                      does not change mastery or record an attempt.
                    </p>
                    <PrepForm roundId={r.id} kind="GAP" links={links} />
                  </details>
                  {/* Stays mounted after completion so the save confirmation remains visible. */}
                  <details className="mt-3" open={awaitingResult}>
                    <summary>
                      {r.status === 'COMPLETED'
                        ? 'Edit reflection'
                        : 'Log result / reflection'}
                    </summary>
                    <ResultForm round={r} stage={app.stage} />
                  </details>
                  {r.status !== 'COMPLETED' && (
                    <details className="mt-3">
                      <summary>Reschedule</summary>
                      <RescheduleForm round={r} />
                    </details>
                  )}
                  <details className="mt-3">
                    <summary>Edit interview details</summary>
                    <RoundDetailsForm round={r} />
                  </details>
                </article>
              );
            })}
            {isOpen(app.stage) && (
              <details className="mt-4">
                <summary>Add interview round</summary>
                <RoundForm applicationId={app.id} zone={zone} />
              </details>
            )}
          </section>

          <section className="card" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading">Timeline</h2>
            <p className="muted">Append-only; newest first.</p>
            <ol className="plain-list">
              {app.activities.map((a) => (
                <li className="dsa-item" key={a.id}>
                  <strong>{dayKey(a.occurredAt, zone)}</strong> — {describe(a)}
                  {a.note &&
                    !['INTERVIEW_RESULT', 'INTERVIEW_SCHEDULED'].includes(
                      a.type,
                    ) && <p className="muted learning-notes">{a.note}</p>}
                </li>
              ))}
            </ol>
            {!hasCreated && (
              <p className="muted">
                Added before stage history existed; earlier events were not
                recorded.
              </p>
            )}
            <details className="mt-3">
              <summary>Add timeline note</summary>
              <NoteForm id={app.id} />
            </details>
          </section>
        </section>
        <aside>
          <section className="card">
            <h2>Stage</h2>
            <p>
              <span className="pill">{label(app.stage)}</span>
            </p>
            <StageForm app={app} />
          </section>
          <section className="card">
            <h2>Contacts</h2>
            <p>Recruiter: {app.recruiterName ?? 'Not added'}</p>
            {app.recruiterContact && (
              <p className="muted">{app.recruiterContact}</p>
            )}
            <p>Hiring contact: {app.hiringContact ?? 'Not added'}</p>
          </section>
          <section className="card">
            <h2>Notes</h2>
            <p className="learning-notes">{app.notes ?? 'No notes yet.'}</p>
            {app.compensationNotes && (
              <>
                <h3 className="mt-4">Offer / compensation</h3>
                <p className="learning-notes">{app.compensationNotes}</p>
              </>
            )}
            {app.jobDescription && (
              <details className="mt-4">
                <summary>Job description snapshot</summary>
                <p className="learning-notes">{app.jobDescription}</p>
              </details>
            )}
            {app.resources.map((r) => (
              <p key={r.id}>
                <ResourceLink url={r.url}>{r.title}</ResourceLink>
              </p>
            ))}
          </section>
          <section className="card">
            <details>
              <summary>Edit application details</summary>
              <DetailsForm app={app} />
            </details>
          </section>
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
