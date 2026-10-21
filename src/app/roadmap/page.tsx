import Link from 'next/link';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { Disclosure } from '@/components/disclosure';
import { GoalForm, RoadmapForm } from '@/features/roadmap/forms';
import { goalsOverview, roadmapList } from '@/features/roadmap/service';
import { targetLabel } from '@/features/roadmap/domain';

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
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
  const [goals, roadmaps] = await Promise.all([
    goalsOverview(user, now),
    roadmapList(user),
  ]);
  const active = goals.filter((g) => g.status === 'ACTIVE'),
    rest = goals.filter((g) => g.status !== 'ACTIVE'),
    live = roadmaps.filter((r) => !r.archivedAt),
    archived = roadmaps.filter((r) => r.archivedAt);
  return (
    <>
      <p className="eyebrow">Goals and roadmaps</p>
      <div className="page-head">
        <h1>Roadmap</h1>
        {goals.length > 0 && (
          <Disclosure label="Add goal" variant="primary">
            <GoalForm />
          </Disclosure>
        )}
      </div>
      {!goals.length ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">What are you aiming for?</h2>
          <p>
            One goal with a date. Routines, subjects, priorities and roadmaps
            attach to it, and Today shows how the week is going toward it.
          </p>
          <GoalForm compact />
        </section>
      ) : (
        <section className="card" aria-labelledby="goals-heading">
          <div className="section-head">
            <h2 id="goals-heading">Goals</h2>
          </div>
          {active.map((g) => (
            <div className="goal-row" key={g.id}>
              <div>
                <strong>{g.title}</strong>
                <p className="muted">
                  {targetLabel(
                    g.targetDate?.toISOString().slice(0, 10) ?? null,
                    today,
                  )}{' '}
                  · {g.category}
                </p>
                <p className="status-line">
                  {g.week.planned + g.week.actual > 0 ? (
                    <span>
                      This week {hours(g.week.actual)} of{' '}
                      {hours(g.week.planned)}
                    </span>
                  ) : (
                    <span>Nothing planned toward it this week</span>
                  )}
                  {g.roadmap.total > 0 && (
                    <span>
                      Roadmap {g.roadmap.done} of {g.roadmap.total}
                      {g.roadmap.asked ? ` · ${g.roadmap.asked} asked` : ''}
                    </span>
                  )}
                  {g.topics.total > 0 && (
                    <span>
                      Topics {g.topics.ready} of {g.topics.total} interview
                      ready
                    </span>
                  )}
                </p>
                {g.description && <p className="muted">{g.description}</p>}
              </div>
              <Disclosure variant="link" label="Edit">
                <GoalForm goal={g} />
              </Disclosure>
            </div>
          ))}
          {!active.length && <p className="muted">No active goals.</p>}
          {rest.length > 0 && (
            <Disclosure variant="link" label="Other goals" className="mt-4">
              {rest.map((g) => (
                <div className="goal-row" key={g.id}>
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
        </section>
      )}
      <section className="card" aria-labelledby="roadmaps-heading">
        <div className="section-head">
          <h2 id="roadmaps-heading">Roadmaps</h2>
        </div>
        <Disclosure
          label="New roadmap"
          variant={live.length ? 'secondary' : 'primary'}
          defaultOpen={!live.length && goals.length > 0}
        >
          <RoadmapForm goals={goals} />
        </Disclosure>
        {!live.length && (
          <p className="muted mt-4">
            A roadmap is the list of concepts and questions you want to be ready
            for, in sections, with what you have covered and what came up in
            interviews.
          </p>
        )}
        {live.map((r) => (
          <div className="goal-row" key={r.id}>
            <div>
              <Link className="link" href={`/roadmap/${r.id}`}>
                {r.title}
              </Link>
              <p className="muted">
                {r.progress.done} of {r.progress.total} done
                {r.progress.inProgress
                  ? ` · ${r.progress.inProgress} in progress`
                  : ''}
                {r.progress.asked ? ` · ${r.progress.asked} asked` : ''}
                {r.sections.length
                  ? ` · ${r.sections.length} section${r.sections.length === 1 ? '' : 's'}`
                  : ''}
                {r.goal ? ` · ${r.goal.title}` : ''}
              </p>
            </div>
            <Link className="button secondary" href={`/roadmap/${r.id}`}>
              Open
            </Link>
          </div>
        ))}
        {archived.length > 0 && (
          <Disclosure variant="link" label="Archived roadmaps" className="mt-4">
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
    </>
  );
}
