import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { hhmm } from '@/lib/time';
import {
  blockResolution,
  blockTitle,
  resolutionText,
  rowMeta,
  type RowBlock,
} from '@/features/schedule/row';
import { closeDayAction } from './actions';
import {
  choicesFor,
  leftKind,
  moveLabel,
  NOTE_MAX,
  type Interval,
} from './domain';

type Round = {
  id: string;
  title: string;
  company: string;
  applicationId: string;
};
type Block = RowBlock & { updatedAt: Date };

/**
 * Close the Day (WI-029): what happened, one line to remember, and a decision for each block
 * still left. One form, so nothing changes until Close the day is pressed.
 */
export function CloseDayForm({
  day,
  zone,
  now,
  blocks,
  rounds,
  summary,
  note,
  rested,
  running,
  target,
  slots,
  isToday,
}: {
  day: string;
  zone: string;
  now: Date;
  blocks: Block[];
  rounds: Round[];
  summary: string;
  note: string;
  rested: boolean;
  running: boolean;
  target: string;
  slots: Map<string, (Interval & { same: boolean }) | null>;
  isToday: boolean;
}) {
  const when = isToday ? 'today' : 'that day';
  const roundOf = (b: Block) =>
    b.interviewRoundId
      ? (rounds.find((r) => r.id === b.interviewRoundId) ?? null)
      : null;
  const live = blocks.filter((b) => b.status !== 'CANCELLED');
  const left = live.filter((b) => leftKind(b, now));
  const window = (b: Block) =>
    `${hhmm(b.plannedStart, zone)}–${hhmm(b.plannedEnd, zone)}`;
  return (
    <ActionForm
      action={closeDayAction}
      label="Close the day"
      className="close-day"
      broadcast="review"
      closeOnSuccess
    >
      <input type="hidden" name="day" value={day} />
      <section className="close-step" aria-labelledby="close-happened">
        <h3 id="close-happened">
          <span className="close-step-n">1</span> What happened
        </h3>
        {live.length ? (
          <>
            <p className="muted">{summary}</p>
            <ul className="close-list">
              {live.map((b) => (
                <li key={b.id}>
                  <span className="close-time">
                    {hhmm(b.plannedStart, zone)}
                  </span>
                  <span className="close-title">
                    {blockTitle(b, roundOf(b))}
                    <span className="muted">
                      {rowMeta(b, roundOf(b), now, zone)}
                    </span>
                  </span>
                  <span className="close-state">
                    {resolutionText[blockResolution(b, now)]}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{rested ? `Rested ${when}.` : `Nothing was planned ${when}.`}</p>
        )}
        {rested && live.length > 0 && <p>Rested {when}.</p>}
      </section>
      <section className="close-step" aria-labelledby="close-note">
        <h3 id="close-note">
          <span className="close-step-n">2</span> Anything to remember?
        </h3>
        <label>
          One line (optional)
          <input name="note" maxLength={NOTE_MAX} defaultValue={note} />
        </label>
      </section>
      <section className="close-step" aria-labelledby="close-left">
        <h3 id="close-left">
          <span className="close-step-n">3</span> What is left
        </h3>
        {left.length ? (
          left.map((b) => {
            const kind = leftKind(b, now)!;
            const slot = slots.get(b.id) ?? null;
            return (
              <fieldset className="close-choice" key={b.id}>
                <legend>
                  {blockTitle(b, roundOf(b))}
                  <span className="muted"> · {window(b)}</span>
                </legend>
                <input
                  type="hidden"
                  name={`version-${b.id}`}
                  value={b.updatedAt.toISOString()}
                />
                {slot && (
                  <input
                    type="hidden"
                    name={`slot-${b.id}`}
                    value={slot.start.toISOString()}
                  />
                )}
                {b.interviewRoundId && kind === 'unrecorded' && (
                  <p className="muted">
                    An interview keeps its time.{' '}
                    {roundOf(b) && (
                      <Link
                        className="link"
                        href={`/jobs/${roundOf(b)!.applicationId}#round-${b.interviewRoundId}`}
                        prefetch={false}
                      >
                        Log its result
                      </Link>
                    )}
                  </p>
                )}
                {choicesFor(kind, !!b.interviewRoundId).map((c) => (
                  <label className="check close-option" key={c}>
                    <input
                      type="radio"
                      name={`choice-${b.id}`}
                      value={c}
                      required
                      disabled={c === 'tomorrow' && !slot}
                    />
                    <span>
                      {c === 'tomorrow'
                        ? 'Tomorrow'
                        : c === 'letgo'
                          ? 'Let go'
                          : 'Done'}
                      <span className="muted">
                        {c === 'tomorrow'
                          ? moveLabel(slot, b.plannedStart, target, zone)
                          : c === 'letgo'
                            ? 'Marked skipped: Let go'
                            : rowMeta(b, roundOf(b), now, zone)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })
        ) : (
          <p>Nothing left. Every block has a decision.</p>
        )}
      </section>
      {running && (
        <p className="form-message" role="status">
          Pause the running session before closing the day.
        </p>
      )}
      <Button disabled={running}>Close the day</Button>
    </ActionForm>
  );
}
