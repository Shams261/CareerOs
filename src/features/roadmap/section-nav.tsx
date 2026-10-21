'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export type SectionSummary = {
  name: string;
  total: number;
  done: number;
  due: number;
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
  const href = (name: string) =>
    `/roadmap/${roadmapId}?section=${encodeURIComponent(name)}`;
  return (
    <nav className="section-nav" aria-label="Sections">
      <label className="section-nav-select">
        <span className="sr-only">Section</span>
        <select
          value={selected}
          onChange={(e) => router.push(href(e.target.value))}
        >
          {sections.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} · {s.done} of {s.total}
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
              className={s.name === selected ? 'is-on' : ''}
              aria-current={s.name === selected ? 'true' : undefined}
            >
              <span className="section-nav-name">{s.name}</span>
              <span className="section-nav-count">
                {s.due > 0 && (
                  <span
                    className="section-nav-due"
                    title={`${s.due} due for revision`}
                  >
                    {s.due} due
                  </span>
                )}
                {s.done}/{s.total}
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
    router.replace(`?${p.toString()}`, { scroll: false });
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
          placeholder="Search"
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
