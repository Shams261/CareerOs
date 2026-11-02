import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { ChevronRight, X } from 'lucide-react';
import { ConfirmDelete } from '@/components/confirm-delete';
import {
  deletePrepItemAction,
  deleteRoundAction,
} from '@/features/deletes/actions';
import { dayKey, weekdayDate } from '@/lib/time';
import { ResourceLink } from '@/components/resource-link';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { aiPolicyLabel, typeText } from '@/features/jobs/formats';
import { interviewTime, label, roundEnd } from '@/features/jobs/domain';
import {
  PrepForm,
  RescheduleForm,
  ResultForm,
  RoundDetailsForm,
  RoundForm,
  ScheduleInterviewForm,
} from '@/features/jobs/forms';
import { MoreMenu } from '@/components/more-menu';
import { PrepCheck } from '@/features/jobs/prep-check';
import { ActionForm } from '@/components/action-form';
import { AGENT_NAME } from '@/features/agent/constants';
import { DebriefPanel } from '@/features/prep/debrief';
import { PrepTools } from './prep-tools';
import { PrepLink } from './prep-link';
import type { ApplicationView } from '../page-data';

/** The interviews, each with its prep, debrief, result and panel. */
export function Interviews({ v }: { v: ApplicationView }) {
  const { app, now, zone, open, primary, resultRound, links, prepRound } = v;
  return (
    <section className="card" aria-labelledby="interviews-heading">
      <div className="section-head">
        <h2 id="interviews-heading">Interviews</h2>
        {open && (
          <PanelButton panel="add-round" className="link-button">
            Add interview
          </PanelButton>
        )}
      </div>
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
              <small>{formatInTimeZone(r.scheduledStart, zone, 'MMM')}</small>
            </div>
            <div className="round-main">
              <h3>
                {r.title}
                <span className={`pill${awaitingResult ? ' warning' : ''}`}>
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
                      {weekdayDate(dayKey(r.scheduleBlock.plannedStart, zone))}
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
                  <ResourceLink url={r.meetingUrl}>Meeting link</ResourceLink>
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
              {/* WI-108: three questions after a completed interview. */}
              {r.status === 'COMPLETED' && (
                <>
                  <PanelButton
                    panel={`debrief-${r.id}`}
                    className="button secondary small mt-2"
                  >
                    Debrief with {AGENT_NAME}
                  </PanelButton>
                  <SidePanel
                    id={`debrief-${r.id}`}
                    title={`Debrief · ${r.title}`}
                  >
                    <DebriefPanel
                      roundId={r.id}
                      initial={{
                        topicsAsked: r.topicsAsked ?? '',
                        wentWell: r.wentWell ?? '',
                        toImprove: r.toImprove ?? '',
                      }}
                    />
                  </SidePanel>
                </>
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
                              <input type="hidden" name="id" value={p.id} />
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
                              <input type="hidden" name="id" value={p.id} />
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
              <FeedbackOutlet channel={`round-${r.id}`} />
              <div className="round-actions">
                {prepRound?.id === r.id && <PrepTools v={v} />}
                {r.status === 'SCHEDULED' && !awaitingResult && (
                  <PanelButton
                    panel={panelId}
                    focus="prep"
                    className="button secondary small"
                  >
                    Add prep
                  </PanelButton>
                )}
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
                    {r.status === 'COMPLETED' ? 'Reflection' : 'Log the result'}
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
        <SidePanel id="add-round" title="Add interview" variant="modal">
          <RoundForm applicationId={app.id} zone={zone} />
        </SidePanel>
      )}
    </section>
  );
}
