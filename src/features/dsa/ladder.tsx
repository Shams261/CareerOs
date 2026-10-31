import { Check, X } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { shortDate } from '@/lib/time';
import { markRevisedAction, startRevisionAction } from './actions';
import { LADDER_DAYS, type LadderState } from './domain';

/**
 * The revision ladder on a problem page (WI-094): three steps, 3 · 7 · 14 days from the day
 * it was solved, each Revised, Missed, Due today or waiting, and the one action that fits:
 * Mark revised on the open step, or Start revision on a problem attempted before the ladder.
 */
export function RevisionLadder({
  problemId,
  ladder,
  today,
}: {
  problemId: string;
  ladder: LadderState;
  today: string;
}) {
  if (ladder.state === 'unattempted') return null;
  return (
    <section className="ladder" aria-labelledby="ladder-heading">
      <div className="ladder-head">
        <h2 id="ladder-heading" className="ladder-title">
          Revision ladder{' '}
          <span className="muted">· {LADDER_DAYS.join(' · ')} days</span>
        </h2>
        {ladder.state === 'none' && (
          <ActionForm action={startRevisionAction} label="Start revision">
            <input type="hidden" name="id" value={problemId} />
            <Button variant="secondary" className="small">
              Start revision
            </Button>
          </ActionForm>
        )}
        {ladder.step && (
          <ActionForm
            action={markRevisedAction}
            label={`Mark revision ${ladder.step} revised`}
          >
            <input type="hidden" name="id" value={problemId} />
            <Button
              variant={ladder.state === 'due' ? 'primary' : 'secondary'}
              className="small"
            >
              Mark revised
            </Button>
          </ActionForm>
        )}
      </div>
      {ladder.state === 'none' ? (
        <p className="muted ladder-note">
          Start the ladder and the three revisions land on their days from
          today.
        </p>
      ) : (
        <ol className="ladder-steps">
          {ladder.steps.map((s) => (
            <li key={s.n} className={`ladder-step is-${s.outcome}`}>
              <span className="ladder-step-n" aria-hidden="true">
                {s.outcome === 'revised' ? (
                  <Check size={14} />
                ) : s.outcome === 'missed' ? (
                  <X size={14} />
                ) : (
                  s.n
                )}
              </span>
              <span className="ladder-step-body">
                <b>Revision {s.n}</b>
                <span>
                  {s.outcome === 'revised'
                    ? `Revised · ${shortDate(s.due)}`
                    : s.outcome === 'missed'
                      ? `Missed · ${shortDate(s.due)}`
                      : s.outcome === 'due'
                        ? s.due === today
                          ? 'Due today'
                          : `Due · ${shortDate(s.due)}`
                        : shortDate(s.due)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
