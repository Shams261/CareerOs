import { RumiPose } from '@/features/agent/pose';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { confidenceWord } from '@/features/dsa/words';
import { getPatterns } from '@/features/agent/tools';
import { patternLine } from '@/features/agent/plan-domain';
import { ChevronLeft, ChevronRight, ArrowRight, Briefcase } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { CategoryIcon } from '@/components/category-icon';
import { PageShortcuts } from '@/components/shortcuts';
import { UtilityMenu } from '@/features/today/utility-menu';
import { remindersPreview } from '@/features/notifications/preview';
import { dayKey, hhmm, shortDate, weekdayDate } from '@/lib/time';
import { shiftDay } from '@/lib/day';
import { BlockRowShell } from '@/features/schedule/block-row';
import {
  blockResolution,
  blockTitle,
  resolutionText,
  rowMeta,
} from '@/features/schedule/row';
import {
  closeWeekLine,
  currentWeek,
  weekSummary,
  defaultReviewWeek,
  formatMinutes,
  hasReflection,
  isMonday,
  lastReviewLine,
  lastReviewQuote,
  MAX_PRIORITIES,
  reviewSummaryLine,
  reviewWeekParam,
} from '@/features/review/domain';
import { plural } from '@/lib/copy';
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
} from '@/features/review/forms';
import { aiConfig } from '@/lib/env';
import { DraftWeekButton } from '@/features/agent/draft-button';
import { WeekSummary } from '@/features/agent/summary-card';
import { summaryOn } from '@/features/agent/summary';
import { nextWeek } from '@/features/agent/draft';
import { AGENT_NAME } from '@/features/agent/constants';
export const metadata = { title: 'Weekly review' };

const label = (day: string, pattern: string) =>
  formatInTimeZone(new Date(`${day}T12:00:00Z`), 'UTC', pattern);
