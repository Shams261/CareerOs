import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { Disclosure } from '@/components/disclosure';
import { remindersPreview } from '@/features/notifications/preview';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import {
  currentWeek,
  defaultReviewWeek,
  formatMinutes,
  isMonday,
  weekOf,
} from '@/features/review/domain';
import {
  carryForward,
  nextWeekContext,
  recentTrend,
  reviewHistory,
  weekReview,
} from '@/features/review/service';
import {
  CompleteReviewForm,
  PrepareNextWeekForm,
  PriorityForm,
  PriorityList,
  ReviewForm,
  WeeklyReminderForm,
} from '@/features/review/forms';
export const metadata = { title: 'Weekly review' };

const range = (monday: string) =>
  `${formatInTimeZone(new Date(`${monday}T12:00:00Z`), 'UTC', 'MMM d')}–${formatInTimeZone(new Date(`${shiftDay(monday, 6)}T12:00:00Z`), 'UTC', 'MMM d, yyyy')}`;
const weekday = (day: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', 'EEE');
const symbol = {
  done: ['✓', 'completed'],
  skipped: ['–', 'skipped'],
  cancelled: ['×', 'cancelled'],
  unrecorded: ['!', 'not recorded'],
  planned: ['○', 'planned'],
} as const;
const STEPS = [
  ['week', 'This week'],
  ['reflect', 'Reflect'],
  ['plan', 'Next week'],
] as const;
type Step = (typeof STEPS)[number][0] | 'details';

function Bar({
  label,
  planned,
  actual,
  max,
}: {
  label: string;
  planned: number;
  actual: number;
  max: number;
}) {
  const pct = (n: number) => `${max ? Math.round((n / max) * 100) : 0}%`;
  return (
    <div className="week-bar">
      <div className="row">
        <strong>{label}</strong>
        <span className="muted">
          Planned {formatMinutes(planned)} · Actual {formatMinutes(actual)}
        </span>
      </div>
      <div className="week-bar-track" aria-hidden="true">
        <span className="week-bar-planned" style={{ width: pct(planned) }} />
        <span className="week-bar-actual" style={{ width: pct(actual) }} />
      </div>
    </div>
  );
}
const Fact = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <dt className="muted">{label}</dt>
    <dd>{value}</dd>
  </div>
);
/** Facts with a zero value say nothing useful in a review; only the non-zero ones render. */
const Facts = ({ items }: { items: [string, number][] }) => {
  const shown = items.filter(([, v]) => v > 0);
  return shown.length ? (
    <dl className="job-facts">
      {shown.map(([k, v]) => (
        <Fact key={k} label={k} value={v} />
      ))}
    </dl>
  ) : (
    <p className="muted">Nothing recorded.</p>
  );
};

