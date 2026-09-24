import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { db, owner } from '@/server/db';
import { dayKey } from '@/lib/time';
import { shiftDay } from '@/features/schedule/domain';
import {
  currentWeek,
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
  PrepareNextWeekForm,
  PriorityForm,
  PriorityList,
  ReviewForm,
  WeeklyReminderForm,
} from '@/features/review/forms';

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

export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await owner(),
    now = new Date(),
    zone = user.timezone,
    query = await searchParams;
  const thisWeek = currentWeek(now, zone);
  const monday =
    query.week && /^\d{4}-\d{2}-\d{2}$/.test(query.week)
      ? isMonday(query.week)
        ? query.week
        : weekOf(query.week)
      : thisWeek;
  const nextMonday = shiftDay(monday, 7);
  const planning = monday >= thisWeek;
  const [w, carry, next, trend, history, goals, pref] = await Promise.all([
    weekReview(user, monday, now),
    carryForward(user, now),
    planning ? nextWeekContext(user, nextMonday, now) : null,
    recentTrend(user, monday, now),
    reviewHistory(user.id),
    db().goal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    }),
    db().notificationPreference.findUnique({
      where: { userId_type: { userId: user.id, type: 'WEEKLY_REVIEW' } },
    }),
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
  return (
    <>
      <p className="eyebrow">
        Weekly review ·{' '}
        {w.isCurrent
          ? 'This week'
          : monday > thisWeek
            ? 'Upcoming week'
            : 'Past week'}{' '}
        · {zone}
      </p>
      <h1>Week of {range(monday)}</h1>
      <div className="row flex-wrap mb-5">
        <Link
          className="button secondary"
          href={`/review?week=${shiftDay(monday, -7)}`}
        >
          ← Previous week
        </Link>
        <span className="pill">{status}</span>
        {monday !== thisWeek && (
          <Link className="button secondary" href="/review">
            This week
          </Link>
        )}
        <Link className="button secondary" href={`/review?week=${nextMonday}`}>
          Next week →
        </Link>
      </div>
      <p className="muted mb-5">
        Facts below are derived live from your recorded history, so they update
        if you log something late. Only your written review and priorities are
        stored.
      </p>

      <section className="card" aria-labelledby="execution-heading">
        <h2 id="execution-heading">Execution</h2>
        <dl className="job-facts">
          <Fact label="Planned blocks" value={s.totals.planned} />
          <Fact label="Completed" value={s.totals.completed} />
          <Fact label="Skipped" value={s.totals.skipped} />
          <Fact label="Cancelled" value={s.totals.cancelled} />
          <Fact label="Not recorded" value={s.totals.unrecorded} />
        </dl>
        <h3 className="mt-4">Planned vs actual</h3>
        <Bar
          label="Focused preparation"
          planned={s.focus.planned}
          actual={s.focus.actual}
          max={max}
        />
        {s.rows.map((r) => (
          <Bar key={r.label} {...r} max={max} />
        ))}
        <p className="muted">
          Focus excludes Work, Gym and Personal. Actual time comes only from
          recorded sessions.
        </p>
        <h3 className="mt-4">Day by day</h3>
        <div className="week-days">
          {s.days.map((d) => (
            <div key={d.day}>
              <strong>
                {weekday(d.day)} <span className="muted">{d.day.slice(5)}</span>
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
            <h3 className="mt-4">Routine execution</h3>
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
        <h3 className="mt-4">Recent weeks</h3>
        <p className="muted">
          {trend
            .map(
              (t) =>
                `${t.monday.slice(5)}: ${formatMinutes(t.focus)} focus, ${t.applications} applications`,
            )
            .join(' · ')}
        </p>
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
        <dl className="job-facts">
          <Fact label="Attempts" value={w.dsa.attempts} />
          <Fact label="Problems" value={w.dsa.uniqueProblems} />
          <Fact label="New" value={w.dsa.newProblems} />
          <Fact label="Revisions" value={w.dsa.revisionAttempts} />
          <Fact label="Red → Yellow" value={w.dsa.redToYellow} />
          <Fact label="Yellow → Green" value={w.dsa.yellowToGreen} />
          <Fact
            label="Now R / Y / G"
            value={`${w.dsa.current.RED} / ${w.dsa.current.YELLOW} / ${w.dsa.current.GREEN}`}
          />
          <Fact label="Revisions overdue" value={w.dsa.overdue} />
        </dl>
        <h3 className="mt-4">
          Technical learning
          {w.learning.subject ? ` · focus ${w.learning.subject}` : ''}
        </h3>
        <dl className="job-facts">
          <Fact label="Activities" value={w.learning.activities} />
          <Fact label="Topics studied" value={w.learning.studied} />
          <Fact label="Topics reviewed" value={w.learning.reviewed} />
          <Fact label="Became interview ready" value={w.learning.becameReady} />
          <Fact label="Back to needs review" value={w.learning.regressed} />
        </dl>
        <h3 className="mt-4">Job search</h3>
        <dl className="job-facts">
          <Fact label="Applications submitted" value={w.jobs.submitted} />
          <Fact label="Recruiter screens" value={w.jobs.recruiter} />
          <Fact label="Assessments" value={w.jobs.assessment} />
          <Fact label="Technical" value={w.jobs.technical} />
          <Fact label="System design" value={w.jobs.systemDesign} />
          <Fact label="Behavioral" value={w.jobs.behavioral} />
          <Fact label="Final rounds" value={w.jobs.final} />
          <Fact label="Interviews completed" value={w.jobs.completed} />
          <Fact label="Follow-ups done" value={w.jobs.followUpsDone} />
          <Fact label="Offers" value={w.jobs.offers} />
          <Fact label="Rejections" value={w.jobs.rejections} />
          <Fact label="Active now" value={w.jobs.active} />
          <Fact label="Waiting on company" value={w.jobs.waiting} />
          <Fact label="Action required" value={w.jobs.actionRequired} />
        </dl>
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

      <section className="card" aria-labelledby="carry-heading">
        <h2 id="carry-heading">Carry forward · as of today</h2>
        <ul className="plain-list">
          <li>
            DSA revisions overdue: {carry.dsa.length}{' '}
            {carry.dsa.slice(0, 3).map((p) => (
              <Link key={p.id} className="link mr-2" href={`/dsa/${p.id}`}>
                {p.title}
              </Link>
            ))}
          </li>
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
          <li>
            Job follow-ups overdue: {carry.jobs.length}{' '}
            {carry.jobs.slice(0, 3).map((a) => (
              <Link key={a.id} className="link mr-2" href={`/jobs/${a.id}`}>
                {a.company}
              </Link>
            ))}
          </li>
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
        </ul>
      </section>

      {w.commitments.length > 0 && (
        <section className="card" aria-labelledby="commit-heading">
          <h2 id="commit-heading">
            This week&apos;s priorities (chosen last week)
          </h2>
          <PriorityList priorities={w.commitments} editable={false} />
        </section>
      )}

      <section className="card" aria-labelledby="reflect-heading">
        <h2 id="reflect-heading">Reflection</h2>
        <ReviewForm key={monday} weekStart={monday} review={w.review} />
      </section>

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
                    {i.topics.length
                      ? ` · ${i.topics.map((t) => t.title).join(', ')}`
                      : ''}
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
              label="Next new topic"
              value={next.learning.nextTopic?.title ?? '—'}
            />
            <Fact
              label="Applications needing action"
              value={next.jobs.actionRequired}
            />
          </dl>
          {next.dsa.weak.length > 0 && (
            <p className="muted">
              Red/Yellow problems:{' '}
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
          <h3 className="mt-4">
            Schedule{' '}
            <span className="muted">
              · {next.generatedDays} of 7 days generated
              {next.generatedDays < 7 ? '; others show your routines' : ''}
            </span>
          </h3>
          <div className="week-days">
            {next.days.map((d) => (
              <div key={d.day}>
                <strong>
                  {weekday(d.day)}{' '}
                  <span className="muted">
                    {d.generated ? 'planned' : 'routine preview'}
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
          <p className="muted">
            Routines are templates; change them on{' '}
            <Link className="link" href="/calendar">
              Calendar
            </Link>
            . Priorities are never scheduled automatically: add a block on a day
            from{' '}
            <Link className="link" href={`/today?date=${next.bounds.monday}`}>
              Today
            </Link>{' '}
            if you want one.
          </p>
          <PrepareNextWeekForm monday={next.bounds.monday} />
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
                  {h._count.priorities} priorities
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No written reviews yet.</p>
        )}
        <details className="mt-4">
          <summary>Weekly review reminder</summary>
          <WeeklyReminderForm pref={pref} />
        </details>
        <p className="muted mt-4">
          Today: {dayKey(now, zone)}. Daily check-ins stay on Today; this page
          is the weekly loop.
        </p>
      </section>
    </>
  );
}