/** "Week of 19 – 25 October", or "Week of 26 October – 1 November" across a month. */
const weekLabel = (monday: string) => {
  const sunday = shiftDay(monday, 6);
  return label(monday, 'MMMM') === label(sunday, 'MMMM')
    ? `Week of ${label(monday, 'd')} – ${label(sunday, 'd MMMM')}`
    : `Week of ${label(monday, 'd MMMM')} – ${label(sunday, 'd MMMM')}`;
};
/** "19 – 25 Oct", or "26 Oct – 1 Nov": the title's label, as on Plan (WI-097). */
const shortWeekLabel = (monday: string) => {
  const sunday = shiftDay(monday, 6);
  return label(monday, 'MMM') === label(sunday, 'MMM')
    ? `${label(monday, 'd')} – ${label(sunday, 'd MMM')}`
    : `${label(monday, 'd MMM')} – ${label(sunday, 'd MMM')}`;
};
const weekday = (day: string) => label(day, 'EEE');
const symbol = {
  done: ['✓', 'done'],
  skipped: ['–', 'skipped'],
  cancelled: ['×', 'cancelled'],
  unrecorded: ['!', 'not recorded'],
  'needs-update': ['!', 'recorded, needs update'],
  planned: ['○', 'planned'],
} as const;
// "The week", not "This week": a past week's step must not share the header's button's name.
const STEPS = [
  ['week', 'The week'],
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
    <div className="review-bar">
      <div className="row">
        <strong>{label}</strong>
        <span className="muted">
          Planned {formatMinutes(planned)} · Actual {formatMinutes(actual)}
        </span>
      </div>
      <div className="review-bar-track" aria-hidden="true">
        <span className="review-bar-planned" style={{ width: pct(planned) }} />
        <span className="review-bar-actual" style={{ width: pct(actual) }} />
      </div>
    </div>
  );
}
const Fact = ({ label, value }: { label: string; value: ReactNode }) => (
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
  // Any real day snaps to its Monday; a date that does not exist falls back (WI-097).
  const monday = reviewWeekParam(
    query.week,
    defaultReviewWeek(today, lastWeekCompleted),
  );
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
  const [
    w,
    carry,
    next,
    trend,
    history,
    goals,
    reminders,
    habits,
    summaryShown,
  ] = await Promise.all([
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
    plan ? remindersPreview(user, nextMonday) : [],
    // WI-041: the owner's patterns over the last four weeks, on the first two steps.
    step === 'week' || step === 'reflect' ? getPatterns(user, now) : null,
    // WI-110: the summary button shows on step one while Rumi writes the lines.
    step === 'week' ? summaryOn(user) : false,
  ]);
  const habitLine = habits ? patternLine(habits) : null;
  const summary = weekSummary(w.schedule.days);
  const s = w.schedule;
  const weekEmpty = s.totals.planned === 0 && s.focus.actual === 0;
  const max = Math.max(
    s.focus.planned,
    s.focus.actual,
    ...s.rows.map((r) => Math.max(r.planned, r.actual)),
    1,
  );
  // The review looks back: › stops at this week (WI-097).
  const hasNext = monday < thisWeek;
  const priorities = w.review?.priorities ?? [];
  const remindersOn = reminders.filter((r) => r.on);
  const lastQuote = w.lastReview ? lastReviewQuote(w.lastReview) : null;
  const status = w.review?.completedAt
    ? 'Completed'
    : w.review
      ? 'Draft'
      : 'Not started';
  const href = (to: Step, week = monday) =>
    `/review?week=${week}${to === 'week' ? '' : `&step=${to}`}`;
  const weekWord = w.isCurrent
    ? 'This week'
    : monday > thisWeek
      ? 'Upcoming week'
      : openLastWeek
        ? 'Last week, not yet reviewed'
        : 'Past week';
  return (
    <>
      <PageShortcuts
        shortcuts={[]}
        prev={href(step, shiftDay(monday, -7))}
        next={hasNext ? href(step, nextMonday) : undefined}
      />
      <header className="today-head is-review">
        <div className="today-head-row">
          <div className="today-title">
            <h1>Weekly review</h1>
            <span className="today-date" aria-label={weekLabel(monday)}>
              {shortWeekLabel(monday)}
            </span>
            <nav className="day-nav" aria-label="Week navigation">
              <Link
                className="button secondary small day-nav-step"
                href={href(step, shiftDay(monday, -7))}
                aria-label="Earlier week"
                prefetch={false}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Link>
              {/* Earlier / Later, so the stepper's Next week keeps its name to itself. */}
              {hasNext && (
                <Link
                  className="button secondary small day-nav-step"
                  href={href(step, nextMonday)}
                  aria-label="Later week"
                  prefetch={false}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
              {monday !== thisWeek && (
                <Link
                  className="button secondary small"
                  href={href(step, thisWeek)}
                  prefetch={false}
                >
                  This week
                </Link>
              )}
            </nav>
          </div>
          <UtilityMenu>
            <Link
              className="link-button today-util"
              href={href('details')}
              aria-current={step === 'details' ? 'page' : undefined}
              prefetch={false}
            >
              Details
            </Link>
            <Link
              className="link-button today-util"
              href="/review/look-back"
              prefetch={false}
            >
              Look back
            </Link>
          </UtilityMenu>
        </div>
        <p className="today-summary">
          {/* One span: the summary is a flex row and would wrap at every text node. */}
          <span>
            <span className="review-week-phone">
              {shortWeekLabel(monday)} ·{' '}
            </span>
            {weekWord} · {reviewSummaryLine(status, s.totals, s.focus.actual)}
          </span>
        </p>
      </header>
      <nav className="stepper" aria-label="Review steps">
        {STEPS.map(([key, title], i) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={step === key ? 'step' : undefined}
            prefetch={false}
          >
            <span className="step-number" aria-hidden="true">
              {i + 1}
            </span>
            {title}
          </Link>
        ))}
      </nav>

      {step === 'week' && weekEmpty && (
        // An empty week says what to do and what this step will show (WI-059).
        <section className="card setup-card" aria-labelledby="week-heading">
          <RumiPose pose="sitting" size={104} className="setup-pose" />
          <p className="eyebrow">Start here</p>
          <h2 id="week-heading">Nothing planned this week</h2>
          <p>
            Once blocks are planned, this shows planned against recorded time
            for each day, and what is left to decide.
          </p>
          <div className="actions">
            <Link className="button" href="/calendar" prefetch={false}>
              Plan this week <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link
              prefetch={false}
              className="button secondary"
              href={href('reflect')}
            >
              Reflect anyway
            </Link>
          </div>
        </section>
      )}
      {step === 'week' && !weekEmpty && (
        <>
          <section className="card" aria-labelledby="week-heading">
            <h2 id="week-heading">Planned versus done</h2>
            {/* One facts line instead of a third copy of the bar (WI-097). */}
            <p className="status-line review-facts">
              <strong>{formatMinutes(s.focus.actual)} focused</strong> of{' '}
              {formatMinutes(s.focus.planned)} planned
            </p>
            <div
              className="week-chart mt-4"
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
            {habitLine && <p className="review-patterns">{habitLine}</p>}
            {/* A summary, not the week again (WI-054): what is left to decide, then a
                way to every day. */}
            {/* WI-110: Rumi's two sentences above the summary, on a press. */}
            {summaryShown && <WeekSummary monday={monday} />}
            <section
              className="review-summary"
              aria-labelledby="summary-heading"
            >
              <h3 id="summary-heading">
                The week in short{' '}
                <span className="muted">· {summary.line}</span>
              </h3>
              {s.rows.length > 0 && (
                <ul className="plain-list review-kinds">
                  {s.rows.map((r) => (
                    <li key={r.label}>
                      <span>{r.label}</span>
                      <span className="muted">
                        {formatMinutes(r.actual)} recorded of{' '}
                        {formatMinutes(r.planned)} planned
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.open.length > 0 && (
                <>
                  <h4>Still to decide</h4>
                  <ol className="plain-list agenda-rows">
                    {summary.open.map(({ day, item: b }) => {
                      const resolution = blockResolution(b, now);
                      return (
                        <BlockRowShell
                          key={b.id}
                          resolution={resolution}
                          time={hhmm(b.plannedStart, zone)}
                          icon={
                            b.interviewRoundId ? (
                              <Briefcase
                                size={16}
                                aria-hidden="true"
                                className="category-icon"
                              />
                            ) : (
                              <CategoryIcon category={b.category} size={16} />
                            )
                          }
                          title={
                            <Link href={`/today?date=${day}`} prefetch={false}>
                              {blockTitle(b, null)}
                            </Link>
                          }
                          meta={`${weekday(day)} · ${rowMeta(b, null, now, zone)}`}
                          status={resolutionText[resolution]}
                        />
                      );
                    })}
                  </ol>
                  {summary.more > 0 && (
                    <p className="muted">And {summary.more} more.</p>
                  )}
                </>
              )}
            </section>
            <div className="step-foot">
              <Link
                className="button secondary"
                href={`/calendar?date=${monday}`}
                prefetch={false}
              >
                See every day on Plan
              </Link>
              <Link prefetch={false} className="button" href={href('reflect')}>
                Next: Reflect <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </>
      )}

      {step === 'reflect' && (
        // The prompts in one column; the week's facts stay in view in a rail (WI-097).
        <div className="today-workspace is-today review-workspace">
          <div className="jobs-main">
            <section className="card" aria-labelledby="reflect-heading">
              <h2 id="reflect-heading">
                Reflection{' '}
                <span className="muted">· all five are optional</span>
              </h2>
              <ReviewForm key={monday} weekStart={monday} review={w.review} />
            </section>
          </div>
          <aside
            className="today-rail"
            aria-label="The week beside the reflection"
          >
            <section
              className="card rail-card has-corner-pose"
              aria-labelledby="facts-heading"
            >
              <RumiPose pose="writing" size={64} className="corner-pose" />
              <h2 id="facts-heading">The week in short</h2>
              <p className="muted review-rail-line">{summary.line}</p>
              {s.rows.length > 0 && (
                <ul className="plain-list review-kinds">
                  {s.rows.map((r) => (
                    <li key={r.label}>
                      <span>{r.label}</span>
                      <span className="muted">
                        {formatMinutes(r.actual)} of {formatMinutes(r.planned)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.open.length > 0 && (
                <ul className="plain-list rail-list review-open">
                  {summary.open.map(({ day, item: b }) => (
                    <li key={b.id} className="rail-item">
                      <strong>{resolutionText[blockResolution(b, now)]}</strong>
                      <span className="muted">
                        {' '}
                        · {blockTitle(b, null)}, {weekday(day)}{' '}
                        {hhmm(b.plannedStart, zone)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {habitLine && <p className="review-patterns">{habitLine}</p>}
            </section>
            {w.commitments.length > 0 && (
              <section
                className="card rail-card"
                aria-labelledby="commit-heading"
              >
                <h2 id="commit-heading">What you set out to do</h2>
                <PriorityList priorities={w.commitments} editable={false} />
              </section>
            )}
          </aside>
        </div>
      )}

      {step === 'plan' && (
        // Priorities and next week on the left; closing the week in the rail (WI-097).
        <div className="today-workspace is-today review-workspace">
          <div className="jobs-main">
            <section className="card" aria-labelledby="priorities-heading">
              <h2 id="priorities-heading">
                Priorities · {shortWeekLabel(nextMonday)}{' '}
                <span className="muted">
                  · {priorities.length} of {MAX_PRIORITIES}
                </span>
              </h2>
              <PriorityList priorities={priorities} editable />
              <PriorityForm
                weekStart={monday}
                count={priorities.length}
                goals={goals}
              />
              {!planning && (
                <p className="status-line mt-5">
                  <span>
                    The week after this one is already planned. Prepare is for
                    the coming week.
                  </span>
                  <Link
                    prefetch={false}
                    className="link"
                    href={href('plan', thisWeek)}
                  >
                    Open this week&apos;s review{' '}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </p>
              )}
            </section>
            {next && (
              <section className="card" aria-labelledby="next-heading">
                <h2 id="next-heading">
                  Next week · {shortWeekLabel(nextMonday)}
                </h2>
                {next.jobs.interviews.length > 0 && (
                  <ul className="plain-list next-rows">
                    {next.jobs.interviews.map((i) => (
                      <li key={i.id} className="next-row">
                        <span className="next-row-when">
                          {weekdayDate(dayKey(i.start, zone))} ·{' '}
                          {hhmm(i.start, zone)}
                        </span>
                        <Link
                          className="link"
                          href={`/jobs/${i.applicationId}#round-${i.id}`}
                          prefetch={false}
                        >
                          Prepare {i.title}
                        </Link>
                        <span className="muted">
                          {i.company}
                          {i.prepTotal
                            ? ` · ${i.prepDone} of ${i.prepTotal} prep done`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {next.jobs.followUps.length > 0 && (
                  <ul className="plain-list next-rows">
                    {next.jobs.followUps.map((a) => (
                      <li key={a.id} className="next-row">
                        <span className="next-row-when">
                          {weekdayDate(
                            a.nextActionDate!.toISOString().slice(0, 10),
                          )}
                        </span>
                        <Link
                          className="link"
                          href={`/jobs/${a.id}`}
                          prefetch={false}
                        >
                          {a.nextAction ?? 'Follow up'}
                        </Link>
                        <span className="muted">{a.company}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* The facts that matter for planning; the reminders fold in (WI-097). */}
                <dl className="job-facts review-strip">
                  <Fact
                    label="Days planned"
                    value={`${next.generatedDays} of 7`}
                  />
                  {next.dsa.topic && (
                    <Fact label="DSA topic" value={next.dsa.topic} />
                  )}
                  <Fact
                    label="DSA revisions due"
                    value={next.dsa.revisionsDue}
                  />
                  {next.learning.reviewsDue > 0 && (
                    <Fact
                      label="Technical reviews due"
                      value={next.learning.reviewsDue}
                    />
                  )}
                  <Fact
                    label="Applications needing action"
                    value={next.jobs.actionRequired}
                  />
                  <Fact
                    label="Reminders on"
                    value={
                      <>
                        {remindersOn.length
                          ? remindersOn.map((r) => r.title).join(', ')
                          : 'None'}{' '}
                        ·{' '}
                        <Link
                          prefetch={false}
                          className="link"
                          href="/settings#notifications-heading"
                        >
                          Change
                        </Link>
                      </>
                    }
                  />
                </dl>
                <PrepareNextWeekForm monday={next.bounds.monday} />
                {/* WI-107: once the routines are on next week, Rumi drafts around them. */}
                {aiConfig() &&
                  // Only the real next week: the draft plans from today.
                  nextMonday === nextWeek(today)[0] &&
                  (next.generatedDays === 7 ? (
                    <DraftWeekButton />
                  ) : (
                    <p className="prep-note">
                      Prepare next week first; then {AGENT_NAME} can draft the
                      study blocks around your routines.
                    </p>
                  ))}
              </section>
            )}
          </div>
          <aside className="today-rail" aria-label="Closing the week">
            <section
              className="card rail-card close-week has-corner-pose"
              aria-labelledby="close-heading"
            >
              <RumiPose pose="high-five" size={64} className="corner-pose" />
              <h2 id="close-heading">Close the week</h2>
              <p className="review-rail-line">
                {closeWeekLine({
                  completed: !!w.review?.completedAt,
                  reflected: hasReflection(w.review),
                  priorities: priorities.length,
                  generatedDays: next ? next.generatedDays : null,
                })}
              </p>
              <CompleteReviewForm
                weekStart={monday}
                completedAt={w.review?.completedAt ?? null}
              />
            </section>
            {w.lastReview && (
              <section
                className="card rail-card"
                aria-labelledby="last-heading"
              >
                <h2 id="last-heading">Last week&apos;s review</h2>
                <p className="review-rail-line">
                  {lastReviewLine(w.lastReview)}
                </p>
                {lastQuote && (
                  <p className="muted review-quote">“{lastQuote}”</p>
                )}
                <Link
                  prefetch={false}
                  className="link"
                  href={href('reflect', shiftDay(monday, -7))}
                >
                  Open last week
                </Link>
              </section>
            )}
          </aside>
        </div>
      )}

      {step === 'details' && (
        <>
          <section className="card" aria-labelledby="execution-heading">
            <h2 id="execution-heading">Execution</h2>
            <dl className="job-facts">
              <Fact label="Planned blocks" value={s.totals.planned} />
              <Fact label="Done" value={s.totals.completed} />
              <Fact label="Skipped" value={s.totals.skipped} />
              <Fact label="Cancelled" value={s.totals.cancelled} />
              <Fact
                label="Not recorded"
                value={s.totals.unrecorded - s.totals.needsUpdate}
              />
              <Fact
                label="Recorded, needs update"
                value={s.totals.needsUpdate}
              />
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
                    <span className="muted">{shortDate(d.day)}</span>
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
                      {r.label}: {r.completed} done · {r.planned} planned
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
                <ul className="plain-list review-kinds">
                  {trend.map((t) => (
                    <li key={t.monday}>
                      <span>Week of {shortDate(t.monday)}</span>
                      <span className="muted">
                        {formatMinutes(t.focus)} focus ·{' '}
                        {plural(t.applications, 'application')}
                      </span>
                    </li>
                  ))}
                </ul>
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
                ['Shaky to Okay', w.dsa.redToYellow],
                ['Okay to Solid', w.dsa.yellowToGreen],
                ['Revisions missed', w.dsa.missed],
              ]}
            />
            {w.dsa.attempts > 0 && (
              <p className="muted">
                Practice now:{' '}
                {(['RED', 'YELLOW', 'GREEN'] as const)
                  .map(
                    (k) =>
                      `${w.dsa.current[k]} ${confidenceWord(k).toLowerCase()}`,
                  )
                  .join(' · ')}
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
                        prefetch={false}
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
                    DSA revisions missed, ladder still on: {carry.dsa.length}{' '}
                    {carry.dsa.slice(0, 3).map((p) => (
                      <Link
                        prefetch={false}
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
                        prefetch={false}
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
                        prefetch={false}
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
                        prefetch={false}
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
                <p className="status-line">
                  Shaky and okay problems:{' '}
                  {next.dsa.weak
                    .map(
                      (p) =>
                        `${p.title} (${confidenceWord(p.confidence).toLowerCase()})`,
                    )
                    .join(', ')}
                </p>
              )}
              {next.learning.needsReview.length > 0 && (
                <p className="status-line">
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
                          {formatInTimeZone(i.start, zone, 'HH:mm')}–
                          {formatInTimeZone(i.end, zone, 'HH:mm')} {i.title}
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
                      <Link
                        prefetch={false}
                        className="link"
                        href={`/review?week=${m}`}
                      >
                        {weekLabel(m)}
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
            <p className="status-line mt-4">
              <Link
                prefetch={false}
                className="link"
                href="/settings#notifications-heading"
              >
                Reminder preference in Settings
              </Link>
            </p>
          </section>
        </>
      )}
    </>
  );
}
