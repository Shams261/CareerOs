import { RumiPose } from '@/features/agent/pose';
import Link from 'next/link';
import { owner } from '@/server/db';
import { dayKey, hhmm, shortDate, weekdayDate } from '@/lib/time';
import { funnelSnapshot, jobSnapshot } from '@/features/jobs/service';
import { FUNNEL_STEPS } from '@/features/jobs/funnel';
import { weekOf } from '@/lib/day';
import { shiftDay } from '@/lib/day';
import {
  applicationMove,
  filterApplications,
  funnelRows,
  inProcessStages,
  isOpen,
  isWaiting,
  label,
  needsAction,
  nextRound,
  pipelineStages,
  upcomingInterviews,
  views,
} from '@/features/jobs/domain';
import { aiPolicyLabel } from '@/features/jobs/formats';
import { ApplicationRow } from '@/features/jobs/components';
import { QuickAddForm } from '@/features/jobs/forms';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { UtilityMenu } from '@/components/utility-menu';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { Button } from '@/components/ui/button';
import { plural } from '@/lib/copy';
export const metadata = { title: 'Jobs' };

const FILTER_THRESHOLD = 8;
const RAIL_INTERVIEWS = 5;
export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    focus?: string;
    source?: string;
    funnel?: string;
  }>;
}) {
  const user = await owner(),
    now = new Date(),
    zone = user.timezone,
    today = dayKey(now, zone),
    filter = await searchParams,
    [data, funnel] = await Promise.all([
      jobSnapshot(user, now),
      funnelSnapshot(user, now),
    ]);
  const apps = data.apps;
  const upcoming = apps.filter((a) => nextRound(a.rounds, now)).length;
  const filtering =
    apps.length > FILTER_THRESHOLD ||
    !!(filter.q || filter.focus || filter.source);
  const visible = filterApplications(apps, filter, now, zone);
  // The rail carries what the list does not (WI-096): the next interviews with their prep.
  const interviews = upcomingInterviews(apps, now, RAIL_INTERVIEWS);
  const whenLabel = (d: Date) => {
    const day = dayKey(d, zone);
    return `${day === today ? 'Today' : day === shiftDay(today, 1) ? 'Tomorrow' : weekdayDate(day)} · ${hhmm(d, zone)}`;
  };
  const funnelView = funnelRows(
    funnel.weeks,
    weekOf(today),
    filter.funnel === 'all',
  );
  const view = views.includes(filter.view as (typeof views)[number])
    ? filter.view
    : 'active';
  const grouped = view === 'active' || view === 'all';
  const sources = [
    ...new Set(apps.map((a) => a.source).filter(Boolean)),
  ].sort();
  const counts = {
    active: apps.filter((a) => inProcessStages.includes(a.stage)).length,
    offers: apps.filter((a) => a.stage === 'OFFER').length,
    closed: apps.filter((a) => !isOpen(a.stage)).length,
    waiting: apps.filter(isWaiting).length,
    action: apps.filter(needsAction).length,
  };
  const summary = [
    `${counts.active} active`,
    upcoming ? plural(upcoming, 'upcoming interview') : null,
    counts.offers ? plural(counts.offers, 'offer') : null,
    counts.action ? `${counts.action} your move` : null,
    counts.waiting
      ? `${counts.waiting} waiting on ${counts.waiting === 1 ? 'a company' : 'companies'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const w = data.weekly;
  const weekFacts = (
    [
      [w.submitted, 'application', 'applications'],
      [w.recruiterScreens, 'recruiter screen', 'recruiter screens'],
      [w.technical, 'technical interview', 'technical interviews'],
      [w.interviewsCompleted, 'interview completed', 'interviews completed'],
      [w.followUpsDue, 'follow-up due', 'follow-ups due'],
      [w.followUpsDone, 'follow-up done', 'follow-ups done'],
      [w.stageMoves, 'stage move', 'stage moves'],
      [w.offers, 'offer', 'offers'],
      [w.rejections, 'rejection', 'rejections'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  // Sort inside a stage by the move's due instant, then company.
  const byMove = (a: (typeof apps)[number], b: (typeof apps)[number]) =>
    applicationMove(a, now, zone).due - applicationMove(b, now, zone).due ||
    a.company.localeCompare(b.company);
  const groups = grouped
    ? [...pipelineStages, 'REJECTED' as const, 'WITHDRAWN' as const]
        .map((stage) => ({
          stage,
          items: visible.filter((a) => a.stage === stage).sort(byMove),
        }))
        .filter((g) => g.items.length)
    : [{ stage: null, items: [...visible].sort(byMove) }];
  return (
    <>
      {/* The head like Practice (WI-096): the title and the facts left, More and Add
          application at the right; on a phone the title and More share a row and Add
          application sits under them. */}
      <div className="page-head is-practice is-jobs">
        <h1>Jobs</h1>
        {apps.length > 0 && (
          <div className="page-head-actions">
            <UtilityMenu>
              <Link
                className="link-button today-util"
                href="/settings#notifications-heading"
                prefetch={false}
              >
                Reminder settings
              </Link>
            </UtilityMenu>
            <PanelButton
              panel="add-application"
              className="button practice-primary"
            >
              Add application
            </PanelButton>
          </div>
        )}
      </div>
      {apps.length > 0 && (
        <>
          <p className="status-line practice-facts jobs-facts">
            {summary.split(' · ').map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
          <p className="status-line practice-facts jobs-facts">
            <span>This week</span>
            {weekFacts.length ? (
              weekFacts.map((f) => <span key={f}>{f}</span>)
            ) : (
              <span>nothing recorded yet</span>
            )}
          </p>
          <SidePanel
            id="add-application"
            title="Add application"
            variant="modal"
          >
            <QuickAddForm today={today} inPanel />
          </SidePanel>
        </>
      )}
      {!apps.length ? (
        <section className="card setup-card" aria-labelledby="setup-heading">
          <RumiPose pose="heading-out" size={104} className="setup-pose" />
          <p className="eyebrow">Start here</p>
          <h2 id="setup-heading">Track your first application.</h2>
          <p>
            Company and role are enough. Stages, interviews and next actions
            come later.
          </p>
          <QuickAddForm today={today} />
        </section>
      ) : (
        <div className="today-workspace is-today jobs-workspace">
          <section className="jobs-main" aria-labelledby="pipeline-heading">
            <div className="section-head">
              <h2 id="pipeline-heading">Applications</h2>
            </div>
            <FeedbackOutlet channel="applications" className="mb-2" />
            <nav className="jobs-views mb-3" aria-label="Show">
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
                    className="jobs-view"
                    href={v === 'active' ? '/jobs' : `/jobs?view=${v}`}
                    aria-current={view === v ? 'page' : undefined}
                    prefetch={false}
                  >
                    {text} · {n}
                  </Link>
                ))}
            </nav>
            {filtering && (
              <form className="dsa-filters mb-4">
                {view !== 'active' && (
                  <input type="hidden" name="view" value={view} />
                )}
                <label>
                  Search
                  <input
                    name="q"
                    defaultValue={filter.q ?? ''}
                    placeholder="Company or role"
                  />
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
                    <select name="source" defaultValue={filter.source ?? ''}>
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
                  <Link className="link" href="/jobs" prefetch={false}>
                    Clear
                  </Link>
                </div>
              </form>
            )}
            {groups.map((g) => (
              <div key={g.stage ?? 'all'} className="jobs-group">
                {g.stage && (
                  <p className="agenda-label">
                    {label(g.stage)} · {g.items.length}
                  </p>
                )}
                <ul className="plain-list job-rows">
                  {g.items.map((a) => (
                    <ApplicationRow
                      key={a.id}
                      app={a}
                      now={now}
                      zone={zone}
                      showStage={!g.stage}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {!visible.length && (
              <p className="empty">
                {view === 'active'
                  ? 'No active applications.'
                  : view === 'closed'
                    ? 'No closed applications.'
                    : 'No applications match this view.'}
              </p>
            )}
            {/* The funnel (WI-056): once a few applications are out, by the week they went. */}
            {funnel.sent >= 3 && (
              <section className="jobs-funnel" aria-labelledby="funnel-heading">
                <div className="section-head">
                  <h2 id="funnel-heading">Funnel</h2>
                  {funnelView.folded > 0 && (
                    <Link
                      className="link"
                      href="/jobs?funnel=all"
                      prefetch={false}
                    >
                      Show all {funnel.weeks.length} weeks
                    </Link>
                  )}
                  {filter.funnel === 'all' && (
                    <Link className="link" href="/jobs" prefetch={false}>
                      Fold the empty weeks
                    </Link>
                  )}
                </div>
                <div
                  className="funnel-scroll"
                  role="region"
                  aria-label="Funnel table"
                  tabIndex={0}
                >
                  <table className="funnel-table">
                    <caption className="sr-only">
                      Applications by the week they were sent, and how far each
                      got
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Week</th>
                        {FUNNEL_STEPS.map((step) => (
                          <th scope="col" key={step}>
                            {step}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {funnelView.rows.map((w) => (
                        <tr key={w.monday}>
                          <th scope="row">
                            {w.monday === weekOf(today)
                              ? 'This week'
                              : shortDate(w.monday)}
                          </th>
                          {w.counts.map((n, i) => (
                            <td
                              key={FUNNEL_STEPS[i]}
                              className={n ? '' : 'muted'}
                            >
                              {n}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">All time</th>
                        {funnel.all.map((n, i) => (
                          <td key={FUNNEL_STEPS[i]}>{n}</td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}
          </section>
          <aside className="today-rail">
            <section
              className="card rail-card has-corner-pose"
              aria-labelledby="next-interviews-heading"
            >
              <RumiPose
                pose="interview-ready"
                size={64}
                className="corner-pose"
              />
              <div className="attention-head">
                <h2 id="next-interviews-heading">Interviews next</h2>
              </div>
              {!interviews.length && (
                <p className="attention-empty">No interview scheduled yet.</p>
              )}
              {interviews.length > 0 && (
                <ul className="plain-list rail-list">
                  {interviews.map((r) => (
                    <li key={r.id} className="rail-item">
                      <Link
                        className="rail-item-link"
                        href={`/jobs/${r.applicationId}#round-${r.id}`}
                        prefetch={false}
                      >
                        <b>
                          {r.company} · {r.title}
                        </b>
                        <span className="muted">
                          {whenLabel(r.scheduledStart)}
                          {r.openPrep
                            ? ` · ${r.openPrep} prep item${r.openPrep === 1 ? '' : 's'} open`
                            : ''}
                          {r.aiPolicy !== 'UNKNOWN'
                            ? ` · ${aiPolicyLabel[r.aiPolicy as keyof typeof aiPolicyLabel]}`
                            : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {data.block && (
              <section
                className="card rail-card"
                aria-labelledby="block-heading"
              >
                <div className="attention-head">
                  <h2 id="block-heading">Next job search block</h2>
                </div>
                <p className="rail-fact">
                  <strong>{data.block.title}</strong>
                  <span className="muted">
                    {dayKey(data.block.plannedStart, zone) === today
                      ? 'Today'
                      : weekdayDate(dayKey(data.block.plannedStart, zone))}{' '}
                    · {hhmm(data.block.plannedStart, zone)}–
                    {hhmm(data.block.plannedEnd, zone)}
                  </span>
                </p>
              </section>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
