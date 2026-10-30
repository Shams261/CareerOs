import { ConfirmDelete } from '@/components/confirm-delete';
import { deleteGoalAction } from '@/features/deletes/actions';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey, longDate, shortDate } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { UtilityMenu } from '@/features/today/utility-menu';
import { RoadmapIllustration } from '@/components/illustrations';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { BulkItemsForm, GoalForm, RoadmapForm } from '@/features/roadmap/forms';
import { RoadmapBands } from '@/features/roadmap/bands';
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
import {
  continueTarget,
  revisionQueue,
  targetLabel,
} from '@/features/roadmap/domain';
import { roadmapRevisionRows } from '@/features/attention/domain';
import { AttentionPages } from '@/features/today/attention-rows';
export const metadata = { title: 'Roadmap' };

const statusText = {
  ACTIVE: '',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
} as const;

/**
 * The Roadmap page (WI-088): the goal, centred and bold, as the reminder; one line to This week
 * and the revision queue; the roadmaps as bands that open to their weeks; one button to add
 * your own roadmap. No picks and no Continue button: the current week inside an open band is
 * where the work is.
 */
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
    dueRows = roadmapRevisionRows(due, now, user.timezone),
    lead = active[0] ?? null,
    others = active.slice(1);
  const target = (g: { targetDate: Date | null }) =>
    g.targetDate?.toISOString().slice(0, 10) ?? null;
  const bands = live.map((r) => {
    const dueBySection = new Map<string, number>();
    for (const item of revisionQueue(r.items, today))
      dueBySection.set(item.section, (dueBySection.get(item.section) ?? 0) + 1);
    return {
      id: r.id,
      title: r.title,
      done: r.progress.done,
      total: r.progress.total,
      due: r.due,
      current: r.next?.section ?? null,
      nextTitle: r.next?.title ?? null,
      sections: r.sections.map((s) => ({
        ...s,
        due: dueBySection.get(s.name) ?? 0,
      })),
    };
  });
  return (
    <>
      <PageShortcuts
        shortcuts={[
          { key: 'n', label: 'Add your own roadmap', press: 'new-roadmap' },
        ]}
      />
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Roadmap</h1>
          </div>
          <div className="today-head-actions">
            <UtilityMenu>
              <PanelButton panel="goals" className="link-button today-util">
                {!goals.length ? 'Set a goal' : 'Goals'}
              </PanelButton>
            </UtilityMenu>
          </div>
        </div>
      </header>
      <div className="roadmap-single">
        {/* The goal, centred and bold: the one thing on the page that is not a list. */}
        <section className="goal-hero" aria-labelledby="goal-heading">
          <p className="goal-hero-eyebrow">Your goal</p>
          {lead ? (
            <>
              <h2 id="goal-heading" className="goal-hero-title">
                {lead.title}
              </h2>
              <p className="goal-hero-when">
                <b>{targetLabel(target(lead), today)}</b>
                {target(lead) && <span> · {longDate(target(lead)!)}</span>}
              </p>
              {others.map((g) => (
                <p className="goal-hero-more" key={g.id}>
                  Also: {g.title} · {targetLabel(target(g), today)}
                </p>
              ))}
              <PanelButton
                panel="goals"
                focus={`goal-${lead.id}`}
                className="link-button goal-hero-edit"
              >
                Edit goal
              </PanelButton>
            </>
          ) : (
            <>
              <h2 id="goal-heading" className="goal-hero-title">
                Set a goal
              </h2>
              <div className="goal-hero-form">
                <GoalForm compact />
              </div>
            </>
          )}
        </section>
        {(live.length > 0 || dueRows.length > 0) && (
          <p className="more-line goal-hero-line">
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
        <section aria-labelledby="roadmaps-heading">
          <div className="agenda-head">
            <h2 id="roadmaps-heading" className="agenda-heading">
              Roadmaps{' '}
              {live.length > 0 && (
                <span className="muted agenda-count">· {live.length}</span>
              )}
            </h2>
          </div>
          <FeedbackOutlet channel="roadmaps" className="mb-2" />
          {!live.length && (
            <div className="empty-state">
              <RoadmapIllustration className="setup-illustration" />
              <h3>Your first roadmap</h3>
              <p className="empty">
                A roadmap is the list of topics and questions you want to be
                ready for, in weeks or sections, with what you have covered and
                what came up in interviews. Import your study material, or start
                one with Add your own roadmap.
              </p>
            </div>
          )}
          <RoadmapBands
            roadmaps={bands}
            defaultOpen={continueTarget(roadmaps)?.roadmapId ?? null}
          />
          {live.map((r) => (
            <SidePanel
              key={r.id}
              id={`add-items:${r.id}`}
              title={`Add items to ${r.title}`}
            >
              <BulkItemsForm
                roadmapId={r.id}
                sections={r.sections.map((s) => s.name)}
                section={r.next?.section ?? r.sections[0]?.name}
              />
            </SidePanel>
          ))}
          <div className="roadmap-add">
            <Disclosure
              label="Add your own roadmap"
              variant={live.length ? 'secondary' : 'primary'}
              shortcut="new-roadmap"
              draft="roadmap:new"
            >
              <RoadmapForm goals={goals} />
            </Disclosure>
          </div>
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
              {/* The goal already reads on the card; here only the P0 count (WI-058). */}
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
