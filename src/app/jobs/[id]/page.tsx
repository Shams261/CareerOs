import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { ConfirmDelete } from '@/components/confirm-delete';
import {
  deleteApplicationAction,
  deletePrepItemAction,
  deleteRoundAction,
} from '@/features/deletes/actions';
import { db, owner } from '@/server/db';
import { dayKey, shortDate, weekdayDate } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { Disclosure } from '@/components/disclosure';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { applicationDetail, loopPractice } from '@/features/jobs/service';
import { aiPolicyLabel, typeLabel, typeText } from '@/features/jobs/formats';
import {
  calendarDate,
  followUpState,
  interviewTime,
  isOpen,
  label,
  ownerLabel,
  pagePrimary,
  pipelineStages,
  resultNeeded,
  roundEnd,
  closedStages,
} from '@/features/jobs/domain';
import { dueContext } from '@/features/attention/domain';
import {
  DetailsForm,
  FollowUpDoneForm,
  FormatsForm,
  FollowUpForm,
  NoteForm,
  PrepForm,
  RescheduleForm,
  ResultForm,
  RoundDetailsForm,
  RoundForm,
  ScheduleInterviewForm,
  ZoneOptions,
  type LinkOption,
} from '@/features/jobs/forms';
import { NextActionBox } from '@/features/jobs/next-action';
import { MoreMenu } from '@/components/more-menu';
import { PrepCheck } from '@/features/jobs/prep-check';
import { randomUUID } from 'node:crypto';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { stageAction } from '@/features/jobs/actions';
import { aiConfig } from '@/lib/env';
import { isTestNamed } from '@/lib/test-data';
import { AGENT_NAME } from '@/features/agent/domain';
import { prepDocs } from '@/features/prep/service';
import { estimateMicros, searchQueries } from '@/features/prep/domain';
import { PreparePanel } from '@/features/prep/panel';
export const metadata = { title: 'Jobs' };

