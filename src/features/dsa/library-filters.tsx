'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { STATUS_FILTERS } from './domain';

/** Search and one status filter; both apply as you type or choose, through the URL. */
export function LibraryFilters({ q, status }: { q: string; status: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    setText(q);
  }
  const apply = (next: { q?: string; status?: string }) => {
    const p = new URLSearchParams(params.toString());
    const nq = next.q ?? text;
    const ns = next.status ?? status;
    if (nq) p.set('q', nq);
    else p.delete('q');
    if (ns) p.set('status', ns);
    else p.delete('status');
    p.delete('page');
    router.replace(`?${p.toString()}#library`, { scroll: false });
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
        <span className="sr-only">Search problems</span>
        <input
          type="search"
          placeholder="Search"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Status</span>
        <select
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
        >
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
