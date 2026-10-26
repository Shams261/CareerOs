'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { itemOpAction } from '@/features/roadmap/actions';
import { grillAction, keepCardAction } from './actions';
import { SentFields } from './sent-fields';
import {
  DEFAULT_TICKS,
  hasSubstance,
  MODEL_LABEL,
  PROVIDER_LABEL,
  studyInput,
  type Ladder,
  type StudyItem,
  type Ticks,
} from './domain';

type Mark = 'had' | 'partly' | 'missed';
const MARKS: [Mark, string][] = [
  ['had', 'Had it'],
  ['partly', 'Partly'],
  ['missed', 'Missed'],
];

/**
 * Grill Me (WI-031). First the exact payload, which the owner can trim; then five rungs, each
 * thought through before Reveal. The scratch box and the self-marks stay in this panel and
 * are gone when it closes; only Keep as card saves anything. Keys: Space reveals, 1–3 mark,
 * K keeps, N moves on.
 */
export function GrillMe({
  item,
  budget,
  status,
  revisionDue,
}: {
  item: StudyItem & { id: string };
  budget: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
  revisionDue: boolean;
}) {
  const [ticks, setTicks] = useState<Ticks>(() => DEFAULT_TICKS(item));
  const payload = useMemo(() => studyInput(item, ticks), [item, ticks]);
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [error, setError] = useState('');
  const [spent, setSpent] = useState(budget);
  const [pending, start] = useTransition();
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [scratch, setScratch] = useState<Record<number, string>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const revealed = useRef<HTMLUListElement>(null);
  const references = Array.isArray(item.references) && item.references.length;

  const send = () =>
    start(async () => {
      setError('');
      const r = await grillAction(item.id, ticks);
      if (r.budget) setSpent(r.budget);
      if (r.ok) {
        setLadder(r.ladder);
        setAt(0);
      } else setError(r.message);
    });
  const reveal = (i: number) => {
    setShown((s) => new Set(s).add(i));
    setTimeout(() => revealed.current?.focus(), 0);
  };
  useEffect(() => {
    if (ladder) heading.current?.focus();
  }, [ladder, at]);
  const done = !!ladder && at >= ladder.rungs.length;
  useEffect(() => {
    if (!ladder || done) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('textarea, input')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && !shown.has(at)) {
        e.preventDefault();
        reveal(at);
      } else if (['1', '2', '3'].includes(key) && shown.has(at)) {
        setMarks((m) => ({ ...m, [at]: MARKS[Number(key) - 1][0] }));
      } else if (key === 'k' && shown.has(at)) {
        document
          .querySelector<HTMLButtonElement>('[data-grill-keep] button')
          ?.click();
      } else if (key === 'n' && shown.has(at)) {
        setAt(at + 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!ladder)
    return (
      <div className="grill">
        <section aria-labelledby="grill-sent">
          <h3 id="grill-sent">What will be sent</h3>
          <fieldset className="grill-ticks">
            <legend className="sr-only">Fields to send</legend>
            {(
              [
                ['title', 'Title', item.title],
                ['scope', 'Scope', item.scope],
                ['checkpoint', 'Done when', item.checkpoint],
              ] as const
            ).map(([key, label, value]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={ticks[key] && !!value?.trim()}
                  disabled={!value?.trim()}
                  onChange={(e) =>
                    setTicks((t) => ({ ...t, [key]: e.target.checked }))
                  }
                />
                {label}
                {!value?.trim() && <span className="muted"> · empty</span>}
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={ticks.references && !!references}
                disabled={!references}
                onChange={(e) =>
                  setTicks((t) => ({ ...t, references: e.target.checked }))
                }
              />
              Reference names <span className="muted">· without links</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={false} disabled readOnly />
              Your note <span className="muted">· never sent</span>
            </label>
          </fieldset>
          <SentFields payload={payload} noteRow={false} />
          <p className="grill-facts muted">
            {MODEL_LABEL} · {PROVIDER_LABEL} · {spent}
          </p>
        </section>
        {!hasSubstance(payload) ? (
          <p className="form-message" role="status">
            Add a scope or “done when” line for better questions.
          </p>
        ) : (
          <Button type="button" onClick={send} disabled={pending}>
            {pending ? 'Building the ladder…' : 'Send and start'}
          </Button>
        )}
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
      </div>
    );

  if (done) {
    const count = (m: Mark) =>
      Object.values(marks).filter((v) => v === m).length;
    return (
      <div className="grill">
        <h3 ref={heading} tabIndex={-1}>
          Ladder done
        </h3>
        <p>
          Had it {count('had')} · Partly {count('partly')} · Missed{' '}
          {count('missed')}
          {kept.size
            ? ` · ${kept.size} kept as ${kept.size === 1 ? 'a card' : 'cards'}`
            : ''}
        </p>
        <p className="muted">These marks are not saved.</p>
        {(status !== 'DONE' || revisionDue) && (
          <ActionForm action={itemOpAction} broadcast="roadmap-items">
            <input type="hidden" name="id" value={item.id} />
            <Button
              className="small"
              name="op"
              value={status === 'DONE' ? 'revised' : 'done'}
            >
              <Check size={14} aria-hidden="true" />{' '}
              {status === 'DONE' ? 'Mark revised' : 'Done'}
            </Button>
          </ActionForm>
        )}
        <Button
          type="button"
          className="secondary small"
          onClick={() => setAt(0)}
        >
          Back to the first rung
        </Button>
      </div>
    );
  }

  const rung = ladder.rungs[at];
  const open = shown.has(at);
  return (
    <div className="grill">
      <p className="eyebrow">
        Rung {at + 1} of {ladder.rungs.length} · {rung.change}
      </p>
      <h3 ref={heading} tabIndex={-1} className="grill-question">
        {rung.question}
      </h3>
      <label>
        Think first <span className="muted">(stays on this device)</span>
        <textarea
          rows={3}
          value={scratch[at] ?? ''}
          onChange={(e) => setScratch((s) => ({ ...s, [at]: e.target.value }))}
        />
      </label>
      {!open ? (
        <Button type="button" onClick={() => reveal(at)}>
          Reveal what a strong answer covers
        </Button>
      ) : (
        <>
          <ul className="grill-points" ref={revealed} tabIndex={-1}>
            {rung.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div
            className="grill-marks"
            role="group"
            aria-label="How did you do?"
          >
            {MARKS.map(([m, label], i) => (
              <button
                key={m}
                type="button"
                className={`button secondary small${marks[at] === m ? ' is-on' : ''}`}
                aria-pressed={marks[at] === m}
                onClick={() => setMarks((s) => ({ ...s, [at]: m }))}
              >
                <span className="drill-key" aria-hidden="true">
                  {i + 1}
                </span>{' '}
                {label}
              </button>
            ))}
          </div>
          <div className="actions grill-next">
            <span data-grill-keep>
              {kept.has(at) ? (
                <span className="pill success">Kept as a card</span>
              ) : (
                <ActionForm
                  action={keepCardAction}
                  onSettled={(r) => {
                    if (r.ok) setKept((k) => new Set(k).add(at));
                  }}
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="question" value={rung.question} />
                  <input type="hidden" name="change" value={rung.change} />
                  <input
                    type="hidden"
                    name="points"
                    value={JSON.stringify(rung.points)}
                  />
                  <Button className="secondary small">Keep as card</Button>
                </ActionForm>
              )}
            </span>
            <Button
              type="button"
              className="small"
              onClick={() => setAt(at + 1)}
            >
              {at + 1 < ladder.rungs.length ? 'Next rung' : 'Finish'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
