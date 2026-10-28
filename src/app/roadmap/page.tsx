import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteGoalAction } from '@/features/deletes/actions';
import Link from 'next/link';
import { forTodayPicks } from '@/features/for-today/service';
import { ForTodayCard } from '@/features/for-today/card';
import { ArrowRight, ChevronRight, Route } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { UtilityMenu } from '@/features/today/utility-menu';
import { RoadmapIllustration } from '@/components/illustrations';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { GoalForm, RoadmapForm } from '@/features/roadmap/forms';
import {
  goalsOverview,
  revisionDue,
  roadmapList,
  weekPlan,
} from '@/features/roadmap/service';
import { planQuestion } from '@/features/roadmap/week';
import { AskRumiButton } from '@/features/agent/ask-button';
import { AGENT_NAME } from '@/features/agent/domain';
import { aiConfig } from '@/lib/env';
import { shortDate } from '@/lib/time';
import { continueTarget, goalLine } from '@/features/roadmap/domain';
import { roadmapRevisionRows } from '@/features/attention/domain';
import { formatDuration } from '@/features/schedule/row';
import { AttentionPages } from '@/features/today/attention-rows';
export const metadata = { title: 'Roadmap' };

const statusText = {
  ACTIVE: '',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
} as const;

export default async function RoadmapPage() {
  const user = await owner(),
    now = new Date(),
    today = dayKey(now, user.timezone);
  const [goals, roadmaps, due, week, picks] = await Promise.all([
    goalsOverview(user, now),
    roadmapList(user, now),
    revisionDue(user, now),
    weekPlan(user, now),
    forTodayPicks(user, now),
  ]);
  const active = goals.filter((g) => g.status === 'ACTIVE'),
    rest = goals.filter((g) => g.status !== 'ACTIVE'),
    live = roadmaps.filter((r) => !r.archivedAt),
    archived = roadmaps.filter((r) => r.archivedAt),
    next = continueTarget(roadmaps),
    // The revision panel leaves out what For today already offers (WI-060).
    dueRows = roadmapRevisionRows(due, now, user.timezone).filter(
      (r) => !picks.some((p) => p.key === `revise:item:${r.id.split(':')[1]}`),
    );
  return (
    <>
      <PageShortcuts
        shortcuts={[{ key: 'n', label: 'New roadmap', press: 'new-roadmap' }]}
      />
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Roadmap</h1>
          </div>
          <div className="today-head-actions">
            {/* Always there: with no goal yet, this is where one is set (WI-064). */}
            <UtilityMenu>
              <PanelButton panel="goals" className="link-button today-util">
                {!goals.length
                  ? 'Set a goal'
                  : active.length === 1
                    ? 'Edit goal'
                    : 'Goals'}
              </PanelButton>
            </UtilityMenu>
            {/* For today leads with the page's primary; Continue stays when it has no picks. */}
            {next && !picks.length && (
              <Link className="button" href={next.href} prefetch={false}>
                Continue · {next.title}{' '}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
        {active.length > 0 && (
          <p className="today-summary">
            {active.map((g) => (
              <span key={g.id}>{goalLine(g, today, formatDuration)}</span>
            ))}
          </p>
        )}
      </header>
      {/* Goals are set on Today and in Goals; the curriculum needs none (WI-064). */}
      {/* One "next" list (WI-063): For today leads; This week and the revision queue open in
          panels from one line, and roadmap rows show their counts without a second "Next". */}
      <div className="roadmap-single">
        <section className="jobs-main" aria-labelledby="roadmaps-heading">
          <ForTodayCard picks={picks} />
          {(live.length > 0 || dueRows.length > 0) && (
            <p className="more-line">
              {live.length > 0 && (
                <PanelButton panel="week" className="link-button">
                  This week
                </PanelButton>
              )}
              {dueRows.length > 0 && (
                <PanelButton panel="revision" className="link-button">
                  {dueRows.length} due for revision{' '}
                  <ArrowRight size={14} aria-hidden="true" />
                </PanelButton>
              )}
            </p>
          )}
          <div className="agenda-head">
            <h2 id="roadmaps-heading" className="agenda-heading">
              Roadmaps
            </h2>
            <Disclosure
              label="New roadmap"
              variant={live.length ? 'link' : 'primary'}
              shortcut="new-roadmap"
              draft="roadmap:new"
              className="agenda-add"
            >
              <RoadmapForm goals={goals} />
            </Disclosure>
          </div>
          <FeedbackOutlet channel="roadmaps" className="mb-2" />
          {!live.length && (
            <div className="empty-state">
              <RoadmapIllustration className="setup-illustration" />
              <h3>Your first roadmap</h3>
              <p className="empty">
                A roadmap is the list of topics and questions you want to be
                ready for, in sections, with what you have covered and what came
                up in interviews. Import your study material, or start one with
                New roadmap.
              </p>
            </div>
          )}
          <ul className="plain-list attention-list">
            {live.map((r) => {
              const left = r.progress.total - r.progress.done;
              return (
                <li className="attention-row" data-source="roadmap" key={r.id}>
                  <Link
                    className="attention-link"
                    href={
                      r.next
                        ? `/roadmap/${r.id}?section=${encodeURIComponent(r.next.section)}#item-${r.next.id}`
                        : `/roadmap/${r.id}`
                    }
                    prefetch={false}
                  >
                    <span className="attention-icon" aria-hidden="true">
                      <Route size={22} />
                    </span>
                    {/* The roadmap's name and counts; the row opens at what comes next. */}
                    <span className="attention-main">
                      <span className="attention-title">{r.title}</span>
                      {!r.next && (
                        <span className="attention-context">
                          {r.progress.total
                            ? 'Everything done'
                            : r.goal
                              ? `No items yet · Toward ${r.goal.title}`
                              : 'No items yet'}
                        </span>
                      )}
                    </span>
                    <span className="roadmap-counts">
                      {r.progress.total > 0 && (
                        <span>
                          {r.progress.done} done · {left} left
                        </span>
                      )}
                      {r.due > 0 && <span className="is-due">{r.due} due</span>}
                    </span>
                    <ChevronRight
                      size={18}
                      aria-hidden="true"
                      className="attention-chevron"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          {archived.length > 0 && (
            <Disclosure
              variant="link"
              label={`Archived · ${archived.length}`}
              className="mt-4"
            >
              {archived.map((r) => (
                <p key={r.id}>
                  <Link
                    prefetch={false}
                    className="link"
                    href={`/roadmap/${r.id}`}
                  >
                    {r.title}
                  </Link>
                </p>
              ))}
            </Disclosure>
          )}
        </section>
        <SidePanel id="week" title="This week">
          {live.length > 0 && (
            <div className="week-mix">
              <div className="section-head">
                {aiConfig() && (
                  <AskRumiButton
                    text={planQuestion(week.rows)}
                    className="button secondary small"
                  >
                    Plan with {AGENT_NAME}
                  </AskRumiButton>
                )}
              </div>
              {/* The goal already reads in the header; here only the P0 count (WI-058). */}
              <p className="muted week-ready">
                {active.length
                  ? `P0 first · ${week.p0Left} not done`
                  : week.ready}
              </p>
              <ul className="plain-list format-list">
                {week.rows.map((r) => (
                  <li className="format-row" key={r.format}>
                    <div className="format-main">
                      <strong>
                        {r.label}{' '}
                        <span
                          className={`week-count${r.done >= r.target ? ' is-met' : ''}`}
                        >
                          {r.done >= r.target
                            ? `${r.done} done`
                            : `${r.done} of ${r.target}`}
                        </span>
                      </strong>
                      {r.interview && (
                        <small>
                          {r.interview.company} · {shortDate(r.interview.on)}
                        </small>
                      )}
                    </div>
                    <div className="format-links">
                      {r.next ? (
                        <Link
                          className="link"
                          href={
                            r.next.dsaProblemId
                              ? `/dsa/${r.next.dsaProblemId}?from=${r.next.id}`
                              : `/roadmap/${r.next.roadmapId}?section=${encodeURIComponent(r.next.section)}#item-${r.next.id}`
                          }
                          prefetch={false}
                        >
                          Next: {r.next.title}
                        </Link>
                      ) : (
                        <span className="muted">
                          No roadmap material for this yet
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SidePanel>
        <SidePanel id="revision" title={`Due for revision · ${dueRows.length}`}>
          {dueRows.length ? (
            <AttentionPages items={dueRows} />
          ) : (
            <p className="attention-empty">Nothing due for revision.</p>
          )}
        </SidePanel>
      </div>
      <SidePanel id="goals" title="Goals">
        {active.map((g) => (
          <div className="panel-section" key={g.id}>
            <h3 data-panel-focus={`goal-${g.id}`} tabIndex={-1}>
              {g.title}
            </h3>
            <GoalForm goal={g} />
            <div className="panel-danger">
              <ConfirmDelete
                action={deleteGoalAction}
                id={g.id}
                label="Delete goal"
                question={`Delete the goal ${g.title}? Its roadmaps, routines and blocks stay, no longer linked to it.`}
              />
            </div>
          </div>
        ))}
        <div className="panel-section">
          <Disclosure
            variant="link"
            label="Add goal"
            draft="goal:new"
            defaultOpen={!active.length}
          >
            <GoalForm compact />
          </Disclosure>
        </div>
        {rest.length > 0 && (
          <div className="panel-section">
            <h3>Other goals</h3>
            {rest.map((g) => (
              <div className="goal-row" key={g.id}>
                <div>
                  <strong>{g.title}</strong>
                  <p className="muted">
                    {statusText[g.status]} · {g.category}
                  </p>
                </div>
                <Disclosure
                  variant="link"
                  label="Edit"
                  srLabel={`Edit goal ${g.title}`}
                >
                  <GoalForm goal={g} />
                  <ConfirmDelete
                    action={deleteGoalAction}
                    id={g.id}
                    label="Delete goal"
                    question={`Delete the goal ${g.title}?`}
                  />
                </Disclosure>
              </div>
            ))}
          </div>
        )}
      </SidePanel>
    </>
  );
}
