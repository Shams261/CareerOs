import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { jobSnapshot } from '@/features/jobs/service';
import {
  attentionQueue,
  filterApplications,
  inProcessStages,
  interviewTime,
  isWaiting,
  label,
  needsAction,
  nextRound,
  pipelineStages,
  stages,
  views,
} from '@/features/jobs/domain';
import { ApplicationRow, attentionText } from '@/features/jobs/components';
import { JobReminderForm, QuickAddForm } from '@/features/jobs/forms';

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
    waiting: apps.filter(isWaiting).length,
    action: apps.filter(needsAction).length,
  };
  const w = data.weekly;
  return (
    <>
      <p className="eyebrow">Job search</p>
      <h1>Keep the right doors open.</h1>
      <p className="muted mb-7">
        Active {counts.active} · Upcoming interviews {counts.interviews} ·
        Offers {counts.offers} · Waiting on company {counts.waiting} · Action
        required {counts.action}
      </p>
      <section className="card">
        <details open={!apps.length}>
          <summary>Add application</summary>
          <QuickAddForm today={today} />
        </details>
      </section>
      <div className="grid-main">
        <section>
          <section className="card" aria-labelledby="attention-heading">
            <h2 id="attention-heading">Needs attention</h2>
            {attention.length ? (
              <ul className="plain-list">
                {attention.map(({ app, reasons }) => (
                  <li className="dsa-item" key={app.id}>
                    <Link className="link" href={`/jobs/${app.id}`}>
                      {app.company}
                    </Link>{' '}
                    <span className="muted">· {app.role}</span>
                    <p>
                      {reasons.map((r) => attentionText(r, zone)).join(' · ')}
                    </p>
                    {app.nextAction && (
                      <p className="muted">Next action: {app.nextAction}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing needs your attention right now.</p>
            )}
          </section>
          <section className="card" aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading">Upcoming interviews</h2>
            {upcoming.length ? (
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
                      {label(round.type)} · {interviewTime(round, zone)} ·{' '}
                      {round.prepItems.filter((p) => !p.completed).length} prep
                      open
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No interviews scheduled.</p>
            )}
          </section>
          <section className="card" aria-labelledby="pipeline-heading">
            <h2 id="pipeline-heading">Pipeline</h2>
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
                  <option value="action">Action required from me</option>
                  <option value="waiting">Waiting on company</option>
                  <option value="interview">Upcoming interview</option>
                </select>
              </label>
              <label>
                Source
                <select name="source" defaultValue={filter.source ?? ''}>
                  <option value="">Any source</option>
                  {sources.map((s) => (
                    <option key={s} value={s!}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <div className="actions">
                <button className="button">Filter</button>
                <Link className="link" href="/jobs">
                  Clear
                </Link>
              </div>
            </form>
            <p className="muted">
              {visible.length} of {apps.length} applications
            </p>
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
              <p className="empty">No applications match this view.</p>
            )}
          </section>
        </section>
        <aside>
          <section className="card">
            <h2>Next job search block</h2>
            <p>
              {data.block
                ? formatInTimeZone(
                    data.block.plannedStart,
                    zone,
                    'EEEE, MMM d · h:mm a',
                  )
                : 'No upcoming block scheduled'}
            </p>
            <p className="muted">
              {data.block
                ? `${data.block.title} · until ${formatInTimeZone(data.block.plannedEnd, zone, 'h:mm a')}`
                : 'Schedule a JOB_SEARCH routine to reserve application time.'}
            </p>
          </section>
          <section className="card">
            <h2>This week</h2>
            <dl className="job-facts">
              {[
                ['Applications submitted', w.submitted],
                ['Logged during job-search sessions', w.loggedInSessions],
                ['Recruiter screens', w.recruiterScreens],
                ['Technical interviews', w.technical],
                ['Interviews completed', w.interviewsCompleted],
                ['Follow-ups due now', w.followUpsDue],
                ['Follow-ups completed', w.followUpsDone],
                ['Stage moves', w.stageMoves],
                ['Active applications', w.active],
                ['Offers', w.offers],
                ['Rejections', w.rejections],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="muted">
              Week starts Monday ({zone}). Counts only; no scores.
            </p>
          </section>
          <section className="card">
            <details>
              <summary>Job reminder preferences</summary>
              <JobReminderForm
                followUp={data.followUpPref}
                interview={data.interviewPref}
              />
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}
