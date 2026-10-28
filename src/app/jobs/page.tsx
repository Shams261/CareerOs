import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ApplicationIllustration } from '@/components/illustrations';
import { owner } from '@/server/db';
import { dayKey, hhmm, shortDate, weekdayDate } from '@/lib/time';
import { funnelSnapshot, jobSnapshot } from '@/features/jobs/service';
import { FUNNEL_STEPS } from '@/features/jobs/funnel';
import { weekOf } from '@/features/review/domain';
import {
  applicationMove,
  attentionQueue,
  filterApplications,
  inProcessStages,
  isOpen,
  isWaiting,
  label,
  needsAction,
  nextRound,
  pipelineStages,
  views,
} from '@/features/jobs/domain';
import {
  interviewPrepRows,
  jobAttentionRows,
  sortAttention,
  railRepeatsList,
} from '@/features/attention/domain';
import { ApplicationRow } from '@/features/jobs/components';
import { QuickAddForm } from '@/features/jobs/forms';
import { AttentionPages, AttentionRow } from '@/features/today/attention-rows';
import { PanelButton, SidePanel } from '@/components/side-panel';
import { Disclosure } from '@/components/disclosure';
import { UtilityMenu } from '@/features/today/utility-menu';
import { FeedbackOutlet } from '@/components/feedback-outlet';
import { Button } from '@/components/ui/button';
export const metadata = { title: 'Jobs' };

const FILTER_THRESHOLD = 8;
const PREVIEW = 5;
const PHONE_PREVIEW = 2;
export default async function Jobs({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    focus?: string;
    source?: string;
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
  // Needs attention in Today's words: prep for today's interviews, then every reason of
  // every application (follow-ups, results, interviews soon, undated moves).
  const prep = interviewPrepRows(
    apps.flatMap((a) =>
      a.rounds
        .filter((r) => r.status === 'SCHEDULED')
        .map((r) => ({
          id: r.id,
          title: r.title,
          applicationId: a.id,
          company: a.company,
          scheduledStart: r.scheduledStart,
          scheduledEnd: r.scheduledEnd,
          openPrep: r.prepItems.filter((p) => !p.completed).length,
        })),
    ),
    now,
    zone,
  );
  const attention = sortAttention([
    ...prep,
    ...jobAttentionRows(
      attentionQueue(apps, now, zone),
      now,
      zone,
      new Set(prep.map((i) => i.id.slice('prep:'.length))),
    ),
  ]);
  const preview = attention.slice(0, PREVIEW);
  const upcoming = apps.filter((a) => nextRound(a.rounds, now)).length;
  const filtering =
    apps.length > FILTER_THRESHOLD ||
    !!(filter.q || filter.focus || filter.source);
  const visible = filterApplications(apps, filter, now, zone);
  // A short list already carries each move; the rail says so instead of repeating it (WI-049).
  const repeats = railRepeatsList(
    attention,
    visible.map((a) => a.id),
    PREVIEW,
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
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? '' : 's'}`;
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
      <header className="today-head">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Jobs</h1>
          </div>
          {apps.length > 0 && (
            <UtilityMenu>
              <Link
                className="link-button today-util"
                href="/settings#notifications-heading"
                prefetch={false}
              >
                Reminder settings
              </Link>
            </UtilityMenu>
          )}
        </div>
        {apps.length > 0 && <p className="today-summary">{summary}</p>}
      </header>
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
        <div className="today-workspace is-today jobs-workspace">
          <section className="jobs-main" aria-labelledby="pipeline-heading">
            <div className="agenda-head">
              <h2 id="pipeline-heading" className="agenda-heading">
                Applications
              </h2>
              <Disclosure
                label="Add application"
                variant="primary"
                shortcut="add-application"
                draft="application:new"
                className="agenda-add"
              >
                <QuickAddForm today={today} />
              </Disclosure>
            </div>
            <nav className="status-line view-links mb-3" aria-label="Show">
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
                <ul className="plain-list attention-list">
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
                <h2 id="funnel-heading" className="agenda-heading">
                  Funnel
                </h2>
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
                      {funnel.weeks.map((w) => (
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
            <div className="attention-head">
              <h2 id="attention-heading">Needs attention</h2>
              {attention.length > PREVIEW && (
                <span className="muted attention-count is-wide">
                  Showing {PREVIEW} of {attention.length}
                </span>
              )}
              {attention.length > PHONE_PREVIEW && (
                <span className="muted attention-count is-phone">
                  Showing {Math.min(PHONE_PREVIEW, attention.length)} of{' '}
                  {attention.length}
                </span>
              )}
            </div>
            <FeedbackOutlet channel="attention" className="mb-2" />
            {!attention.length && (
              <p className="attention-empty">Nothing needs your attention.</p>
            )}
            {repeats ? (
              <p className="attention-empty">
                {attention.length === 1
                  ? 'The move is in Applications.'
                  : `The ${attention.length} moves are in Applications.`}
              </p>
            ) : (
              preview.length > 0 && (
                <ul className="plain-list attention-list attention-preview">
                  {preview.map((item) => (
                    <AttentionRow key={item.id} item={item} />
                  ))}
                </ul>
              )
            )}
            {attention.length > 0 && (
              <p className="attention-more">
                <PanelButton panel="attention" className="link-button">
                  View all {attention.length}{' '}
                  <ArrowRight size={14} aria-hidden="true" />
                </PanelButton>
              </p>
            )}
            <SidePanel
              id="attention"
              title={`Needs attention · ${attention.length}`}
            >
              <FeedbackOutlet channel="attention" className="mb-2" />
              <AttentionPages items={attention} />
            </SidePanel>
            {data.block && (
              <>
                <div className="attention-head rail-head">
                  <h2>Next job search block</h2>
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
              </>
            )}
            <div className="attention-head rail-head">
              <h2>This week</h2>
            </div>
            <p className="rail-fact muted">
              {weekFacts.length
                ? weekFacts.join(' · ')
                : 'Nothing recorded this week yet.'}
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
