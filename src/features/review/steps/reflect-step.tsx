import { RumiPose } from '@/features/agent/pose';
import { hhmm } from '@/lib/time';
import {
  blockResolution,
  blockTitle,
  resolutionText,
} from '@/features/schedule/row';
import { formatMinutes } from '../domain';
import { PriorityList, ReviewForm } from '../forms';
import { weekday } from '../labels';
import type { ReviewView } from '../page-data';

/** Step 2, Reflect: the prompts, with the week's facts in a rail (WI-097). */
export function ReflectStep({ v }: { v: ReviewView }) {
  const { now, zone, monday, w, s, habitLine, summary } = v;
  return (
    // The prompts in one column; the week's facts stay in view in a rail (WI-097).
    <div className="today-workspace is-today review-workspace">
      <div className="jobs-main">
        <section className="card" aria-labelledby="reflect-heading">
          <h2 id="reflect-heading">
            Reflection <span className="muted">· all five are optional</span>
          </h2>
          <ReviewForm key={monday} weekStart={monday} review={w.review} />
        </section>
      </div>
      <aside className="today-rail" aria-label="The week beside the reflection">
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
          <section className="card rail-card" aria-labelledby="commit-heading">
            <h2 id="commit-heading">What you set out to do</h2>
            <PriorityList priorities={w.commitments} editable={false} />
          </section>
        )}
      </aside>
    </div>
  );
}