export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; step?: string }>;
}) {
  const user = await owner(),
    now = new Date(),
    zone = user.timezone,
    query = await searchParams;
  const thisWeek = currentWeek(now, zone),
    today = dayKey(now, zone);
  // On a Monday with last week's review still open, the page opens on last week.
  const lastWeekCompleted =
    !query.week && isMonday(today)
      ? !!(
          await db().weeklyReview.findUnique({
            where: {
              userId_weekStart: {
                userId: user.id,
                weekStart: new Date(shiftDay(thisWeek, -7)),
              },
            },
            select: { completedAt: true },
          })
        )?.completedAt
      : true;
  const monday =
    query.week && /^\d{4}-\d{2}-\d{2}$/.test(query.week)
      ? isMonday(query.week)
        ? query.week
        : weekOf(query.week)
      : defaultReviewWeek(today, lastWeekCompleted);
  const openLastWeek = !query.week && monday !== thisWeek;
  const step: Step = (['week', 'reflect', 'plan', 'details'] as const).includes(
    query.step as Step,
  )
    ? (query.step as Step)
    : 'week';
  const nextMonday = shiftDay(monday, 7);
  const planning = monday >= thisWeek;
  // Each step loads only what it shows; Details loads everything.
  const details = step === 'details',
    plan = step === 'plan' || details;
  const [w, carry, next, trend, history, goals, pref, reminders] =
    await Promise.all([
      weekReview(user, monday, now),
      details ? carryForward(user, now) : { dsa: [], learning: [], jobs: [] },
      plan && planning ? nextWeekContext(user, nextMonday, now) : null,
      details ? recentTrend(user, monday, now) : [],
      details ? reviewHistory(user.id) : [],
      plan
        ? db().goal.findMany({
            where: { userId: user.id },
            select: { id: true, title: true },
          })
        : [],
      details
        ? db().notificationPreference.findUnique({
            where: { userId_type: { userId: user.id, type: 'WEEKLY_REVIEW' } },
          })
        : null,
      plan ? remindersPreview(user, nextMonday) : [],
    ]);
  const s = w.schedule;
  const max = Math.max(
    s.focus.planned,
    s.focus.actual,
    ...s.rows.map((r) => Math.max(r.planned, r.actual)),
    1,
  );
  const status = w.review?.completedAt
    ? 'Completed'
    : w.review
      ? 'Draft'
      : 'Not started';
  const href = (to: Step, week = monday) =>
    `/review?week=${week}${to === 'week' ? '' : `&step=${to}`}`;
  const dayLine = (items: (typeof s.days)[number]['items']) => {
    const live = items.filter((i) => i.state !== 'cancelled');
    if (!live.length) return 'No plan';
    const done = live.filter((i) => i.state === 'done').length,
      skipped = live.filter((i) => i.state === 'skipped').length,
      open = live.filter((i) => i.state === 'unrecorded').length;
    return [
      `${done} of ${live.length} done`,
      skipped ? `${skipped} skipped` : '',
      open ? `${open} not recorded` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };
  return (
    <>
      <p className="eyebrow">
        Weekly review ·{' '}
        {w.isCurrent
          ? 'This week'
          : monday > thisWeek
            ? 'Upcoming week'
            : openLastWeek
              ? 'Last week, not yet reviewed'
              : 'Past week'}
      </p>
      <div className="page-head">
        <h1 className="editorial-heading">Week of {range(monday)}</h1>
        <nav className="day-nav" aria-label="Week navigation">
          <span className="pill">{status}</span>
          <Link
            className="button secondary"
            href={href(step, shiftDay(monday, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          {monday !== thisWeek && (
            <Link className="button secondary" href={href(step, thisWeek)}>
              This week
            </Link>
          )}
          <Link
            className="button secondary"
            href={href(step, nextMonday)}
            aria-label="Next week"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </nav>
      </div>
      <nav className="stepper" aria-label="Review steps">
        {STEPS.map(([key, title], i) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={step === key ? 'step' : undefined}
          >
            <span className="step-number" aria-hidden="true">
              {i + 1}
            </span>
            {title}
          </Link>
        ))}
        <Link
          href={href('details')}
          aria-current={step === 'details' ? 'step' : undefined}
        >
          Details
        </Link>
      </nav>

      {step === 'week' && (
        <>
          <section className="card" aria-labelledby="week-heading">
            <h2 id="week-heading">Planned versus done</h2>
            <dl className="job-facts">
              <Fact label="Planned" value={s.totals.planned} />
              <Fact label="Completed" value={s.totals.completed} />
              <Fact label="Skipped" value={s.totals.skipped} />
              <Fact label="Not recorded" value={s.totals.unrecorded} />
              <Fact label="Focus time" value={formatMinutes(s.focus.actual)} />
            </dl>
            <Bar
              label="Focused work"
              planned={s.focus.planned}
              actual={s.focus.actual}
              max={max}
            />
            <div
              className="week-chart mt-5"
              role="img"
              aria-label={`Planned and recorded minutes per day: ${s.days
                .map(
                  (d) =>
                    `${weekday(d.day)} ${formatMinutes(d.planned)} planned, ${formatMinutes(d.actual)} recorded`,
                )
                .join('; ')}`}
            >
              {s.days.map((d) => {
                const top = Math.max(
                  1,
                  ...s.days.map((x) => Math.max(x.planned, x.actual)),
                );
                const pct = (n: number) => `${Math.round((n / top) * 100)}%`;
                return (
                  <div
                    className={`week-col${d.day === w.today ? ' is-today' : ''}`}
                    key={d.day}
                    title={`${weekday(d.day)}: ${formatMinutes(d.planned)} planned · ${formatMinutes(d.actual)} recorded`}
                  >
                    <div className="week-bars">
                      <span
                        className="week-bar-p"
                        style={{ height: pct(d.planned) }}
                      />
                      <span
                        className="week-bar-a"
                        style={{ height: pct(d.actual) }}
                      />
                    </div>
                    <span className="week-col-label">{weekday(d.day)}</span>
                  </div>
                );
              })}
            </div>
            <p className="status-line">
              <span className="legend legend-p">Planned</span>
              <span className="legend legend-a">Recorded</span>
            </p>
            <div className="mt-5">
              {s.days.map((d) => (
                <div className="day-line" key={d.day}>
                  <strong>{weekday(d.day)}</strong>
                  <span>{dayLine(d.items)}</span>
                  <Link className="link" href={`/today?date=${d.day}`}>
                    Open
                  </Link>
                </div>
              ))}
            </div>
            <div className="step-foot">
              <Link className="button" href={href('reflect')}>
                Next: Reflect <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </>
      )}

      {step === 'reflect' && (
        <>
          {w.commitments.length > 0 && (
            <section className="card" aria-labelledby="commit-heading">
              <h2 id="commit-heading">What you set out to do</h2>
              <PriorityList priorities={w.commitments} editable={false} />
            </section>
          )}
          <section className="card" aria-labelledby="reflect-heading">
            <h2 id="reflect-heading">Reflection</h2>
            <ReviewForm key={monday} weekStart={monday} review={w.review} />
          </section>
        </>
      )}

      {step === 'plan' && (
        <>
          <section className="card" aria-labelledby="priorities-heading">
            <h2 id="priorities-heading">
              Priorities for the week of {range(nextMonday)}
            </h2>
            <PriorityList priorities={w.review?.priorities ?? []} editable />
            <PriorityForm
              weekStart={monday}
              count={w.review?.priorities.length ?? 0}
              goals={goals}
            />
            {!planning && (
              <p className="status-line mt-5">
                <span>
                  The week after this one is already planned. Prepare is for the
                  coming week.
                </span>
                <Link className="link" href={href('plan', thisWeek)}>
                  Open this week&apos;s review{' '}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </p>
            )}
            <CompleteReviewForm
              weekStart={monday}
              completedAt={w.review?.completedAt ?? null}
            />
          </section>
          {next && (
            <section className="card" aria-labelledby="next-heading">
              <h2 id="next-heading">Next week</h2>
              {next.jobs.interviews.length > 0 && (
                <div className="hero">
                  <div>
                    <p className="eyebrow">Interviews next week</p>
                    {next.jobs.interviews.map((i) => (
                      <p key={i.id}>
                        <Link
                          className="link"
                          href={`/jobs/${i.applicationId}#round-${i.id}`}
                        >
                          {i.company} — {i.title}
                        </Link>{' '}
                        · {formatInTimeZone(i.start, zone, 'EEE h:mm a')} · Prep{' '}
                        {i.prepDone} / {i.prepTotal}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <dl className="job-facts">
                <Fact label="DSA topic" value={next.dsa.topic ?? 'Not set'} />
                <Fact label="DSA revisions due" value={next.dsa.revisionsDue} />
                <Fact
                  label="Learning focus"
                  value={next.learning.subject ?? 'Not set'}
                />
                <Fact
                  label="Technical reviews due"
                  value={next.learning.reviewsDue}
                />
                <Fact
                  label="Applications needing action"
                  value={next.jobs.actionRequired}
                />
                <Fact
                  label="Days planned"
                  value={`${next.generatedDays} of 7`}
                />
              </dl>
              {next.jobs.followUps.length > 0 && (
                <p className="muted">
                  Follow-ups due:{' '}
                  {next.jobs.followUps
                    .map(
                      (a) =>
                        `${weekday(a.nextActionDate!.toISOString().slice(0, 10))} ${a.company}${a.nextAction ? ` — ${a.nextAction}` : ''}`,
                    )
                    .join(' · ')}
                </p>
              )}
              <PrepareNextWeekForm monday={next.bounds.monday} />
            </section>
          )}
          <section className="card flat" aria-labelledby="reminders-heading">
            <div className="section-head">
              <h2 id="reminders-heading">Reminders next week</h2>
              <Link className="link" href="/settings#notifications-heading">
                Change in Settings
              </Link>
            </div>
            <ul className="plain-list reminder-lines">
              {reminders.map((r) => (
                <li key={r.title} className={r.on ? '' : 'is-off'}>
                  <strong>{r.title}</strong>
                  <span className="muted">{r.on ? r.detail : 'Off.'}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {step === 'details' && (
        <>
          <section className="card" aria-labelledby="execution-heading">
            <h2 id="execution-heading">Execution</h2>
            <dl className="job-facts">
              <Fact label="Planned blocks" value={s.totals.planned} />
              <Fact label="Completed" value={s.totals.completed} />
              <Fact label="Skipped" value={s.totals.skipped} />
              <Fact label="Cancelled" value={s.totals.cancelled} />
              <Fact label="Not recorded" value={s.totals.unrecorded} />
            </dl>
            <h3 className="mt-4">Planned versus actual</h3>
            <Bar
              label="Focused work"
              planned={s.focus.planned}
              actual={s.focus.actual}
              max={max}
            />
            {s.rows.map((r) => (
              <Bar key={r.label} {...r} max={max} />
            ))}
            <h3 className="mt-4">Day by day</h3>
            <div className="week-days">
              {s.days.map((d) => (
                <div key={d.day}>
                  <strong>
                    {weekday(d.day)}{' '}
                    <span className="muted">{d.day.slice(5)}</span>
                  </strong>
                  <ul className="plain-list">
                    {d.items.map((i) => (
                      <li key={i.id}>
                        <span aria-hidden="true">{symbol[i.state][0]}</span>{' '}
                        {i.title}{' '}
                        <span className="muted">{symbol[i.state][1]}</span>
                      </li>
                    ))}
                    {!d.items.length && <li className="muted">No plan</li>}
                  </ul>
                </div>
              ))}
            </div>
            {s.routines.length > 0 && (
              <>
                <h3 className="mt-4">By category</h3>
                <ul className="plain-list">
                  {s.routines.slice(0, 8).map((r) => (
                    <li key={r.label}>
                      {r.label}: {r.completed} / {r.planned} completed
                      {r.skipped ? ` · ${r.skipped} skipped` : ''}
                      {r.unrecorded ? ` · ${r.unrecorded} not recorded` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {trend.length > 0 && (
              <>
                <h3 className="mt-4">Recent weeks</h3>
                <p className="muted">
                  {trend
                    .map(
                      (t) =>
                        `${t.monday.slice(5)}: ${formatMinutes(t.focus)} focus, ${t.applications} applications`,
                    )
                    .join(' · ')}
                </p>
              </>
            )}
            {w.goals.length > 0 && (
              <>
                <h3 className="mt-4">By goal</h3>
                <ul className="plain-list">
                  {w.goals.map((g) => (
                    <li key={g.goal}>
                      {g.goal}: planned {formatMinutes(g.planned)} · actual{' '}
                      {formatMinutes(g.actual)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="progress-heading">
            <h2 id="progress-heading">Progress</h2>
            <h3>DSA{w.dsa.topic ? ` · current topic ${w.dsa.topic}` : ''}</h3>
            <Facts
              items={[
                ['Attempts', w.dsa.attempts],
                ['Problems', w.dsa.uniqueProblems],
                ['New', w.dsa.newProblems],
                ['Revisions', w.dsa.revisionAttempts],
                ['Red to Yellow', w.dsa.redToYellow],
                ['Yellow to Green', w.dsa.yellowToGreen],
                ['Revisions overdue', w.dsa.overdue],
              ]}
            />
            {w.dsa.attempts > 0 && (
              <p className="muted">
                Now: {w.dsa.current.RED} red · {w.dsa.current.YELLOW} yellow ·{' '}
                {w.dsa.current.GREEN} green
              </p>
            )}
            <h3 className="mt-4">
              Technical learning
              {w.learning.subject ? ` · focus ${w.learning.subject}` : ''}
            </h3>
            <Facts
              items={[
                ['Activities', w.learning.activities],
                ['Topics studied', w.learning.studied],
                ['Topics reviewed', w.learning.reviewed],
                ['Became interview ready', w.learning.becameReady],
                ['Back to needs review', w.learning.regressed],
              ]}
            />
            <h3 className="mt-4">Job search</h3>
            <Facts
              items={[
                ['Applications submitted', w.jobs.submitted],
                ['Recruiter screens', w.jobs.recruiter],
                ['Assessments', w.jobs.assessment],
                ['Technical', w.jobs.technical],
                ['System design', w.jobs.systemDesign],
                ['Behavioral', w.jobs.behavioral],
                ['Final rounds', w.jobs.final],
                ['Interviews completed', w.jobs.completed],
                ['Follow-ups done', w.jobs.followUpsDone],
                ['Offers', w.jobs.offers],
                ['Rejections', w.jobs.rejections],
                ['Active now', w.jobs.active],
                ['Waiting on company', w.jobs.waiting],
                ['Action required', w.jobs.actionRequired],
              ]}
            />
            {w.reflections.length > 0 && (
              <>
                <h3 className="mt-4">Interview notes this week</h3>
                {w.reflections.map((r) => (
                  <article className="learning-history" key={r.id}>
                    <h4>
                      <Link
                        className="link"
                        href={`/jobs/${r.applicationId}#round-${r.id}`}
                      >
                        {r.company} — {r.title}
                      </Link>
                    </h4>
                    {r.toImprove && <p>Improve: “{r.toImprove}”</p>}
                    {r.wentWell && (
                      <p className="muted">Went well: “{r.wentWell}”</p>
                    )}
                    {r.topicsAsked && (
                      <p className="muted">Topics: {r.topicsAsked}</p>
                    )}
                  </article>
                ))}
              </>
            )}
          </section>

          {(carry.dsa.length ||
            carry.learning.length ||
            carry.jobs.length ||
            s.unrecordedBlocks.length) > 0 && (
            <section className="card" aria-labelledby="carry-heading">
              <h2 id="carry-heading">Still open</h2>
              <ul className="plain-list">
                {carry.dsa.length > 0 && (
                  <li>
                    DSA revisions overdue: {carry.dsa.length}{' '}
                    {carry.dsa.slice(0, 3).map((p) => (
                      <Link
                        key={p.id}
                        className="link mr-2"
                        href={`/dsa/${p.id}`}
                      >
                        {p.title}
                      </Link>
                    ))}
                  </li>
                )}
                {carry.learning.length > 0 && (
                  <li>
                    Technical reviews overdue: {carry.learning.length}{' '}
                    {carry.learning.slice(0, 3).map((t) => (
                      <Link
                        key={t.id}
                        className="link mr-2"
                        href={`/learn/topics/${t.id}`}
                      >
                        {t.title}
                      </Link>
                    ))}
                  </li>
                )}
                {carry.jobs.length > 0 && (
                  <li>
                    Job follow-ups overdue: {carry.jobs.length}{' '}
                    {carry.jobs.slice(0, 3).map((a) => (
                      <Link
                        key={a.id}
                        className="link mr-2"
                        href={`/jobs/${a.id}`}
                      >
                        {a.company}
                      </Link>
                    ))}
                  </li>
                )}
                {s.unrecordedBlocks.length > 0 && (
                  <li>
                    Blocks not recorded this week: {s.unrecordedBlocks.length}{' '}
                    {s.unrecordedBlocks.slice(0, 3).map((b) => (
                      <Link
                        key={b.id}
                        className="link mr-2"
                        href={`/today?date=${b.day}`}
                      >
                        {b.title} ({weekday(b.day)})
                      </Link>
                    ))}
                  </li>
                )}
              </ul>
            </section>
          )}

          {next && (
            <section className="card" aria-labelledby="preview-heading">
              <h2 id="preview-heading">
                Next week&apos;s schedule{' '}
                <span className="muted">
                  · {next.generatedDays} of 7 days planned
                </span>
              </h2>
              {next.dsa.weak.length > 0 && (
                <p className="muted">
                  Red and yellow problems:{' '}
                  {next.dsa.weak
                    .map((p) => `${p.title} (${p.confidence.toLowerCase()})`)
                    .join(', ')}
                </p>
              )}
              {next.learning.needsReview.length > 0 && (
                <p className="muted">
                  Needs review:{' '}
                  {next.learning.needsReview.map((t) => t.title).join(', ')}
                </p>
              )}
              <div className="week-days">
                {next.days.map((d) => (
                  <div key={d.day}>
                    <strong>
                      {weekday(d.day)}{' '}
                      <span className="muted">
                        {d.generated ? 'planned' : 'from routines'}
                      </span>
                    </strong>
                    <ul className="plain-list">
                      {d.items.map((i, n) => (
                        <li key={n}>
                          {formatInTimeZone(i.start, zone, 'h:mm')}–
                          {formatInTimeZone(i.end, zone, 'h:mm a')} {i.title}
                        </li>
                      ))}
                      {!d.items.length && (
                        <li className="muted">Nothing scheduled</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="history-heading">
            <h2 id="history-heading">Past reviews</h2>
            {history.length ? (
              <ul className="plain-list">
                {history.map((h) => {
                  const m = h.weekStart.toISOString().slice(0, 10);
                  return (
                    <li key={m}>
                      <Link className="link" href={`/review?week=${m}`}>
                        Week of {range(m)}
                      </Link>{' '}
                      · {h.completedAt ? 'Completed' : 'Draft'} ·{' '}
                      {h._count.priorities} priorit
                      {h._count.priorities === 1 ? 'y' : 'ies'}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No written reviews yet.</p>
            )}
            <Disclosure
              variant="link"
              label="Reminder preference"
              className="mt-4"
            >
              <WeeklyReminderForm pref={pref} />
            </Disclosure>
          </section>
        </>
      )}
    </>
  );
}
