'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Disclosure } from '@/components/disclosure';

/** Search and topic apply as you type or choose; the rarer filters sit behind More filters. */
export function LibraryFilters({
  topics,
  current,
}: {
  topics: { id: string; name: string }[];
  current: {
    q: string;
    topic: string;
    confidence: string;
    difficulty: string;
    state: string;
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(current.q);
  // The URL is the source of truth; a new URL value replaces the draft (derived state, no effect).
  const [seen, setSeen] = useState(current.q);
  if (current.q !== seen) {
    setSeen(current.q);
    setQ(current.q);
  }
  const apply = (next: Partial<typeof current>) => {
    const p = new URLSearchParams(params.toString());
    const merged = { ...current, q, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('all');
    router.replace(`?${p.toString()}#library`, { scroll: false });
  };
  useEffect(() => {
    if (q === current.q) return;
    const t = setTimeout(() => apply({ q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const more = current.confidence || current.difficulty || current.state;
  return (
    <form
      className="item-filters"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q });
      }}
    >
      <label>
        <span className="sr-only">Search problems</span>
        <input
          type="search"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Topic</span>
        <select
          value={current.topic}
          onChange={(e) => apply({ topic: e.target.value })}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <Disclosure
        variant="link"
        label={more ? 'More filters · on' : 'More filters'}
        defaultOpen={!!more}
      >
        <div className="item-filters">
          <label>
            <span className="sr-only">Confidence</span>
            <select
              value={current.confidence}
              onChange={(e) => apply({ confidence: e.target.value })}
            >
              <option value="">Any confidence</option>
              <option value="RED">Red</option>
              <option value="YELLOW">Yellow</option>
              <option value="GREEN">Green</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Difficulty</span>
            <select
              value={current.difficulty}
              onChange={(e) => apply({ difficulty: e.target.value })}
            >
              <option value="">Any difficulty</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Revision</span>
            <select
              value={current.state}
              onChange={(e) => apply({ state: e.target.value })}
            >
              <option value="">Any revision state</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
              <option value="unattempted">Unattempted</option>
              <option value="unscheduled">Unscheduled</option>
            </select>
          </label>
          {(q || current.topic || more) && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setQ('');
                apply({
                  q: '',
                  topic: '',
                  confidence: '',
                  difficulty: '',
                  state: '',
                });
              }}
            >
              Clear
            </button>
          )}
        </div>
      </Disclosure>
    </form>
  );
}