export default async function Application({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await owner(),
    { id } = await params;
  const ai = !!aiConfig();
  // The lists and counts beside the application need only its id: they load alongside it
  // instead of after it (WI-061).
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
  if (!app) notFound();
  const now = new Date(),
    zone = user.timezone,
    today = dayKey(now, zone),
    follow = followUpState(app, today),
    open = isOpen(app.stage),
    primary = pagePrimary(app, now, zone),
    // The earliest interview whose result is still due carries the page's primary action.
    resultRound = resultNeeded(app.rounds, now).sort(
      (a, b) => +a.scheduledStart - +b.scheduledStart,
    )[0],
    at = (d: Date) => formatInTimeZone(d, zone, 'MMM d, HH:mm');
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
  const showPrep = !!ai && open && !isTestNamed(app.company, app.role);
  const prepRound = showPrep ? upcoming[0] : undefined;
  const prepTools = (
    <>
      {docs.length > 0 && (
        <ul className="plain-list prep-docs">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                className="link"
                href={`/jobs/${app.id}/prep/${d.id}`}
                prefetch={false}
              >
                Prep doc · {shortDate(dayKey(d.createdAt, zone))}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PanelButton panel="prep-rumi" className="button secondary small">
        {docs.length ? 'Prepare again' : `Prepare with ${AGENT_NAME}`}
      </PanelButton>
      <SidePanel id="prep-rumi" title={`Prepare with ${AGENT_NAME}`}>
        <PreparePanel
          applicationId={app.id}
          company={app.company}
          preview={{
            queries: prepQueries,
            rounds: prepRounds.length,
            roadmapItems: Math.min(studyItems, 60),
            problems: Math.min(problemCount, 40),
            hasJobDescription: !!app.jobDescription?.trim(),
            estimateMicros: estimateMicros(prepQueries.length),
          }}
        />
      </SidePanel>
    </>
  );
  const describe = (a: (typeof app.activities)[number]) => {
    switch (a.type) {
      case 'CREATED':
        return `Added as ${label(a.toStage ?? 'SAVED')}`;
      case 'STAGE_CHANGED':
        return a.fromStage
          ? `${label(a.fromStage)} to ${label(a.toStage ?? '')}`
          : `Moved to ${label(a.toStage ?? '')}`;
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
  const hasAction = !!(app.nextAction || app.nextActionDate);
  const moveContext = [
    follow.state === 'overdue' || follow.state === 'today'
      ? dueContext(follow.date, today)
      : follow.state === 'upcoming'
        ? `Due ${shortDate(follow.date)}`
        : 'No date set',
    ownerLabel(app.actionOwner),
  ].join(' · ');
  const contacts = [
    ['Recruiter', app.recruiterName, app.recruiterContact],
    ['Hiring contact', app.hiringContact, null],
  ].filter(([, v]) => v) as [string, string, string | null][];
  return (
    <>
      <ZoneOptions />
      <Link className="link" href="/jobs" prefetch={false}>
        <ArrowLeft size={14} aria-hidden="true" /> Jobs
      </Link>
      <p className="company-line">
        {app.company}
        {app.location ? ` · ${app.location}` : ''}
        {app.workArrangement !== 'UNKNOWN'
          ? ` · ${label(app.workArrangement)}`
          : ''}
      </p>
      <h1>{app.role}</h1>
      {/* The stage as one select at every width (WI-063): eleven buttons read as a wall. */}
      <ActionForm action={stageAction} className="stage-select-form mb-4">
        <input type="hidden" name="id" value={app.id} />
        <input type="hidden" name="requestId" value={randomUUID()} />
        <div className="stage-select">
          <label htmlFor="stage-select">Stage</label>
          <select id="stage-select" name="stage" defaultValue={app.stage}>
            {[...pipelineStages, ...closedStages].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" className="small">
          Move
        </Button>
      </ActionForm>
      <p className="status-line summary-line mb-6">
        <span>
          Applied{' '}
          {app.appliedAt ? shortDate(calendarDate(app.appliedAt)) : 'not yet'}
          {app.source ? ` via ${app.source}` : ''}
        </span>
        {app.jobUrl && (
          <ResourceLink url={app.jobUrl}>Job posting</ResourceLink>
        )}
        {!open && <span>Closed · {label(app.stage)}</span>}
      </p>
      <div className="grid-main">
        <section>
          <section className="card" aria-labelledby="next-heading">
            <h2 id="next-heading">Next move</h2>
            <div
              className={`next-move${['overdue', 'today'].includes(follow.state) ? ' is-urgent' : ''}`}
            >
              <div className="next-move-main">
                <span className="attention-label">Next action</span>
                <strong>
                  {hasAction
                    ? (app.nextAction ?? 'Follow up')
                    : open
                      ? 'Nothing set yet'
                      : 'Closed application'}
                </strong>
                {hasAction && <small>{moveContext}</small>}
                {!hasAction && open && (
                  <small>{ownerLabel(app.actionOwner)}</small>
                )}
              </div>
              {open && (
                <div className="next-move-actions">
                  {hasAction && (
                    <NextActionBox
                      id={app.id}
                      requestId={randomUUID()}
                      title={app.nextAction ?? 'Follow up'}
                      primary={primary === 'mark-done'}
                    />
                  )}
                  {hasAction ? (
                    <MoreMenu label="More for the next action">
                      <PanelButton
                        panel="next-action"
                        focus="done"
                        className="more-menu-item"
                      >
                        Done with a note
                      </PanelButton>
                      <PanelButton
                        panel="next-action"
                        focus="edit"
                        className="more-menu-item"
                      >
                        Edit next action
                      </PanelButton>
                    </MoreMenu>
                  ) : (
                    <PanelButton
                      panel="next-action"
                      focus="edit"
                      className={
                        primary === 'set-next-action' ? 'button' : 'link-button'
                      }
                    >
                      Set next action
                    </PanelButton>
                  )}
                </div>
              )}
            </div>
            <FeedbackOutlet channel="next-action" className="mt-3" />
            <SidePanel id="next-action" title="Next action">
              {hasAction && (
                <div className="panel-section">
                  <h3 data-panel-focus="done" tabIndex={-1}>
                    Done with a note
                  </h3>
                  <FollowUpDoneForm app={app} />
                </div>
              )}
              <div className="panel-section">
                <h3 data-panel-focus="edit" tabIndex={-1}>
                  {hasAction ? 'Edit next action' : 'Set next action'}
                </h3>
                <FollowUpForm app={app} />
              </div>
            </SidePanel>
          </section>

          {open && (
            <section className="card flat" aria-labelledby="formats-heading">
              <div className="section-head">
                <h2 id="formats-heading">Interview formats</h2>
                <PanelButton panel="formats" className="link-button">
                  {app.formats.length ? 'Edit formats' : 'Set formats'}
                </PanelButton>
              </div>
              {!loop.length && (
                <p className="empty">
                  No formats yet. Tick the rounds this company uses, or add an
                  interview with its type.
                </p>
              )}
              {loop.length > 0 && (
                <ul className="plain-list format-list">
                  {loop.map((f) => {
                    const href = (i: NonNullable<typeof f.next>) =>
                      i.dsaProblemId
                        ? `/dsa/${i.dsaProblemId}?from=${i.id}`
                        : `/roadmap/${i.roadmapId}?section=${encodeURIComponent(i.section)}#item-${i.id}`;
                    return (
                      <li className="format-row" key={f.format}>
                        <div className="format-main">
                          <strong>{typeLabel[f.format]}</strong>
                          <small>
                            {[
                              f.nextRound
                                ? `Round ${shortDate(dayKey(f.nextRound, zone))}`
                                : null,
                              f.aiPolicy ? aiPolicyLabel[f.aiPolicy] : null,
                              f.total ? `${f.done} of ${f.total} done` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'From this company’s loop'}
                          </small>
                        </div>
                        <div className="format-links">
                          {f.guide && (
                            <Link
                              className="link"
                              href={href(f.guide)}
                              prefetch={false}
                            >
                              What it tests
                            </Link>
                          )}
                          {f.next && (
                            <Link
                              className="link"
                              href={href(f.next)}
                              prefetch={false}
                            >
                              Next: {f.next.title}
                            </Link>
                          )}
                          {!f.guide && !f.next && (
                            <span className="muted">
                              No roadmap material for this yet
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <SidePanel id="formats" title="Interview formats">
                <FormatsForm id={app.id} formats={app.formats} />
              </SidePanel>
            </section>
          )}

          <section className="card" aria-labelledby="interviews-heading">
            <h2 id="interviews-heading">Interviews</h2>
            <FeedbackOutlet channel="rounds" className="mb-3" />
            {!app.rounds.length && <p className="empty">No interviews yet.</p>}
            {app.rounds.map((r) => {
              const prep = r.prepItems.filter((p) => p.kind === 'PREP'),
                gaps = r.prepItems.filter((p) => p.kind === 'GAP'),
                awaitingResult = r.status === 'SCHEDULED' && roundEnd(r) <= now,
                panelId = `round:${r.id}`,
                blockState = !r.scheduleBlock
                  ? null
                  : ['CANCELLED', 'SKIPPED'].includes(r.scheduleBlock.status)
                    ? 'cancelled'
                    : 'on';
              return (
                <article className="round-row" id={`round-${r.id}`} key={r.id}>
                  <div className="round-date" aria-hidden="true">
                    <b>{formatInTimeZone(r.scheduledStart, zone, 'd')}</b>
                    <small>
                      {formatInTimeZone(r.scheduledStart, zone, 'MMM')}
                    </small>
                  </div>
                  <div className="round-main">
                    <h3>
                      {r.title}
                      <span
                        className={`pill${awaitingResult ? ' warning' : ''}`}
                      >
                        {awaitingResult ? 'Result needed' : label(r.status)}
                      </span>
                    </h3>
                    <p className="round-context">
                      {typeText(r.type)}
                      {r.aiPolicy !== 'UNKNOWN'
                        ? ` · ${aiPolicyLabel[r.aiPolicy]}`
                        : ''}{' '}
                      · {interviewTime(r, zone)}
                      {r.interviewers ? ` · With ${r.interviewers}` : ''}
                      {r.location ? ` · ${r.location}` : ''}
                      {blockState === 'on' && r.scheduleBlock && (
                        <>
                          {' · '}
                          <Link
                            className="link"
                            href={`/today?date=${dayKey(r.scheduleBlock.plannedStart, zone)}#block-${r.scheduleBlock.id}`}
                            prefetch={false}
                          >
                            On your schedule{' '}
                            {weekdayDate(
                              dayKey(r.scheduleBlock.plannedStart, zone),
                            )}
                          </Link>
                        </>
                      )}
                      {blockState === 'cancelled' && ' · Schedule cancelled'}
                      {!blockState &&
                        r.status === 'SCHEDULED' &&
                        ' · Not on your schedule'}
                    </p>
                    {r.meetingUrl && (
                      <p className="round-context">
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
                    {(prep.length > 0 || gaps.length > 0) && (
                      <div className="round-lists">
                        {prep.length > 0 && (
                          <>
                            <h4>Preparation</h4>
                            <ul className="plain-list">
                              {prep.map((p) => (
                                <li
                                  className={`prep-item${p.completed ? ' is-done' : ''}`}
                                  key={p.id}
                                >
                                  <PrepCheck
                                    id={p.id}
                                    completed={p.completed}
                                    title={p.title}
                                  >
                                    {p.title}
                                  </PrepCheck>
                                  <PrepLink item={p} />
                                  <ActionForm
                                    action={deletePrepItemAction}
                                    broadcast={`round-${r.id}`}
                                    label={`Delete ${p.title}`}
                                    className="inline-delete"
                                  >
                                    <input
                                      type="hidden"
                                      name="id"
                                      value={p.id}
                                    />
                                    <button
                                      className="icon-button"
                                      aria-label={`Delete ${p.title}`}
                                    >
                                      <X size={14} aria-hidden="true" />
                                    </button>
                                  </ActionForm>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {gaps.length > 0 && (
                          <>
                            <h4>Weak areas to study</h4>
                            <ul className="plain-list">
                              {gaps.map((p) => (
                                <li
                                  className={`prep-item${p.completed ? ' is-done' : ''}`}
                                  key={p.id}
                                >
                                  <PrepCheck
                                    id={p.id}
                                    completed={p.completed}
                                    title={p.title}
                                  >
                                    {p.title}
                                  </PrepCheck>
                                  <PrepLink item={p} />
                                  <ActionForm
                                    action={deletePrepItemAction}
                                    broadcast={`round-${r.id}`}
                                    label={`Delete ${p.title}`}
                                    className="inline-delete"
                                  >
                                    <input
                                      type="hidden"
                                      name="id"
                                      value={p.id}
                                    />
                                    <button
                                      className="icon-button"
                                      aria-label={`Delete ${p.title}`}
                                    >
                                      <X size={14} aria-hidden="true" />
                                    </button>
                                  </ActionForm>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                    {prepRound?.id === r.id && (
                      <div className="round-prep">
                        <h4>Prepare with {AGENT_NAME}</h4>
                        {prepTools}
                      </div>
                    )}
                    <FeedbackOutlet channel={`round-${r.id}`} />
                    <div className="round-actions">
                      {awaitingResult && (
                        <PanelButton
                          panel={panelId}
                          focus="result"
                          className={
                            primary === 'log-result' && resultRound?.id === r.id
                              ? 'button'
                              : 'button secondary small'
                          }
                        >
                          Log the result
                        </PanelButton>
                      )}
                    </div>
                  </div>
                  <div className="round-side">
                    {/* Prep, reschedule and the schedule block in one menu (WI-063). */}
                    {r.status !== 'CANCELLED' && (
                      <MoreMenu label={`More for ${r.title}`}>
                        {r.status === 'SCHEDULED' && !awaitingResult && (
                          <PanelButton
                            panel={panelId}
                            focus="prep"
                            className="more-menu-item"
                          >
                            Add prep
                          </PanelButton>
                        )}
                        {r.status === 'COMPLETED' && (
                          <PanelButton
                            panel={panelId}
                            focus="result"
                            className="button secondary small"
                          >
                            {r.outcomeNotes || r.toImprove
                              ? 'Edit reflection'
                              : 'Add reflection'}
                          </PanelButton>
                        )}
                        {r.status !== 'COMPLETED' && (
                          <PanelButton
                            panel={panelId}
                            focus="reschedule"
                            className="more-menu-item"
                          >
                            Reschedule
                          </PanelButton>
                        )}
                        {r.status === 'SCHEDULED' && blockState !== 'on' && (
                          <ScheduleInterviewForm
                            roundId={r.id}
                            name={r.title}
                            label={
                              blockState === 'cancelled'
                                ? 'Add back to schedule'
                                : 'Add to schedule'
                            }
                          />
                        )}
                        <PanelButton
                          panel={panelId}
                          focus="edit"
                          className="more-menu-item"
                        >
                          Edit details
                        </PanelButton>
                      </MoreMenu>
                    )}
                    <PanelButton
                      panel={panelId}
                      className="agenda-details"
                      aria-label={`Details: ${r.title}`}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </PanelButton>
                  </div>
                  <SidePanel id={panelId} title={r.title}>
                    <p className="muted">
                      {typeText(r.type)} · {interviewTime(r, zone)}
                    </p>
                    {r.status !== 'CANCELLED' && (
                      <div className="panel-section">
                        <h3 data-panel-focus="result" tabIndex={-1}>
                          {r.status === 'COMPLETED'
                            ? 'Reflection'
                            : 'Log the result'}
                        </h3>
                        <ResultForm round={r} stage={app.stage} />
                      </div>
                    )}
                    <div className="panel-section">
                      <h3 data-panel-focus="prep" tabIndex={-1}>
                        Add prep item
                      </h3>
                      <PrepForm roundId={r.id} kind="PREP" links={links} />
                    </div>
                    <div className="panel-section">
                      <h3 data-panel-focus="gap" tabIndex={-1}>
                        Add weak area
                      </h3>
                      <PrepForm roundId={r.id} kind="GAP" links={links} />
                    </div>
                    {r.status !== 'COMPLETED' && (
                      <div className="panel-section">
                        <h3 data-panel-focus="reschedule" tabIndex={-1}>
                          Reschedule
                        </h3>
                        <RescheduleForm round={r} />
                      </div>
                    )}
                    <div className="panel-section">
                      <h3 data-panel-focus="edit" tabIndex={-1}>
                        Edit details
                      </h3>
                      <RoundDetailsForm round={r} />
                    </div>
                    <div className="panel-danger">
                      <ConfirmDelete
                        action={deleteRoundAction}
                        id={r.id}
                        label="Delete interview"
                        question={`Delete the ${r.title} interview and its prep? This cannot be undone.`}
                        broadcast="rounds"
                      />
                    </div>
                  </SidePanel>
                </article>
              );
            })}
            {open && (
              <Disclosure
                label="Add interview"
                className="mt-4"
                draft={`round:${app.id}`}
              >
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
              <p className="status-line">
                <span>Earlier events were not recorded.</span>
              </p>
            )}
            <Disclosure
              variant="link"
              label="Add a note"
              className="mt-3"
              draft={`job-note:${app.id}`}
            >
              <NoteForm id={app.id} />
            </Disclosure>
          </section>
        </section>
        <aside>
          {showPrep && !prepRound && (
            <section className="card flat" aria-labelledby="prep-heading">
              <h2 id="prep-heading">Prepare with {AGENT_NAME}</h2>
              {prepTools}
            </section>
          )}
          <section className="card flat">
            <h2>Contacts</h2>
            {contacts.length ? (
              <dl className="contacts-list">
                {contacts.map(([k, v, extra]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      {v}
                      {extra && <span className="muted"> · {extra}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <PanelButton
                panel="details"
                focus="contacts"
                className="link-button"
              >
                Add contacts
              </PanelButton>
            )}
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
          <PanelButton panel="details" className="button secondary">
            Edit application
          </PanelButton>
          <SidePanel id="details" title="Edit application">
            <DetailsForm app={app} />
            <div className="panel-danger">
              <ConfirmDelete
                action={deleteApplicationAction}
                id={app.id}
                label="Delete application"
                question={`Delete ${app.company}${app.rounds.length ? `, its ${app.rounds.length} interview${app.rounds.length === 1 ? '' : 's'}` : ''} and its history? This cannot be undone.`}
              />
            </div>
          </SidePanel>
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
        <Link
          prefetch={false}
          className="link"
          href={`/learn/topics/${item.learningTopic.id}`}
        >
          {item.learningTopic.subject.name} — {item.learningTopic.title}
        </Link>
      </>
    );
  if (item.dsaProblem)
    return (
      <>
        {' · '}
        <Link
          prefetch={false}
          className="link"
          href={`/dsa/${item.dsaProblem.id}`}
        >
          DSA: {item.dsaProblem.title}
        </Link>
      </>
    );
  if (item.dsaTopic)
    return <span className="muted"> · DSA topic: {item.dsaTopic.name}</span>;
  return null;
}
