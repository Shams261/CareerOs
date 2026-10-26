'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { hintsAction } from './actions';
import {
  MODEL_LABEL,
  PROVIDER_LABEL,
  type Hints,
  type ProblemPayload,
} from './domain';

/**
 * The hint ladder on a Practice problem (WI-032). The exact four fields are shown before
 * sending; the hints then open one at a time (Space), from a nudge to the shape of the
 * approach. No solution, no code, nothing saved.
 */
export function HintLadder({
  problemId,
  payload,
  budget,
}: {
  problemId: string;
  payload: ProblemPayload;
  budget: string;
}) {
  const [hints, setHints] = useState<Hints | null>(null);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState('');
  const [spent, setSpent] = useState(budget);
  const [pending, start] = useTransition();
  const latest = useRef<HTMLLIElement>(null);

  const send = () =>
    start(async () => {
      setError('');
      const r = await hintsAction(problemId);
      if (r.budget) setSpent(r.budget);
      if (r.ok) {
        setHints(r.hints);
        setShown(1);
      } else setError(r.message);
    });
  const more = !!hints && shown < hints.hints.length;
  useEffect(() => {
    latest.current?.focus();
  }, [shown]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, button'))
        return;
      e.preventDefault();
      setShown((n) => n + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!hints)
    return (
      <div className="grill">
        <section aria-labelledby="hints-sent">
          <h3 id="hints-sent">What will be sent</h3>
          <pre className="grill-payload" aria-label="The exact text sent">
            {JSON.stringify(payload, null, 2)}
          </pre>
          <p className="grill-facts muted">
            Only these four fields; your notes and attempts never are.{' '}
            {MODEL_LABEL} · {PROVIDER_LABEL} · {spent}
          </p>
        </section>
        <Button type="button" onClick={send} disabled={pending}>
          {pending ? 'Asking for hints…' : 'Get hints'}
        </Button>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
      </div>
    );

  return (
    <div className="grill">
      <ol className="hint-list">
        {hints.hints.slice(0, shown).map((h, i) => (
          <li key={i} ref={i === shown - 1 ? latest : undefined} tabIndex={-1}>
            <span className="eyebrow">
              Hint {i + 1} · {h.focus}
            </span>
            <p>{h.hint}</p>
          </li>
        ))}
      </ol>
      {more ? (
        <Button type="button" onClick={() => setShown(shown + 1)}>
          Next hint ({shown} of {hints.hints.length})
        </Button>
      ) : (
        <p className="muted">
          That’s every hint. Try it now, then record your attempt.
        </p>
      )}
    </div>
  );
}
