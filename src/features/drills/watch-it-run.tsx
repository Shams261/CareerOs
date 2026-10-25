'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_INPUT, parseInput, trace, TRACES, type TraceKind } from './trace';

const PLAY_MS = 1400;
const query = '(prefers-reduced-motion: reduce)';
function useReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', notify);
      return () => m.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

/**
 * Watch It Run (WI-030): the pattern traced by Silsila's own code on a small input. Step and
 * Back move one step; Play advances on its own and is not offered under reduced motion. The
 * arrow keys step while the trace has focus. Nothing is saved.
 */
export function WatchItRun({ kind }: { kind: TraceKind }) {
  const meta = TRACES[kind];
  const reduced = useReducedMotion();
  const [input, setInput] = useState(meta.sample);
  const [target, setTarget] = useState(meta.target ?? 0);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [draft, setDraft] = useState(meta.sample.join(', '));
  const [draftTarget, setDraftTarget] = useState(String(meta.target ?? ''));
  const [error, setError] = useState('');
  const run = useMemo(() => trace(kind, input, target), [kind, input, target]);
  const step = run.steps[Math.min(at, run.steps.length - 1)];
  const end = run.steps.length - 1;
  const last = at >= end;
  const live = playing && !reduced && !last;

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => setAt((n) => Math.min(n + 1, end)), PLAY_MS);
    return () => clearTimeout(timer);
  }, [live, at, end]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInput(draft, kind);
    if (parsed.error) return setError(parsed.error);
    let t = target;
    if (kind === 'binary-search') {
      t = Number(draftTarget);
      if (!Number.isInteger(t) || t < -99 || t > 99)
        return setError('The target is a whole number from -99 to 99.');
    }
    setError('');
    setInput(parsed.values!);
    setTarget(t);
    setAt(0);
    setPlaying(false);
  };

  return (
    <section className="card trace" aria-labelledby="trace-heading">
      <div className="section-head">
        <h2 id="trace-heading">Watch it run · {meta.title}</h2>
      </div>
      <p className="muted">
        {meta.question}
        {kind === 'binary-search' ? ` Target ${target}.` : ''}
      </p>
      <div
        className={`trace-stage${reduced ? '' : ' is-animated'}`}
        tabIndex={0}
        role="group"
        aria-label={`Trace, step ${at + 1} of ${run.steps.length}. Left and right arrows move.`}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          setPlaying(false);
          setAt((n) =>
            e.key === 'ArrowRight' ? Math.min(n + 1, end) : Math.max(n - 1, 0),
          );
        }}
      >
        <ol className="trace-cells" aria-hidden="true">
          {run.input.map((v, i) => {
            const inRange =
              step.range && i >= step.range[0] && i <= step.range[1];
            const marks = Object.entries(step.marks)
              .filter(([, p]) => p === i)
              .map(([m]) => m);
            const onStack = step.stack?.includes(i);
            return (
              <li
                key={i}
                className={`trace-cell${inRange ? ' in-range' : ''}${marks.length ? ' is-marked' : ''}${onStack ? ' on-stack' : ''}`}
              >
                <span className="trace-value">{v}</span>
                <span className="trace-index">{i}</span>
                <span className="trace-mark">{marks.join(' ')}</span>
              </li>
            );
          })}
        </ol>
        {step.stack && (
          <p className="trace-stack" aria-hidden="true">
            Stack:{' '}
            {step.stack.length
              ? step.stack.map((i) => run.input[i]).join(' ')
              : 'empty'}
          </p>
        )}
        <p className="trace-facts">{step.facts.join(' · ')}</p>
        <p className="trace-narration" aria-live="polite">
          <span className="muted">
            Step {at + 1} of {run.steps.length}.{' '}
          </span>
          {step.narration}
        </p>
      </div>
      <div className="actions trace-controls">
        <Button
          type="button"
          className="secondary"
          disabled={at === 0}
          onClick={() => {
            setAt((n) => Math.max(n - 1, 0));
            setPlaying(false);
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" /> Back
        </Button>
        <Button
          type="button"
          disabled={last}
          onClick={() => {
            setAt((n) => Math.min(n + 1, end));
            setPlaying(false);
          }}
        >
          Step <ChevronRight size={16} aria-hidden="true" />
        </Button>
        {!reduced && (
          <Button
            type="button"
            className="secondary"
            onClick={() => {
              if (last) setAt(0);
              setPlaying(!live);
            }}
          >
            {live ? (
              <>
                <Pause size={16} aria-hidden="true" /> Pause
              </>
            ) : (
              <>
                <Play size={16} aria-hidden="true" />
                {last ? 'Replay' : 'Play'}
              </>
            )}
          </Button>
        )}
      </div>
      <form className="trace-input" onSubmit={apply} noValidate>
        <label>
          Your numbers (up to {MAX_INPUT})
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="numeric"
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'trace-error' : undefined}
          />
        </label>
        {kind === 'binary-search' && (
          <label>
            Target
            <input
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              inputMode="numeric"
            />
          </label>
        )}
        <div className="actions">
          <Button type="submit" className="secondary small">
            Trace these
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setDraft(meta.sample.join(', '));
              setDraftTarget(String(meta.target ?? ''));
              setInput(meta.sample);
              setTarget(meta.target ?? 0);
              setAt(0);
              setPlaying(false);
              setError('');
            }}
          >
            Back to the sample
          </Button>
        </div>
        {error && (
          <p id="trace-error" className="form-message" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
