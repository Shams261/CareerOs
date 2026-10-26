'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { itemOpAction } from '@/features/roadmap/actions';

type Mark = 'had' | 'partly' | 'missed';
const MARKS: [Mark, string][] = [
  ['had', 'Had it'],
  ['partly', 'Partly'],
  ['missed', 'Missed'],
];
type Card = {
  id: string;
  roadmapItemId: string;
  question: string;
  change: string | null;
  points: string[];
};
type Item = { id: string; title: string; href: string; roadmap: string };

/**
 * The revision deck (WI-032): one kept card at a time. Space shows the points, 1–3 marks it
 * and moves on. When every card of an item is marked, that item's Mark revised is offered;
 * nothing is marked on its own and the marks are not saved.
 */
export function RevisionDeck({
  items,
  cards,
}: {
  items: Item[];
  cards: Card[];
}) {
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const done = at >= cards.length;
  const card = cards[at];
  const item = card ? items.find((i) => i.id === card.roadmapItemId) : null;

  const mark = (m: Mark) => {
    if (!card) return;
    setMarks((s) => ({ ...s, [card.id]: m }));
    setOpen(false);
    setAt(at + 1);
  };
  useEffect(() => {
    heading.current?.focus();
  }, [at]);
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (e.key === ' ' && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (['1', '2', '3'].includes(e.key) && open) {
        mark(MARKS[Number(e.key) - 1][0]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Items whose every card has a mark: their own Mark revised is offered.
  const finished = items.filter((i) =>
    cards.filter((c) => c.roadmapItemId === i.id).every((c) => marks[c.id]),
  );

  if (done) {
    const count = (m: Mark) =>
      Object.values(marks).filter((v) => v === m).length;
    return (
      <section className="drill-card" aria-labelledby="deck-done">
        <h2 id="deck-done" ref={heading} tabIndex={-1}>
          That’s today’s revision.
        </h2>
        <p>
          Had it {count('had')} · Partly {count('partly')} · Missed{' '}
          {count('missed')}
        </p>
        <p className="muted">These marks are not saved.</p>
        <ul className="plain-list deck-items">
          {finished.map((i) => (
            <li key={i.id}>
              <span>
                <Link className="link" href={i.href} prefetch={false}>
                  {i.title}
                </Link>
                <span className="muted"> · {i.roadmap}</span>
              </span>
              <ActionForm
                action={itemOpAction}
                label={`Mark ${i.title} revised`}
                broadcast="deck"
              >
                <input type="hidden" name="id" value={i.id} />
                <Button className="small" name="op" value="revised">
                  <Check size={14} aria-hidden="true" /> Mark revised
                </Button>
              </ActionForm>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          className="secondary"
          onClick={() => {
            setMarks({});
            setAt(0);
          }}
        >
          Go through again
        </Button>
      </section>
    );
  }

  return (
    <section className="drill-card" aria-labelledby="deck-question">
      <p className="eyebrow">
        Card {at + 1} of {cards.length}
        {item ? ` · ${item.title}` : ''}
      </p>
      <h2
        id="deck-question"
        ref={heading}
        tabIndex={-1}
        className="grill-question"
      >
        {card.question}
      </h2>
      {card.change && <p className="muted">{card.change}</p>}
      {!open ? (
        <Button type="button" onClick={() => setOpen(true)}>
          Show the points
        </Button>
      ) : (
        <>
          <ul className="grill-points">
            {card.points.map((p) => (
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
                className="button secondary small"
                onClick={() => mark(m)}
              >
                <span className="drill-key" aria-hidden="true">
                  {i + 1}
                </span>{' '}
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
