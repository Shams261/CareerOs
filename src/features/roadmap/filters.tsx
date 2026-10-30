'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePendingRegion } from '@/components/pending-region';

/** Search and Show for the outline (WI-084: the whole roadmap); state lives in the URL. */
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
        <span className="sr-only">Search this roadmap</span>
        <input
          type="search"
          placeholder="Search this roadmap"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Show</span>
        <select value={show} onChange={(e) => apply({ show: e.target.value })}>
          <option value="all">Everything</option>
          <option value="open">Not done</option>
          <option value="p0">P0 not done</option>
          <option value="revision">Due for revision</option>
          <option value="asked">Asked in interviews</option>
        </select>
      </label>
    </form>
  );
}
