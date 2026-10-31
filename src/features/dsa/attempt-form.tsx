'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { attemptAction } from './actions';
import { Button } from '@/components/ui/button';

const inferred = { YES: 'GREEN', PARTIAL: 'YELLOW', NO: 'RED' } as const;
type How = keyof typeof inferred;

/**
 * Three lines (WI-091, the shape of Add a block on Today): "How did it go?" as three chips,
 * the confidence as three chips with the minutes beside them (WI-093), and the two notes
 * behind links. The answer chooses the confidence; the owner can still change it. Minutes are prefilled from a running DSA
 * session when there is one. A saved attempt remounts the form, so nothing stale stays shown.
 */
export function AttemptForm({
  problemId,
  requestId,
  defaultMinutes,
}: {
  problemId: string;
  requestId: string;
  defaultMinutes: number | null;
}) {
  // The first round uses the server's id; each later round draws its own, so a retry of one
  // submission is still deduplicated while a new attempt never is.
  const [round, setRound] = useState({ n: 0, id: requestId });
  return (
    <AttemptFields
      key={round.n}
      problemId={problemId}
      requestId={round.id}
      defaultMinutes={defaultMinutes}
      onSaved={() => setRound((r) => ({ n: r.n + 1, id: crypto.randomUUID() }))}
    />
  );
}

function AttemptFields({
  problemId,
  requestId,
  defaultMinutes,
  onSaved,
}: {
  problemId: string;
  requestId: string;
  defaultMinutes: number | null;
  onSaved: () => void;
}) {
  // Nothing is chosen until the owner answers; Save stays blocked until then.
  const [how, setHow] = useState<How | null>(null);
  const [confidence, setConfidence] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [mistakeOpen, setMistakeOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const choose = (value: How) => {
    setHow(value);
    if (!touched) setConfidence(inferred[value]);
  };
  return (
    <ActionForm
      action={attemptAction}
      label="Record attempt"
      className="dsa-form attempt-form"
      onSuccess={onSaved}
    >
      <input type="hidden" name="problemId" value={problemId} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="choice-group is-chips">
        <legend>How did it go?</legend>
        {(
          [
            ['YES', 'On my own'],
            ['PARTIAL', 'With hints'],
            ['NO', 'Needed the solution'],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`choice${how === value ? ' is-on' : ''}`}
          >
            <input
              type="radio"
              name="solvedIndependently"
              value={value}
              checked={how === value}
              onChange={() => choose(value)}
              required
            />
            {label}
          </label>
        ))}
      </fieldset>
      {/* The confidence as chips, chosen by the answer and open to change, with the minutes
          beside them (WI-093). */}
      <div className="attempt-line">
        <fieldset className="choice-group is-chips">
          <legend>Confidence now</legend>
          {(
            [
              ['GREEN', 'Solid'],
              ['YELLOW', 'Okay'],
              ['RED', 'Shaky'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`choice${confidence === value ? ' is-on' : ''}`}
            >
              <input
                type="radio"
                name="confidenceAfter"
                value={value}
                checked={confidence === value}
                onChange={() => {
                  setTouched(true);
                  setConfidence(value);
                }}
                required
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="attempt-minutes">
          Minutes{' '}
          <span className="muted">
            {defaultMinutes ? '(from the session)' : '(optional)'}
          </span>
          <input
            name="durationMinutes"
            type="number"
            min="1"
            max="1440"
            defaultValue={defaultMinutes ?? ''}
          />
        </label>
      </div>
      {/* The two notes stay behind links until there is something to write (WI-091). */}
      <div className="attempt-notes">
        {!mistakeOpen && (
          <Button
            type="button"
            variant="link"
            aria-expanded={false}
            onClick={() => setMistakeOpen(true)}
          >
            + What did you miss
          </Button>
        )}
        {!noteOpen && (
          <Button
            type="button"
            variant="link"
            aria-expanded={false}
            onClick={() => setNoteOpen(true)}
          >
            + Note
          </Button>
        )}
      </div>
      {mistakeOpen && (
        <label>
          What did you miss?
          <textarea
            name="mistake"
            rows={2}
            maxLength={1000}
            autoFocus
            placeholder="Pattern, edge case, or implementation mistake"
          />
        </label>
      )}
      {noteOpen && (
        <label>
          Note
          <textarea name="notes" rows={2} maxLength={2000} autoFocus />
        </label>
      )}
      <Button>Save attempt</Button>
    </ActionForm>
  );
}
