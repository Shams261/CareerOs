'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { drillResult, type Card, type Pick } from './deck';

const level = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;

/**
 * Which Pattern? (WI-030): one card at a time, four patterns to choose from, then the
 * answer and its signal. The picks stay in this page; nothing is saved or recorded as an
 * attempt. Keys 1–4 pick, Enter moves on.
 */
export function WhichPattern({ deck }: { deck: Card[] }) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = deck[index];
  const picked = picks[index]?.picked ?? null;
  const done = index >= deck.length;

  const choose = (option: string) => {
    if (picked || !card) return;
    setPicks((p) => [...p, { answer: card.answer, picked: option }]);
  };
  useEffect(() => {
    heading.current?.focus();
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done || picked || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= card.options.length) {
        e.preventDefault();
        choose(card.options[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (done) {
    const result = drillResult(picks);
    return (
      <section className="drill-card" aria-labelledby="drill-result">
        <h2 id="drill-result" ref={heading} tabIndex={-1}>
          {result.line}
        </h2>
        {result.mixedUp.length ? (
          <>
            <p className="muted">Mixed up</p>
            <ul className="drill-mixed">
              {result.mixedUp.map((pair) => (
                <li key={pair}>{pair}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>No patterns mixed up this time.</p>
        )}
        <div className="actions">
          <Button
            type="button"
            onClick={() => {
              setPicks([]);
              setIndex(0);
            }}
          >
            Drill again
          </Button>
          <Link className="button secondary" href="/dsa" prefetch={false}>
            Back to Practice
          </Link>
        </div>
      </section>
    );
  }

  const right = picked === card.answer;
  return (
    <section className="drill-card" aria-labelledby="drill-title">
      <p className="eyebrow">
        Card {index + 1} of {deck.length} · {level[card.difficulty]}
      </p>
      <h2 id="drill-title" ref={heading} tabIndex={-1}>
        {card.title}
      </h2>
      <fieldset className="drill-options">
        <legend className="muted">Which pattern solves it?</legend>
        {card.options.map((option, i) => {
          const state = !picked
            ? ''
            : option === card.answer
              ? ' is-answer'
              : option === picked
                ? ' is-picked'
                : ' is-dim';
          return (
            <button
              key={option}
              type="button"
              className={`drill-option${state}`}
              aria-pressed={picked ? option === picked : undefined}
              disabled={!!picked && option !== picked && option !== card.answer}
              onClick={() => choose(option)}
            >
              <span className="drill-key" aria-hidden="true">
                {i + 1}
              </span>
              <span>{option}</span>
              {picked && option === card.answer && (
                <Check size={16} aria-label="The pattern" />
              )}
              {picked && option === picked && !right && (
                <X size={16} aria-label="Your pick" />
              )}
            </button>
          );
        })}
      </fieldset>
      <div aria-live="polite">
        {picked && (
          <div className="drill-reveal">
            <p>
              <b>{right ? 'Yes' : 'Not quite'}.</b> {card.answer}
              {card.signal ? `: ${card.signal}` : '.'}
            </p>
            <p className="drill-reveal-links">
              <Link
                className="link"
                href={`/dsa/${card.problemId}`}
                prefetch={false}
              >
                Open the problem
              </Link>
            </p>
          </div>
        )}
      </div>
      {picked && (
        <Button type="button" autoFocus onClick={() => setIndex(index + 1)}>
          {index + 1 < deck.length ? 'Next card' : 'See how it went'}
        </Button>
      )}
    </section>
  );
}
