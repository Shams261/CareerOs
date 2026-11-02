import Link from 'next/link';
import { confidenceWord } from '@/features/dsa/words';
import { hhmm, shortDate } from '@/lib/time';
import { formatMinutes } from '../domain';
import { plural } from '@/lib/copy';
import { symbol, weekday, weekLabel } from '../labels';
import { Bar, Fact, Facts } from './parts';
import type { ReviewView } from '../page-data';

/** Details: every count, day by day, progress, what is still open, past reviews. */
export function DetailsStep({ v }: { v: ReviewView }) {
  const { zone, w, s, carry, next, trend, history, max } = v;
  return (
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
          <Fact label="Recorded, needs update" value={s.totals.needsUpdate} />
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
                (k) => `${w.dsa.current[k]} ${confidenceWord(k).toLowerCase()}`,
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
                      {hhmm(i.start, zone)}–{hhmm(i.end, zone)} {i.title}
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
  );
}
