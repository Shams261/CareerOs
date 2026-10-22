'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { attemptAction } from './actions';
import { Button } from '@/components/ui/button';

const inferred = { YES: 'GREEN', PARTIAL: 'YELLOW', NO: 'RED' } as const;
type How = keyof typeof inferred;

/**
 * One question ("How did it go?") sets the confidence default; the owner can still change it.
 * Minutes are prefilled from a running DSA session when there is one.
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
  // Nothing is chosen until the owner answers; Save stays blocked until then.
  const [how, setHow] = useState<How | null>(null);
  const [confidence, setConfidence] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const choose = (value: How) => {
    setHow(value);
    if (!touched) setConfidence(inferred[value]);
  };
  return (
    <ActionForm
      action={attemptAction}
      label="Record attempt"
      className="dsa-form"
      resetOnSuccess
      onSuccess={() => {
        setHow(null);
        setConfidence('');
        setTouched(false);
      }}
    >
      <input type="hidden" name="problemId" value={problemId} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="choice-group">
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
      <div className="form-grid">
        <label>
          Confidence now{' '}
          <span className="muted">
            (set from your answer; change if needed)
          </span>
          <select
            name="confidenceAfter"
            required
            value={confidence}
            onChange={(e) => {
              setTouched(true);
              setConfidence(e.target.value);
            }}
          >
            <option value="" disabled>
              Answer above first
            </option>
            <option value="GREEN">Green — can solve and explain it</option>
            <option value="YELLOW">
              Yellow — understand it, not yet reliable
            </option>
            <option value="RED">Red — can’t derive the approach yet</option>
          </select>
        </label>
        <label>
          Time spent, minutes{' '}
          <span className="muted">
            {defaultMinutes ? '(from the running session)' : '(optional)'}
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
      <label>
        What did you miss? <span className="muted">(optional)</span>
        <textarea
          name="mistake"
          rows={2}
          maxLength={1000}
          placeholder="Pattern, edge case, or implementation mistake"
        />
      </label>
      <label>
        Note <span className="muted">(optional)</span>
        <textarea name="notes" rows={2} maxLength={2000} />
      </label>
      <Button>Save attempt</Button>
    </ActionForm>
  );
}
