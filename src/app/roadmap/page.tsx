import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { PageShortcuts } from '@/components/shortcuts';
import { BrandMark } from '@/components/brand';
import { RoadmapIllustration } from '@/components/illustrations';
import { GoalForm, RoadmapForm } from '@/features/roadmap/forms';
import { goalsOverview, roadmapList } from '@/features/roadmap/service';
import { daysUntil, targetLabel } from '@/features/roadmap/domain';
import { ProgressBar } from '@/components/progress-bar';
export const metadata = { title: 'Roadmap' };

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
const statusText = {
  ACTIVE: '',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
} as const;

/** "12 done this week · 704 left, 70 days to the target: about 10 a day". A fact, not a score. */
function paceLine(
  g: {
    doneThisWeek: number;
    roadmap: { total: number; done: number };
    targetDate: Date | null;
  },
  today: string,
) {
  const left = g.roadmap.total - g.roadmap.done;
  const days = g.targetDate
    ? daysUntil(g.targetDate.toISOString().slice(0, 10), today)
    : null;
  const pace =
    days && days > 0 && left > 0
      ? ` · ${left} left, ${days} days to the target`
      : '';
  return `${g.doneThisWeek} done this week${pace}`;
}

export default async function RoadmapPage() {
  const user = await owner(),
    now = new Date(),
    today = dayKey(now, user.timezone);
  const [goals, roadmaps] = await Promise.all([
    goalsOverview(user, now),
    roadmapList(user, now),
  ]);
  const active = goals.filter((g) => g.status === 'ACTIVE'),
    rest = goals.filter((g) => g.status !== 'ACTIVE'),
    live = roadmaps.filter((r) => !r.archivedAt),
    archived = roadmaps.filter((r) => r.archivedAt);
  return (
    <>
      <PageShortcuts
        shortcuts={[{ key: 'n', label: 'New roadmap', press: 'new-roadmap' }]}
      />
      <p className="eyebrow">Goals and roadmaps</p>
      <div className="page-head">
        <h1>Roadmap</h1>
        {goals.length > 0 && (
          <Disclosure
            label="New roadmap"
            variant={live.length ? 'secondary' : 'primary'}
            shortcut="new-roadmap"
            defaultOpen={!live.length}
          >
            <RoadmapForm goals={goals} />
          </Disclosure>
        )}
      </div>
      {!goals.length ? (
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
      ) : (
        <section className="card goal-card" aria-labelledby="goals-heading">
          {active.map((g) => (
            <div className="goal-summary" key={g.id}>
              <div>
                <p className="eyebrow">Goal</p>
                <h2 id="goals-heading">{g.title}</h2>
                <p className="muted">
                  {targetLabel(
                    g.targetDate?.toISOString().slice(0, 10) ?? null,
                    today,
                  )}
                  {g.roadmap.total
                    ? ` · ${g.roadmap.done} of ${g.roadmap.total} roadmap items done`
                    : ''}
                  {g.week.planned + g.week.actual > 0
                    ? ` · ${hours(g.week.actual)} of ${hours(g.week.planned)} this week`
                    : ''}
                </p>
                {g.roadmap.total > 0 && (
                  <p className="muted goal-pace">{paceLine(g, today)}</p>
                )}
                {g.upNext.length > 0 && (
                  <p className="goal-upnext">
                    <span className="muted">Up next:</span>{' '}
                    {g.upNext.map((n, i) => (
                      <span key={n.id}>
                        {i > 0 && <span className="muted"> · </span>}
                        <Link
                          className="link"
                          href={`/roadmap/${n.roadmapId}?section=${encodeURIComponent(n.section)}#item-${n.id}`}
                        >
                          {n.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <Disclosure variant="link" label="Edit goal">
                <GoalForm goal={g} />
              </Disclosure>
            </div>
          ))}
          {!active.length && <p className="muted">No active goals.</p>}
          <div className="goal-more">
            <Disclosure variant="link" label="Add goal">
              <GoalForm />
            </Disclosure>
            {rest.length > 0 && (
              <Disclosure variant="link" label="Other goals">
                {rest.map((g) => (
                  <div className="goal-summary" key={g.id}>
                    <div>
                      <strong>{g.title}</strong>
                      <p className="muted">
                        {statusText[g.status]} · {g.category}
                      </p>
                    </div>
                    <Disclosure variant="link" label="Edit">
                      <GoalForm goal={g} />
                    </Disclosure>
                  </div>
                ))}
              </Disclosure>
            )}
          </div>
        </section>
      )}
      {goals.length > 0 && (
        <section className="card flat" aria-labelledby="roadmaps-heading">
          <div className="section-head">
            <h2 id="roadmaps-heading">Roadmaps</h2>
          </div>
          {!live.length && (
            <div className="empty-state">
              <RoadmapIllustration className="setup-illustration" />
              <h3>Your first roadmap</h3>
              <p className="muted">
                A roadmap is the list of topics and questions you want to be
                ready for, in sections, with what you have covered and what came
                up in interviews. Import your study material, or start one with
                New roadmap above.
              </p>
            </div>
          )}
          <ol className="plain-list">
            {live.map((r) => (
              <li key={r.id}>
                <Link
                  className="roadmap-row"
                  href={
                    r.next
                      ? `/roadmap/${r.id}?section=${encodeURIComponent(r.next.section)}#item-${r.next.id}`
                      : `/roadmap/${r.id}`
                  }
                  prefetch={false}
                >
                  <span className="roadmap-row-main">
                    <span className="roadmap-row-title">{r.title}</span>
                    <ProgressBar
                      done={r.progress.done}
                      inProgress={r.progress.inProgress}
                      total={r.progress.total}
                    />
                    <span className="muted">
                      {r.next
                        ? `Continue: ${r.next.title} · ${r.next.section}`
                        : r.progress.total
                          ? 'Everything done'
                          : 'No items yet'}
                    </span>
                  </span>
                  <span className="roadmap-row-counts">
                    <span>
                      {r.progress.done} of {r.progress.total} done
                    </span>
                    {!r.due && r.progress.inProgress > 0 && (
                      <span>{r.progress.inProgress} in progress</span>
                    )}
                  </span>
                </Link>
                {r.due > 0 && r.dueSection && (
                  <Link
                    className="link roadmap-row-due"
                    href={`/roadmap/${r.id}?section=${encodeURIComponent(r.dueSection)}&show=revision`}
                    prefetch={false}
                  >
                    {r.due} due for revision{' '}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
          {archived.length > 0 && (
            <Disclosure
              variant="link"
              label="Archived roadmaps"
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
      )}
    </>
  );
}
