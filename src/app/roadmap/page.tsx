import Link from 'next/link';
import { ArrowRight, ChevronRight, Route } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { UtilityMenu } from '@/features/today/utility-menu';
import { BrandMark } from '@/components/brand';
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
import { AttentionPages, AttentionRow } from '@/features/today/attention-rows';
export const metadata = { title: 'Roadmap' };

const PREVIEW = 5;
const PHONE_PREVIEW = 2;
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
  const [goals, roadmaps, due, week] = await Promise.all([
    goalsOverview(user, now),
    roadmapList(user, now),
    revisionDue(user, now),
    weekPlan(user, now),
  ]);
  const active = goals.filter((g) => g.status === 'ACTIVE'),
    rest = goals.filter((g) => g.status !== 'ACTIVE'),
    live = roadmaps.filter((r) => !r.archivedAt),
    archived = roadmaps.filter((r) => r.archivedAt),
    next = continueTarget(roadmaps),
    dueRows = roadmapRevisionRows(due, now, user.timezone),
    preview = dueRows.slice(0, PREVIEW);
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
            {goals.length > 0 && (
              <UtilityMenu>
                <PanelButton panel="goals" className="link-button today-util">
                  {active.length === 1 ? 'Edit goal' : 'Goals'}
                </PanelButton>
              </UtilityMenu>
            )}
            {next && (
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
      {!goals.length && (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <BrandMark className="setup-mark" />
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">What are you aiming for?</h2>
          <p>
            One goal with a date. Routines, subjects, priorities and roadmaps
            attach to it, and Today shows how the week is going toward it.
          </p>
          <GoalForm compact />
        </section>
      )}
      <div className="today-workspace is-today roadmap-workspace">
        <section className="jobs-main" aria-labelledby="roadmaps-heading">
          {live.length > 0 && (
            <section
              className="card flat week-mix"
              aria-labelledby="week-heading"
            >
              <div className="section-head">
                <h2 id="week-heading">This week</h2>
                {aiConfig() && (
                  <AskRumiButton
                    text={planQuestion(week.rows)}
                    className="button secondary small"
                  >
                    Plan with {AGENT_NAME}
                  </AskRumiButton>
                )}
              </div>
              <p className="muted week-ready">{week.ready}</p>
              <ul className="plain-list format-list">
                {week.rows.map((r) => (
                  <li className="format-row" key={r.format}>
                    <div className="format-main">
                      <strong>
                        {r.label}{' '}
                        <span
                          className={`week-count${r.done >= r.target ? ' is-met' : ''}`}
                        >
                          {r.done} of {r.target}
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
            </section>
          )}
          <div className="agenda-head">
            <h2 id="roadmaps-heading" className="agenda-heading">
              Roadmaps
            </h2>
            <Disclosure
              label="New roadmap"
              variant={live.length ? 'link' : 'primary'}
              shortcut="new-roadmap"
              defaultOpen={!live.length && goals.length > 0}
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
                    aria-label={`${r.title}: ${r.next ? `continue with ${r.next.title}` : 'open'}`}
                  >
                    <span className="attention-icon" aria-hidden="true">
                      <Route size={22} />
                    </span>
                    {/* Name first (WI-049): the roadmap, then what comes next in it. */}
                    <span className="attention-main">
                      <span className="attention-title">{r.title}</span>
                      <span className="attention-context">
                        {r.next
                          ? `Next: ${r.next.title} · ${r.next.section}`
                          : r.progress.total
                            ? 'Everything done'
                            : r.goal
                              ? `No items yet · Toward ${r.goal.title}`
                              : 'No items yet'}
                      </span>
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
                  <Link className="link" href={`/roadmap/${r.id}`}>
                    {r.title}
                  </Link>
                </p>
              ))}
            </Disclosure>
          )}
        </section>
        <aside className="today-rail">
          <div className="attention-head">
            <h2 id="revision-heading">Due for revision</h2>
            {dueRows.length > PREVIEW && (
              <span className="muted attention-count is-wide">
                Showing {PREVIEW} of {dueRows.length}
              </span>
            )}
            {dueRows.length > PHONE_PREVIEW && (
              <span className="muted attention-count is-phone">
                Showing {Math.min(PHONE_PREVIEW, dueRows.length)} of{' '}
                {dueRows.length}
              </span>
            )}
          </div>
          {!dueRows.length && (
            <p className="attention-empty">Nothing due for revision.</p>
          )}
          {preview.length > 0 && (
            <ul className="plain-list attention-list attention-preview">
              {preview.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          )}
          {dueRows.length > 0 && (
            <p className="attention-more">
              <PanelButton panel="revision" className="link-button">
                View all {dueRows.length}{' '}
                <ArrowRight size={14} aria-hidden="true" />
              </PanelButton>
            </p>
          )}
          <SidePanel
            id="revision"
            title={`Due for revision · ${dueRows.length}`}
          >
            <AttentionPages items={dueRows} />
          </SidePanel>
        </aside>
      </div>
      <SidePanel id="goals" title="Goals">
        {active.map((g) => (
          <div className="panel-section" key={g.id}>
            <h3 data-panel-focus={`goal-${g.id}`} tabIndex={-1}>
              {g.title}
            </h3>
            <GoalForm goal={g} />
          </div>
        ))}
        <div className="panel-section">
          <Disclosure variant="link" label="Add goal" draft="goal:new">
            <GoalForm />
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
                </Disclosure>
              </div>
            ))}
          </div>
        )}
      </SidePanel>
    </>
  );
}
