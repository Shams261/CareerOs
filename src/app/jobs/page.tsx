import Link from 'next/link';
import { ApplicationIllustration } from '@/components/illustrations';
import { formatInTimeZone } from 'date-fns-tz';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { jobSnapshot } from '@/features/jobs/service';
import {
  attentionQueue,
  filterApplications,
  inProcessStages,
  interviewTime,
  isOpen,
  isWaiting,
  label,
  needsAction,
  nextRound,
  pipelineStages,
  stages,
  views,
} from '@/features/jobs/domain';
import { ApplicationRow, attentionText } from '@/features/jobs/components';
import { QuickAddForm } from '@/features/jobs/forms';
import { Disclosure } from '@/components/disclosure';
import { Button } from '@/components/ui/button';
export const metadata = { title: 'Jobs' };

const FILTER_THRESHOLD = 8;
export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    stage?: string;
    focus?: string;
    source?: string;
  }>;
}) {
  const user = await owner(),
    now = new Date(),
    zone = user.timezone,
    today = dayKey(now, zone),
    filter = await searchParams,
    data = await jobSnapshot(user, now);
  const apps = data.apps,
    attention = attentionQueue(apps, now, zone),
    upcoming = apps
      .flatMap((a) => {
        const r = nextRound(a.rounds, now);
        return r ? [{ app: a, round: r }] : [];
      })
      .sort((a, b) => +a.round.scheduledStart - +b.round.scheduledStart),
    // The view links above the list are always there; the full form appears
    // with enough applications or once a finer filter is in use.
    filtering =
      apps.length > FILTER_THRESHOLD ||
      !!(filter.q || filter.stage || filter.focus || filter.source),
    visible = filterApplications(apps, filter, now, zone),
    view = views.includes(filter.view as (typeof views)[number])
      ? filter.view
      : 'active',
    grouped = view === 'active' || view === 'all',
    sources = [...new Set(apps.map((a) => a.source).filter(Boolean))].sort();
  const counts = {
    active: apps.filter((a) => inProcessStages.includes(a.stage)).length,
    interviews: upcoming.length,
    offers: apps.filter((a) => a.stage === 'OFFER').length,
    closed: apps.filter((a) => !isOpen(a.stage)).length,
    waiting: apps.filter(isWaiting).length,
    action: apps.filter(needsAction).length,
  };
  const w = data.weekly;
  const weekFacts = (
    [
      ['Applications submitted', w.submitted],
      ['Recruiter screens', w.recruiterScreens],
      ['Technical interviews', w.technical],
      ['Interviews completed', w.interviewsCompleted],
      ['Follow-ups due', w.followUpsDue],
      ['Follow-ups completed', w.followUpsDone],
      ['Stage moves', w.stageMoves],
      ['Offers', w.offers],
      ['Rejections', w.rejections],
    ] as const
  ).filter(([, v]) => v > 0);
  return (
    <>
      <p className="eyebrow">Jobs</p>
      <div className="page-head">
        <h1>Jobs</h1>
        {apps.length > 0 && (
          <Disclosure
            label="Add application"
            variant="primary"
            draft="application:new"
          >
            <QuickAddForm today={today} />
          </Disclosure>
        )}
      </div>
      {!apps.length ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <ApplicationIllustration className="setup-illustration" />
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Track your first application.</h2>
          <p>
            Company and role are enough. Stages, interviews and next actions
            come later.
          </p>
          <QuickAddForm today={today} />
        </section>
      ) : (
        <>
          <p className="status-line mb-5">
            <span>{counts.active} active</span>
            {counts.interviews > 0 && (
              <span>
                {counts.interviews} upcoming interview
                {counts.interviews === 1 ? '' : 's'}
              </span>
            )}
            {counts.offers > 0 && (
              <span>
                {counts.offers} offer{counts.offers === 1 ? '' : 's'}
              </span>
            )}
            {counts.waiting > 0 && (
              <span>{counts.waiting} waiting on company</span>
            )}
            {counts.action > 0 && <span>{counts.action} your move</span>}
          </p>
          <div className="grid-main">
            <section>
              {(attention.length > 0 || upcoming.length > 0) && (
                <section className="card" aria-labelledby="attention-heading">
                  <h2 id="attention-heading">Needs attention</h2>
                  {attention.length > 0 && (
                    <ul className="plain-list">
                      {attention.map(({ app, reasons }) => (
                        <li className="dsa-item" key={app.id}>
                          <Link className="link" href={`/jobs/${app.id}`}>
                            {app.company}
                          </Link>{' '}
                          <span className="muted">· {app.role}</span>
                          <p>
                            {reasons
                              .map((r) => attentionText(r, zone))
                              .join(' · ')}
                          </p>
                          {app.nextAction && (
                            <p className="muted">
                              Next action: {app.nextAction}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {upcoming.length > 0 && (
                    <>
                      <h3 className="mt-4">Upcoming interviews</h3>
                      <ul className="plain-list">
                        {upcoming.map(({ app, round }) => (
                          <li className="dsa-item" key={round.id}>
                            <Link
                              className="link"
                              href={`/jobs/${app.id}#round-${round.id}`}
                            >
                              {app.company} — {round.title}
                            </Link>
                            <p className="muted">
                              {label(round.type)} · {interviewTime(round, zone)}{' '}
                              ·{' '}
                              {
                                round.prepItems.filter((p) => !p.completed)
                                  .length
                              }{' '}
                              prep open
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
              <section className="card flat" aria-labelledby="pipeline-heading">
                <div className="section-head">
                  <h2 id="pipeline-heading">
                    Applications{' '}
                    <span className="muted">
                      ·{' '}
                      {visible.length === apps.length
                        ? apps.length
                        : `${visible.length} of ${apps.length}`}
                    </span>
                  </h2>
                </div>
                <nav className="status-line view-links mb-4" aria-label="Show">
                  {(
                    [
                      ['active', 'Active', counts.active],
                      ['offer', 'Offers', counts.offers],
                      ['closed', 'Closed', counts.closed],
                      ['all', 'All', apps.length],
                    ] as const
                  )
                    .filter(([v, , n]) => n > 0 || view === v)
                    .map(([v, text, n]) => (
                      <Link
                        key={v}
                        className="link"
                        href={v === 'active' ? '/jobs' : `/jobs?view=${v}`}
                        aria-current={view === v ? 'page' : undefined}
                      >
                        {text} · {n}
                      </Link>
                    ))}
                </nav>
                {filtering && (
                  <form className="dsa-filters mb-5">
                    <label>
                      Search
                      <input
                        name="q"
                        defaultValue={filter.q ?? ''}
                        placeholder="Company or role"
                      />
                    </label>
                    <label>
                      Show
                      <select name="view" defaultValue={view}>
                        {views.map((v) => (
                          <option key={v} value={v}>
                            {label(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Stage
                      <select name="stage" defaultValue={filter.stage ?? ''}>
                        <option value="">Any stage</option>
                        {stages.map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Focus
                      <select name="focus" defaultValue={filter.focus ?? ''}>
                        <option value="">Everything</option>
                        <option value="attention">Needs attention</option>
                        <option value="action">Your move</option>
                        <option value="waiting">Waiting on company</option>
                        <option value="interview">Upcoming interview</option>
                      </select>
                    </label>
                    {sources.length > 0 && (
                      <label>
                        Source
                        <select
                          name="source"
                          defaultValue={filter.source ?? ''}
                        >
                          <option value="">Any source</option>
                          {sources.map((s) => (
                            <option key={s} value={s!}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="actions">
                      <Button className="secondary">Filter</Button>
                      <Link className="link" href="/jobs">
                        Clear
                      </Link>
                    </div>
                  </form>
                )}
                {grouped ? (
                  [...pipelineStages, 'REJECTED' as const, 'WITHDRAWN' as const]
                    .map((stage) => ({
                      stage,
                      items: visible.filter((a) => a.stage === stage),
                    }))
                    .filter((g) => g.items.length)
                    .map((g) => (
                      <div key={g.stage}>
                        <h3 className="mt-4">
                          {label(g.stage)} · {g.items.length}
                        </h3>
                        <ul className="plain-list">
                          {g.items.map((a) => (
                            <ApplicationRow
                              key={a.id}
                              app={a}
                              now={now}
                              zone={zone}
                              today={today}
                            />
                          ))}
                        </ul>
                      </div>
                    ))
                ) : (
                  <ul className="plain-list">
                    {visible.map((a) => (
                      <ApplicationRow
                        key={a.id}
                        app={a}
                        now={now}
                        zone={zone}
                        today={today}
                      />
                    ))}
                  </ul>
                )}
                {!visible.length && (
                  <p className="muted">
                    {view === 'active'
                      ? 'No active applications.'
                      : view === 'closed'
                        ? 'No closed applications.'
                        : 'No applications match this view.'}
                  </p>
                )}
              </section>
            </section>
            <aside>
              {data.block && (
                <section className="card" aria-labelledby="block-heading">
                  <h2 id="block-heading">Next job search block</h2>
                  <p>
                    {formatInTimeZone(
                      data.block.plannedStart,
                      zone,
                      'EEEE, MMM d · h:mm a',
                    )}
                  </p>
                  <p className="muted">
                    {data.block.title} · until{' '}
                    {formatInTimeZone(data.block.plannedEnd, zone, 'h:mm a')}
                  </p>
                </section>
              )}
              <section className="card" aria-labelledby="week-heading">
                <h2 id="week-heading">This week</h2>
                {weekFacts.length ? (
                  <dl className="job-facts">
                    {weekFacts.map(([k, v]) => (
                      <div key={k}>
                        <dt className="muted">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">Nothing recorded this week yet.</p>
                )}
              </section>
              <p className="status-line">
                <Link className="link" href="/settings#notifications-heading">
                  Reminder settings
                </Link>
              </p>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
