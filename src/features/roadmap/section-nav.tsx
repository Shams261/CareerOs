'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePendingRegion } from '@/components/pending-region';

export type SectionSummary = {
  name: string;
  total: number;
  done: number;
  inProgress: number;
  due: number;
  /** The section that holds the Continue item. */
  isContinue: boolean;
};

/** Sections as a list on wide screens and a select on phones; the URL carries the choice. */
export function SectionNav({
  roadmapId,
  sections,
  selected,
}: {
  roadmapId: string;
  sections: SectionSummary[];
  selected: string;
}) {
  const router = useRouter();
  const { start } = usePendingRegion();
  const href = (name: string) =>
    `/roadmap/${roadmapId}?section=${encodeURIComponent(name)}`;
  return (
    <nav className="section-nav" aria-label="Sections">
      <label className="section-nav-select">
        <span className="sr-only">Section</span>
        <select
          value={selected}
          onChange={(e) => {
            const to = href(e.target.value);
            start(() => router.push(to));
          }}
        >
          {sections.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} · {s.total - s.done} left
            </option>
          ))}
        </select>
      </label>
      <ul className="plain-list section-nav-list">
        {sections.map((s) => (
          <li key={s.name}>
            <Link
              href={href(s.name)}
              prefetch={false}
              onClick={(e) => {
                e.preventDefault();
                const to = href(s.name);
                start(() => router.push(to));
              }}
              className={s.name === selected ? 'is-on' : ''}
              aria-current={s.name === selected ? 'true' : undefined}
            >
              <span className="section-nav-main">
                <span className="section-nav-name">
                  {s.isContinue && (
                    <span
                      className="section-nav-marker"
                      title="Continue here"
                      aria-label="Continue here"
                    />
                  )}
                  {s.name}
                </span>
              </span>
              <span className="section-nav-count">
                {s.due > 0 && (
                  <span
                    className="section-nav-due"
                    title={`${s.due} due for revision`}
                  >
                    {s.due} due
                  </span>
                )}
                {s.total - s.done ? `${s.total - s.done} left` : 'Done'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Search and status filters that apply as you type or choose; state lives in the URL. */
export function ItemFilters({ q, show }: { q: string; show: string }) {
  const router = useRouter();
  const { start } = usePendingRegion();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    setText(q);
  }
  const apply = (next: { q?: string; show?: string }) => {
    const p = new URLSearchParams(params.toString());
    const nq = next.q ?? text;
    const ns = next.show ?? show;
    if (nq) p.set('q', nq);
    else p.delete('q');
    if (ns && ns !== 'all') p.set('show', ns);
    else p.delete('show');
    start(() => router.replace(`?${p.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => apply({ q: text }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <form
      className="item-filters"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: text });
      }}
    >
      <label>
        <span className="sr-only">Search this section</span>
        <input
          type="search"
          placeholder="Search this section"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Show</span>
        <select value={show} onChange={(e) => apply({ show: e.target.value })}>
          <option value="all">Everything</option>
          <option value="open">Not done</option>
          <option value="revision">Due for revision</option>
          <option value="asked">Asked in interviews</option>
        </select>
      </label>
    </form>
  );
}
